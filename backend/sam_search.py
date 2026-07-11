"""
FinesseWins — Opportunity search (multi-source aggregator entry point)

This module used to talk only to SAM.gov. It now delegates to the pluggable
`sources` package, which fans out across every bid site (SAM.gov, Grants.gov,
FedConnect, GSA eBuy, DLA DIBBS, and state/local portals) concurrently.

Kept the original `search_opportunities(...) -> list` signature for backward
compatibility; `search_opportunities_detailed(...)` additionally returns which
sources were searched.
"""
from __future__ import annotations

from typing import List, Optional

from sources import search_all, list_sources  # noqa: F401 (re-exported)


async def search_opportunities_detailed(
    keywords: str,
    naics_code: Optional[str] = None,
    set_aside: Optional[str] = None,
    state: Optional[str] = None,
    max_results: int = 20,
    only: Optional[List[str]] = None,
) -> dict:
    """Search all bid sites. Returns {results, count, sources}."""
    return await search_all(
        keywords=keywords,
        naics_code=naics_code,
        set_aside=set_aside,
        state=state,
        max_results=max_results,
        only=only,
    )


async def search_opportunities(
    keywords: str,
    naics_code: Optional[str] = None,
    set_aside: Optional[str] = None,
    state: Optional[str] = None,
    max_results: int = 20,
) -> List[dict]:
    """Backward-compatible: returns just the flattened, de-duped results list."""
    detailed = await search_opportunities_detailed(
        keywords, naics_code, set_aside, state, max_results
    )
    return detailed["results"]
