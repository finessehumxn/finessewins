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
                   "Period of Performance Current End Date", "recipient_id"],
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
