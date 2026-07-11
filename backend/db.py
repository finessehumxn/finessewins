"""
FinesseWins — Data layer (Supabase Postgres, with in-memory fallback)

Replaces the old in-memory-only ProposalStore. If SUPABASE_URL and
SUPABASE_SERVICE_KEY are set, everything is persisted to Postgres and scoped to
the authenticated user. If they aren't (local dev with no Supabase), it falls
back to an in-memory store so the app still runs.

The public surface is intentionally the same shape the rest of the app already
uses (create/get/update/list_all/delete), plus profile + tracked-solicitation
helpers, so main.py changes stay small.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime
from typing import Optional, List

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

_client = None


def supabase_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def get_client():
    """Lazily build a service-role Supabase client (bypasses RLS; backend scopes by user_id)."""
    global _client
    if _client is None and supabase_enabled():
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


# ─────────────────────────────────────────────────────────────────────────────
# PROPOSALS
# ─────────────────────────────────────────────────────────────────────────────
class ProposalStore:
    """Supabase-backed proposal store, with a per-process in-memory fallback."""

    def __init__(self):
        self._mem: dict = {}
        self._lock = asyncio.Lock()

    async def create(self, proposal_id: str, data: dict):
        if supabase_enabled():
            row = {**data, "id": proposal_id}
            row.setdefault("volumes", {})
            await asyncio.to_thread(
                lambda: get_client().table("proposals").insert(_clean(row)).execute()
            )
        else:
            async with self._lock:
                self._mem[proposal_id] = data

    async def get(self, proposal_id: str, user_id: Optional[str] = None) -> Optional[dict]:
        if supabase_enabled():
            def _q():
                q = get_client().table("proposals").select("*").eq("id", proposal_id)
                if user_id:
                    q = q.eq("user_id", user_id)
                res = q.limit(1).execute()
                return res.data[0] if res.data else None
            return await asyncio.to_thread(_q)
        row = self._mem.get(proposal_id)
        if row and user_id and row.get("user_id") not in (None, user_id):
            return None
        return row

    async def update(self, proposal_id: str, updates: dict):
        if supabase_enabled():
            await asyncio.to_thread(
                lambda: get_client().table("proposals")
                .update(_clean(updates)).eq("id", proposal_id).execute()
            )
        else:
            async with self._lock:
                if proposal_id in self._mem:
                    self._mem[proposal_id].update(updates)

    async def list_all(self, user_id: Optional[str] = None) -> List[dict]:
        if supabase_enabled():
            def _q():
                q = get_client().table("proposals").select("*")
                if user_id:
                    q = q.eq("user_id", user_id)
                return q.order("created_at", desc=True).execute().data or []
            return await asyncio.to_thread(_q)
        rows = list(self._mem.values())
        if user_id:
            rows = [r for r in rows if r.get("user_id") in (None, user_id)]
        return sorted(rows, key=lambda r: r.get("created_at", ""), reverse=True)

    async def delete(self, proposal_id: str, user_id: Optional[str] = None):
        if supabase_enabled():
            def _q():
                q = get_client().table("proposals").delete().eq("id", proposal_id)
                if user_id:
                    q = q.eq("user_id", user_id)
                q.execute()
            await asyncio.to_thread(_q)
        else:
            async with self._lock:
                self._mem.pop(proposal_id, None)

    async def count_this_month(self, user_id: str) -> int:
        """Number of proposals this user created since the start of the UTC month."""
        month_start = datetime.utcnow().replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        ).isoformat()
        if supabase_enabled():
            def _q():
                res = (
                    get_client().table("proposals").select("id", count="exact")
                    .eq("user_id", user_id).gte("created_at", month_start).execute()
                )
                return res.count or 0
            return await asyncio.to_thread(_q)
        return sum(
            1 for r in self._mem.values()
            if r.get("user_id") == user_id and str(r.get("created_at", "")) >= month_start
        )

    async def due_soon(self, within_days: int = 3) -> List[dict]:
        """Complete proposals whose deadline is within `within_days` — for reminders."""
        if supabase_enabled():
            def _q():
                return (
                    get_client().table("proposals").select("*")
                    .eq("status", "complete").not_.is_("deadline", "null")
                    .execute().data or []
                )
            rows = await asyncio.to_thread(_q)
        else:
            rows = [r for r in self._mem.values() if r.get("status") == "complete"]
        return _filter_due(rows, within_days)


# ─────────────────────────────────────────────────────────────────────────────
# COMPANY PROFILES
# ─────────────────────────────────────────────────────────────────────────────
class ProfileStore:
    def __init__(self):
        self._mem: dict = {}
        self._lock = asyncio.Lock()

    async def get(self, user_id: str) -> Optional[dict]:
        if supabase_enabled():
            def _q():
                res = (
                    get_client().table("company_profiles").select("*")
                    .eq("user_id", user_id).limit(1).execute()
                )
                return res.data[0] if res.data else None
            return await asyncio.to_thread(_q)
        return self._mem.get(user_id)

    async def upsert(self, user_id: str, profile: dict) -> dict:
        row = {**profile, "user_id": user_id}
        if supabase_enabled():
            def _q():
                return (
                    get_client().table("company_profiles")
                    .upsert(_clean(row), on_conflict="user_id").execute().data
                )
            data = await asyncio.to_thread(_q)
            return (data or [row])[0]
        async with self._lock:
            merged = {**self._mem.get(user_id, {}), **row}
            self._mem[user_id] = merged
        return merged

    async def set_plan(self, user_id: str, plan: str, stripe_customer_id: Optional[str] = None):
        """Set a user's subscription plan (called from the Stripe webhook)."""
        patch = {"user_id": user_id, "plan": plan}
        if stripe_customer_id:
            patch["stripe_customer_id"] = stripe_customer_id
        if supabase_enabled():
            await asyncio.to_thread(
                lambda: get_client().table("company_profiles")
                .upsert(patch, on_conflict="user_id").execute()
            )
        else:
            async with self._lock:
                existing = self._mem.get(user_id, {"user_id": user_id})
                existing.update(patch)
                self._mem[user_id] = existing

    async def get_by_customer(self, stripe_customer_id: str) -> Optional[dict]:
        if supabase_enabled():
            def _q():
                res = (
                    get_client().table("company_profiles").select("*")
                    .eq("stripe_customer_id", stripe_customer_id).limit(1).execute()
                )
                return res.data[0] if res.data else None
            return await asyncio.to_thread(_q)
        for row in self._mem.values():
            if row.get("stripe_customer_id") == stripe_customer_id:
                return row
        return None

    async def all_with_alerts(self) -> List[dict]:
        """Profiles that have alerts on AND at least one watched NAICS code."""
        if supabase_enabled():
            def _q():
                return (
                    get_client().table("company_profiles").select("*")
                    .eq("alerts_enabled", True).execute().data or []
                )
            rows = await asyncio.to_thread(_q)
        else:
            rows = [r for r in self._mem.values() if r.get("alerts_enabled", True)]
        return [r for r in rows if (r.get("watched_naics") or [])]


