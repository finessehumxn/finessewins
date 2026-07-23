"""
FinesseWins — USAspending.gov client (real federal award data)

USAspending.gov is the official, free, keyless public API for every federal
award. We use it to ground the Winnability Engine in reality instead of vibes:
who actually wins in a NAICS/agency, what they were paid, and how much of the
money goes to small / WOSB / 8(a) firms.

Docs: https://api.usaspending.gov/
"""
from __future__ import annotations

import statistics
from datetime import datetime
from typing import List, Optional

import httpx

BASE = "https://api.usaspending.gov/api/v2"
CONTRACT_TYPES = ["A", "B", "C", "D"]   # definitive contracts + IDV children

# Set-aside code groups (USAspending `set_aside_type_codes`)
SMALL_BIZ_CODES = ["SBA", "SBP", "ISBEE", "IEE", "8A", "8AN", "HZC", "HZS",
                   "SDVOSBC", "SDVOSBS", "WOSB", "WOSBSS", "EDWOSB", "EDWOSBSS"]
CERT_SETASIDE_CODES = {
    "WOSB": ["WOSB", "WOSBSS", "EDWOSB", "EDWOSBSS"],
    "EDWOSB": ["EDWOSB", "EDWOSBSS"],
    "8a": ["8A", "8AN"],
    "8(a)": ["8A", "8AN"],
    "HUBZone": ["HZC", "HZS"],
    "SDVOSB": ["SDVOSBC", "SDVOSBS"],
    "MBE": ["SBA", "SBP"],          # no federal MBE set-aside; small-biz proxy
    "Black-Owned": ["SBA", "SBP"],
    "DBE": ["SBA", "SBP"],
}

_RECENT_YEARS = 3


def _time_period() -> List[dict]:
    now = datetime.utcnow()
    start = now.replace(year=now.year - _RECENT_YEARS)
    return [{"start_date": start.strftime("%Y-%m-%d"), "end_date": now.strftime("%Y-%m-%d")}]


def _filters(naics: str, agency: Optional[str], set_aside_codes: Optional[List[str]]) -> dict:
    f = {
        "award_type_codes": CONTRACT_TYPES,
        "naics_codes": [naics],
        "time_period": _time_period(),
    }
    if agency:
        f["agencies"] = [{"type": "awarding", "tier": "toptier", "name": agency}]
    if set_aside_codes:
        f["set_aside_type_codes"] = set_aside_codes
    return f


def codes_for_setaside(set_aside: Optional[str]) -> Optional[List[str]]:
    """Map a solicitation's set-aside to the USAspending codes for its comps.
    Returns None for full-and-open (caller uses the broad small-biz pool)."""
    if not set_aside:
        return None
    s = set_aside.upper().replace("(", "").replace(")", "")
    if "WOSB" in s or "WOMEN" in s:
        return ["WOSB", "WOSBSS", "EDWOSB", "EDWOSBSS"]
    if "8A" in s or s.strip() == "8A":
        return ["8A", "8AN"]
    if "HUBZONE" in s or "HZ" in s:
        return ["HZC", "HZS"]
    if "SDVOSB" in s or "SERVICE-DISABLED" in s or "VETERAN" in s:
        return ["SDVOSBC", "SDVOSBS"]
    if "SBA" in s or "SMALL" in s:
        return SMALL_BIZ_CODES
    return None


async def award_search(
    naics: str,
    agency: Optional[str] = None,
    set_aside_codes: Optional[List[str]] = None,
    limit: int = 100,
    page: int = 1,
) -> List[dict]:
    """Recent contract awards for a NAICS (+ optional agency / set-aside).

    Sorted by award amount (the only reliably-sortable field). For the price-to-win
    band we pass a set-aside-filtered pool, which already excludes billion-dollar
    primes, so this stays representative of what small firms actually win."""
    body = {
        "filters": _filters(naics, agency, set_aside_codes),
        "fields": ["Award ID", "Recipient Name", "Award Amount",
                   "Awarding Agency", "Awarding Sub Agency",
                   "Start Date", "End Date", "recipient_id"],
        "page": max(1, page), "limit": min(limit, 100),
        "sort": "Award Amount", "order": "desc",
    }
    data = await _post_with_retry("/search/spending_by_award/", body)
    return (data or {}).get("results", []) if data else []


async def award_count(
    naics: str,
    agency: Optional[str] = None,
    set_aside_codes: Optional[List[str]] = None,
) -> int:
    """Total contract award count for a filter (contracts + IDVs)."""
    body = {"filters": _filters(naics, agency, set_aside_codes)}
    data = await _post_with_retry("/search/spending_by_award_count/", body)
    if not data:
        return 0
    res = data.get("results", {})
    return int(res.get("contracts", 0) or 0) + int(res.get("idvs", 0) or 0)


_sem = None


def _semaphore():
    """Lazily built so it binds to the running loop; caps concurrent calls to
    USAspending, which throttles bursts (a report fires ~5 queries at once)."""
    global _sem
    if _sem is None:
        import asyncio
        _sem = asyncio.Semaphore(2)
    return _sem


async def _post_with_retry(path: str, body: dict, attempts: int = 4) -> Optional[dict]:
    """POST with concurrency cap + backoff — resilient to USAspending throttling."""
    import asyncio
    delay = 0.6
    async with _semaphore():
        for i in range(attempts):
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    r = await client.post(f"{BASE}{path}", json=body)
                if r.status_code == 200:
                    return r.json()
                if r.status_code in (429, 500, 502, 503) and i < attempts - 1:
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
                return None
            except Exception as e:
                if i < attempts - 1:
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
                print(f"[usaspending] {path} failed: {e}")
                return None
    return None


