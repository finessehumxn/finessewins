"""
FinesseWins — Bid source aggregator

Fans out a single query across every enabled bid site concurrently, normalizes
and de-duplicates the results, sorts by soonest deadline, and reports which
sources were searched. Adding a new bid site = add an adapter and register it in
ALL_SOURCES below.
"""
from __future__ import annotations

import asyncio
import os
from typing import List, Optional

# In production, set FINESSEWINS_HIDE_SAMPLE=1 so only live-sourced opportunities are
# ever shown — users must never act on representative sample listings.
HIDE_SAMPLE = os.environ.get("FINESSEWINS_HIDE_SAMPLE", "0") == "1"

from .base import BidSource, Query
from .sam import SamGov
from .grants import GrantsGov
from .fedconnect import FedConnect
from .gsa_ebuy import GsaEbuy
from .dibbs import Dibbs
from .state_portals import StatePortals

# Registry — order here is the default display/tiebreak order.
ALL_SOURCES: List[BidSource] = [
    SamGov(),
    GrantsGov(),
    FedConnect(),
    GsaEbuy(),
    Dibbs(),
    StatePortals(),
]


def list_sources() -> List[dict]:
    """Metadata for the UI (name, kind, live capability, enabled)."""
    return [
        {
            "name": s.name,
            "kind": s.kind,
            "homepage": s.homepage,
            "live_capable": s.live_capable,
            "enabled": s.enabled(),
        }
        for s in ALL_SOURCES
    ]


async def _run(source: BidSource, q: Query) -> tuple[str, list, Optional[str]]:
    try:
        results = await asyncio.wait_for(source.search(q), timeout=30)
        return source.name, results or [], None
    except Exception as e:  # one bad source never sinks the whole search
        print(f"[sources] {source.name} failed: {e}")
        return source.name, [], str(e)


async def search_all(
    keywords: str,
    naics_code: Optional[str] = None,
    set_aside: Optional[str] = None,
    state: Optional[str] = None,
    max_results: int = 30,
    only: Optional[List[str]] = None,
) -> dict:
    """Search every enabled source. `only` optionally restricts to source names.

    Returns { results, count, sources } where `sources` reports per-site status.
    """
    q = Query(
        keywords=keywords or "",
        naics_code=naics_code,
        set_aside=set_aside,
        state=state,
        max_results=max_results,
    )

    active = [s for s in ALL_SOURCES if s.enabled() and (not only or s.name in only)]
    gathered = await asyncio.gather(*[_run(s, q) for s in active])

    results: List[dict] = []
    source_report: List[dict] = []
    hidden = 0
    for name, rows, err in gathered:
        if HIDE_SAMPLE:
            kept = [r for r in rows if not r.get("sample")]
            hidden += len(rows) - len(kept)
            rows = kept
        source_report.append({
            "name": name,
            "count": len(rows),
            "error": err,
            "live": any(r.get("live") for r in rows),
            "sample": all(r.get("sample") for r in rows) if rows else False,
        })
        results.extend(rows)

    # De-dupe on solicitation number (fall back to id), keeping the first (live wins
    # because live sources are ordered first / return live=True rows).
    seen = set()
    deduped = []
    for r in sorted(results, key=lambda x: (not x.get("live"),)):
        key = (r.get("solicitation_number") or r.get("id") or r.get("title"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)

    # Soonest real deadline first; undated go last.
    deduped.sort(key=lambda x: x.get("deadline") or "9999-12-31")

    return {
        "results": deduped[:max_results],
        "count": len(deduped[:max_results]),
        "sources": source_report,
        "sample_hidden": hidden,
    }