# ─────────────────────────────────────────────────────────────────────────────
# TRACKED SOLICITATIONS  (amendment monitoring)
# ─────────────────────────────────────────────────────────────────────────────
class TrackedStore:
    def __init__(self):
        self._mem: list = []
        self._lock = asyncio.Lock()

    async def track(self, user_id: str, solicitation_number: str, **extra) -> dict:
        row = {
            "user_id": user_id,
            "solicitation_number": solicitation_number,
            "known_amendments": extra.get("known_amendments", []),
            "title": extra.get("title"),
            "deadline": extra.get("deadline"),
            "notify_email": extra.get("notify_email"),
            "last_checked": datetime.utcnow().isoformat(),
        }
        if supabase_enabled():
            def _q():
                return (
                    get_client().table("tracked_solicitations")
                    .upsert(_clean(row), on_conflict="user_id,solicitation_number")
                    .execute().data
                )
            data = await asyncio.to_thread(_q)
            return (data or [row])[0]
        async with self._lock:
            self._mem = [
                r for r in self._mem
                if not (r["user_id"] == user_id and r["solicitation_number"] == solicitation_number)
            ]
            self._mem.append(row)
        return row

    async def all(self) -> List[dict]:
        if supabase_enabled():
            return await asyncio.to_thread(
                lambda: get_client().table("tracked_solicitations").select("*").execute().data or []
            )
        return list(self._mem)

    async def update_amendments(self, row_id_or_key, known_amendments: List[str]):
        if supabase_enabled():
            await asyncio.to_thread(
                lambda: get_client().table("tracked_solicitations")
                .update({"known_amendments": known_amendments,
                         "last_checked": datetime.utcnow().isoformat()})
                .eq("id", row_id_or_key).execute()
            )
        else:
            for r in self._mem:
                if r.get("solicitation_number") == row_id_or_key:
                    r["known_amendments"] = known_amendments
                    r["last_checked"] = datetime.utcnow().isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────────