def price_stats(awards: List[dict]) -> dict:
    amounts = sorted(a["Award Amount"] for a in awards
                     if isinstance(a.get("Award Amount"), (int, float)) and a["Award Amount"] > 0)
    if not amounts:
        return {}
    def pct(p):
        i = max(0, min(len(amounts) - 1, int(round(p * (len(amounts) - 1)))))
        return amounts[i]
    return {
        "count": len(amounts),
        "min": amounts[0],
        "p25": pct(0.25),
        "median": statistics.median(amounts),
        "p75": pct(0.75),
        "max": amounts[-1],
    }


def top_recipients(awards: List[dict], n: int = 5) -> List[dict]:
    agg: dict = {}
    for a in awards:
        name = (a.get("Recipient Name") or "Unknown").title()
        rec = agg.setdefault(name, {"name": name, "count": 0, "total": 0.0})
        rec["count"] += 1
        rec["total"] += float(a.get("Award Amount") or 0)
    ranked = sorted(agg.values(), key=lambda r: (r["count"], r["total"]), reverse=True)
    return ranked[:n]


# ── RECOMPETE RADAR ──────────────────────────────────────────────
# Contracts are won 6-12 months before the RFP is published, by whoever
# already knows the incumbent's contract is ending. This surfaces that
# pipeline from real award data.

async def expiring_awards(
    naics: str,
    agency: Optional[str] = None,
    within_days: int = 540,
    pages: int = 3,
) -> List[dict]:
    """Active contracts in a NAICS whose period of performance ends soon.

    Returns soonest-first, each with the incumbent, the agency, the dollar
    value and days remaining — i.e. who to displace and when to start.
    """
    rows: List[dict] = []
    for page in range(1, max(1, pages) + 1):
        body = {
            "filters": _filters(naics, agency, None),
            "fields": ["Award ID", "Recipient Name", "Award Amount",
                       "Start Date", "End Date", "Awarding Agency", "Awarding Sub Agency"],
            "page": page, "limit": 100, "sort": "Award Amount", "order": "desc",
        }
        data = await _post_with_retry("/search/spending_by_award/", body)
        res = (data or {}).get("results") or []
        rows.extend(res)
        if len(res) < 100:
            break

    now = datetime.utcnow()
    out: List[dict] = []
    for a in rows:
        raw = a.get("End Date")
        if not raw:
            continue
        try:
            end = datetime.strptime(str(raw)[:10], "%Y-%m-%d")
        except Exception:
            continue
        days = (end - now).days
        if days < 0 or days > within_days:
            continue
        out.append({
            "award_id": a.get("Award ID"),
            "incumbent": (a.get("Recipient Name") or "Unknown").title(),
            "agency": a.get("Awarding Agency") or "",
            "sub_agency": a.get("Awarding Sub Agency") or "",
            "amount": float(a.get("Award Amount") or 0),
            "start_date": (str(a.get("Start Date"))[:10] if a.get("Start Date") else None),
            "end_date": str(raw)[:10],
            "days_left": days,
        })
    out.sort(key=lambda r: r["days_left"])
    return out


# ── TEAMING TARGETS ──────────────────────────────────────────────
# Most first-time federal work is won as a SUBcontractor, not a prime.
# Primes holding contracts over the FAR 19.702 threshold must carry a
# small-business subcontracting plan — meaning they have a standing
# obligation to find firms exactly like our user. This ranks who is
# actually winning the work, so that outreach is aimed, not random.

SUBK_PLAN_THRESHOLD = 750_000   # FAR 19.702 — plan required above this


async def top_primes(
    naics: str,
    agency: Optional[str] = None,
    pages: int = 3,
    limit: int = 12,
) -> dict:
    """Rank the firms winning the most work in a NAICS (+ optional agency).

    Returns each prime's award count, total dollars, average award size, share
    of the sampled market, and whether their awards are typically large enough
    to require a small-business subcontracting plan.
    """
    rows: List[dict] = []
    for page in range(1, max(1, pages) + 1):
        body = {
            "filters": _filters(naics, agency, None),
            "fields": ["Award ID", "Recipient Name", "Award Amount",
                       "End Date", "Awarding Agency"],
            "page": page, "limit": 100, "sort": "Award Amount", "order": "desc",
        }
        data = await _post_with_retry("/search/spending_by_award/", body)
        res = (data or {}).get("results") or []
        rows.extend(res)
        if len(res) < 100:
            break

    agg: dict = {}
    for a in rows:
        name = (a.get("Recipient Name") or "Unknown").title()
        amt = float(a.get("Award Amount") or 0)
        rec = agg.setdefault(name, {
            "name": name, "count": 0, "total": 0.0, "agencies": set(), "max_award": 0.0,
        })
        rec["count"] += 1
        rec["total"] += amt
        rec["max_award"] = max(rec["max_award"], amt)
        if a.get("Awarding Agency"):
            rec["agencies"].add(a["Awarding Agency"])

    pool_total = sum(r["total"] for r in agg.values()) or 1.0
    ranked = sorted(agg.values(), key=lambda r: r["total"], reverse=True)[:limit]
    out = []
    for r in ranked:
        out.append({
            "name": r["name"],
            "count": r["count"],
            "total": round(r["total"]),
            "avg_award": round(r["total"] / max(1, r["count"])),
            "share_pct": round(r["total"] / pool_total * 100, 1),
            "agencies": sorted(r["agencies"])[:3],
            "subk_plan_likely": r["max_award"] >= SUBK_PLAN_THRESHOLD,
        })
    return {
        "primes": out,
        "sampled_awards": len(rows),
        "pool_total": round(pool_total),
        "threshold": SUBK_PLAN_THRESHOLD,
    }
