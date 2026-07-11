"""
FinesseWins — NAICS watch engine

The differentiator: a user saves their NAICS codes once, and FinesseWins watches
EVERY bid site (federal contracts, grants, DoD, state/local) twice a day and
surfaces anything new that matches — in one feed, with an email digest.

`run_for_profile()` does one sweep for one user and returns the newly-found
matches (also persisted to the MatchStore). It's shared by:
  • the twice-daily scheduler loop (scheduler.py)
  • the "Check now" button (POST /api/alerts/run)
"""
from __future__ import annotations

from typing import List, Optional

from sources import search_all
from db import matches as match_store, profiles as profile_store
from email_service import send_naics_digest


def _naics_match(result: dict, code: str, has_keywords: bool) -> bool:
    """Does a search result count as a hit for this watched code?"""
    rc = (result.get("naics_code") or "").strip()
    if rc:
        return rc == code or rc[:4] == code[:4]   # exact or same industry group
    # No NAICS on the record (e.g. grants): only include when the user gave
    # keywords, so the source already keyword-filtered it — avoids noise.
    return has_keywords


async def _find_matches(codes: List[str], keywords: str, max_per_code: int = 25) -> List[dict]:
    """Search all sources for each watched code; return normalized match rows."""
    has_kw = bool(keywords and keywords.strip())
    found: dict = {}   # opportunity_id -> row (dedupe within this sweep)
    for code in codes:
        code = str(code).strip()
        if not code:
            continue
        try:
            data = await search_all(
                keywords=keywords or "",
                naics_code=code,
                max_results=max_per_code,
            )
        except Exception as e:
            print(f"[alerts] search failed for NAICS {code}: {e}")
            continue
        for r in data.get("results", []):
            if not _naics_match(r, code, has_kw):
                continue
            oid = r.get("id") or r.get("solicitation_number")
            if not oid or oid in found:
                continue
            found[oid] = {
                "opportunity_id": oid,
                "source": r.get("source"),
                "solicitation_number": r.get("solicitation_number"),
                "title": r.get("title"),
                "agency": r.get("agency"),
                "naics_code": r.get("naics_code"),
                "matched_naics": code,
                "set_aside": r.get("set_aside"),
                "deadline": r.get("deadline"),
                "url": r.get("url"),
                "type": r.get("type"),
            }
    return list(found.values())


async def matches_for(codes: List[str], keywords: str = "") -> List[dict]:
    """Public: find current opportunities across all sources for a set of NAICS codes."""
    return await _find_matches([c for c in codes if c], keywords or "")


async def run_for_profile(profile: dict, send_email: bool = True) -> List[dict]:
    """One sweep for one user. Persists + optionally emails new matches. Returns new rows."""
    user_id = profile.get("user_id")
    codes = profile.get("watched_naics") or []
    if not user_id or not codes:
        return []

    candidates = await _find_matches(codes, profile.get("alert_keywords") or "")
    new_rows = await match_store.add_new(user_id, candidates)

    if new_rows and send_email:
        to = profile.get("alert_email") or profile.get("email")
        if to:
            res = await send_naics_digest(to, new_rows, codes)
            if res.get("sent"):
                await match_store.mark_notified(user_id, [r["opportunity_id"] for r in new_rows])
    return new_rows


async def run_all() -> int:
    """Sweep every alert-enabled profile. Returns total new matches found."""
    total = 0
    for profile in await profile_store.all_with_alerts():
        try:
            total += len(await run_for_profile(profile))
        except Exception as e:
            print(f"[alerts] sweep failed for {profile.get('user_id')}: {e}")
    return total