def _clean(row: dict) -> dict:
    """Drop keys Postgres doesn't have a column for isn't necessary here, but we
    do drop None-only noise and keep JSON-serializable values."""
    return {k: v for k, v in row.items() if v is not None or k in ("error",)}


def _filter_due(rows: List[dict], within_days: int) -> List[dict]:
    due = []
    now = datetime.utcnow()
    for r in rows:
        dl = r.get("deadline")
        if not dl:
            continue
        try:
            deadline = datetime.fromisoformat(str(dl).replace("Z", "").replace("+00:00", ""))
        except Exception:
            continue
        days_left = (deadline - now).days
        if 0 <= days_left <= within_days:
            due.append({**r, "days_left": days_left})
    return due


# ─────────────────────────────────────────────────────────────────────────────
# OPPORTUNITY MATCHES  (the unified NAICS-alert feed)
# ─────────────────────────────────────────────────────────────────────────────
class MatchStore:
    def __init__(self):
        self._mem: list = []
        self._lock = asyncio.Lock()

    async def _existing_ids(self, user_id: str) -> set:
        if supabase_enabled():
            def _q():
                return (
                    get_client().table("opportunity_matches")
                    .select("opportunity_id").eq("user_id", user_id).execute().data or []
                )
            rows = await asyncio.to_thread(_q)
            return {r["opportunity_id"] for r in rows}
        return {r["opportunity_id"] for r in self._mem if r["user_id"] == user_id}

    async def add_new(self, user_id: str, rows: List[dict]) -> List[dict]:
        """Insert only opportunities not already recorded for this user. Returns the new rows."""
        existing = await self._existing_ids(user_id)
        fresh, seen_now = [], set()
        for r in rows:
            oid = r.get("opportunity_id")
            if not oid or oid in existing or oid in seen_now:
                continue
            seen_now.add(oid)
            fresh.append({**r, "user_id": user_id})
        if not fresh:
            return []
        if supabase_enabled():
            await asyncio.to_thread(
                lambda: get_client().table("opportunity_matches").insert(
                    [_clean(x) for x in fresh]
                ).execute()
            )
        else:
            async with self._lock:
                for x in fresh:
                    x.setdefault("seen", False)
                    x.setdefault("notified", False)
                    x.setdefault("created_at", datetime.utcnow().isoformat())
                    self._mem.append(x)
        return fresh

    async def list_for_user(self, user_id: str, unseen_only: bool = False, limit: int = 100) -> List[dict]:
        if supabase_enabled():
            def _q():
                q = get_client().table("opportunity_matches").select("*").eq("user_id", user_id)
                if unseen_only:
                    q = q.eq("seen", False)
                return q.order("created_at", desc=True).limit(limit).execute().data or []
            return await asyncio.to_thread(_q)
        rows = [r for r in self._mem if r["user_id"] == user_id and (not unseen_only or not r.get("seen"))]
        return sorted(rows, key=lambda r: r.get("created_at", ""), reverse=True)[:limit]

    async def count_unseen(self, user_id: str) -> int:
        if supabase_enabled():
            def _q():
                return (
                    get_client().table("opportunity_matches")
                    .select("id", count="exact").eq("user_id", user_id).eq("seen", False)
                    .execute().count or 0
                )
            return await asyncio.to_thread(_q)
        return sum(1 for r in self._mem if r["user_id"] == user_id and not r.get("seen"))

    async def mark_seen(self, user_id: str, match_ids: Optional[List[str]] = None):
        if supabase_enabled():
            def _q():
                q = get_client().table("opportunity_matches").update({"seen": True}).eq("user_id", user_id)
                if match_ids:
                    q = q.in_("id", match_ids)
                q.execute()
            await asyncio.to_thread(_q)
        else:
            for r in self._mem:
                if r["user_id"] == user_id and (not match_ids or r.get("id") in match_ids):
                    r["seen"] = True

    async def mark_notified(self, user_id: str, opportunity_ids: List[str]):
        if not opportunity_ids:
            return
        if supabase_enabled():
            await asyncio.to_thread(
                lambda: get_client().table("opportunity_matches").update({"notified": True})
                .eq("user_id", user_id).in_("opportunity_id", opportunity_ids).execute()
            )
        else:
            for r in self._mem:
                if r["user_id"] == user_id and r.get("opportunity_id") in opportunity_ids:
                    r["notified"] = True


# ─────────────────────────────────────────────────────────────────────────────
# ORG CLIENTS  (businesses an advisor/accelerator manages)
# ─────────────────────────────────────────────────────────────────────────────
class ClientStore:
    def __init__(self):
        self._mem: dict = {}          # client_id -> row
        self._lock = asyncio.Lock()

    async def list(self, advisor_id: str) -> List[dict]:
        if supabase_enabled():
            def _q():
                return (
                    get_client().table("org_clients").select("*")
                    .eq("advisor_id", advisor_id).order("created_at", desc=True)
                    .execute().data or []
                )
            return await asyncio.to_thread(_q)
        rows = [r for r in self._mem.values() if r.get("advisor_id") == advisor_id]
        return sorted(rows, key=lambda r: r.get("created_at", ""), reverse=True)

    async def get(self, advisor_id: str, client_id: str) -> Optional[dict]:
        if supabase_enabled():
            def _q():
                res = (
                    get_client().table("org_clients").select("*")
                    .eq("id", client_id).eq("advisor_id", advisor_id).limit(1).execute()
                )
                return res.data[0] if res.data else None
            return await asyncio.to_thread(_q)
        row = self._mem.get(client_id)
        return row if row and row.get("advisor_id") == advisor_id else None

    async def create(self, advisor_id: str, data: dict) -> dict:
        row = {
            "advisor_id": advisor_id,
            "name": data.get("name", "").strip() or "Unnamed business",
            "contact_email": data.get("contact_email"),
            "certifications": data.get("certifications", []),
            "naics_codes": data.get("naics_codes", []),
            "stage": data.get("stage", "lead"),
            "bids_submitted": int(data.get("bids_submitted", 0) or 0),
            "bids_won": int(data.get("bids_won", 0) or 0),
            "dollars_won": float(data.get("dollars_won", 0) or 0),
            "notes": data.get("notes"),
        }
        if supabase_enabled():
            def _q():
                return get_client().table("org_clients").insert(_clean(row)).execute().data
            data_out = await asyncio.to_thread(_q)
            return (data_out or [row])[0]
        row["id"] = str(uuid.uuid4())
        row["created_at"] = datetime.utcnow().isoformat()
        async with self._lock:
            self._mem[row["id"]] = row
        return row

    async def update(self, advisor_id: str, client_id: str, patch: dict) -> Optional[dict]:
        allowed = {"name", "contact_email", "certifications", "naics_codes", "stage",
                   "bids_submitted", "bids_won", "dollars_won", "notes"}
        clean = {k: v for k, v in patch.items() if k in allowed and v is not None}
        if not clean:
            return await self.get(advisor_id, client_id)
        if supabase_enabled():
            def _q():
                return (
                    get_client().table("org_clients").update(clean)
                    .eq("id", client_id).eq("advisor_id", advisor_id).execute().data
                )
            data_out = await asyncio.to_thread(_q)
            return (data_out or [None])[0]
        async with self._lock:
            row = self._mem.get(client_id)
            if row and row.get("advisor_id") == advisor_id:
                row.update(clean)
                return row
        return None

    async def delete(self, advisor_id: str, client_id: str):
        if supabase_enabled():
            def _q():
                get_client().table("org_clients").delete().eq("id", client_id).eq("advisor_id", advisor_id).execute()
            await asyncio.to_thread(_q)
        else:
            async with self._lock:
                row = self._mem.get(client_id)
                if row and row.get("advisor_id") == advisor_id:
                    self._mem.pop(client_id, None)


# Shared singletons
proposals = ProposalStore()
profiles = ProfileStore()
tracked = TrackedStore()
matches = MatchStore()
clients = ClientStore()
