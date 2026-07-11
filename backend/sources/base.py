"""
FinesseWins — Bid source framework

Every bid site (SAM.gov, Grants.gov, FedConnect, GSA eBuy, DIBBS, state portals…)
is a `BidSource` adapter with one job: take a normalized query and return a list
of opportunities in one common schema. The aggregator (sources/__init__.py) fans
out across all enabled sources concurrently, so adding a new site is just dropping
in another adapter — no changes to the API layer.

Normalized opportunity schema:
    {
      "id":                  str,        # unique within the source
      "source":              str,        # display name, e.g. "Grants.gov"
      "solicitation_number": str | None,
      "title":               str,
      "agency":              str,
      "naics_code":          str | None,
      "set_aside":           str | None,
      "deadline":            str | None, # ISO 8601
      "posted_date":         str | None,
      "description":         str,        # trimmed
      "url":                 str,
      "type":                str,        # "contract" | "grant" | "solicitation"
      "live":                bool,       # True = pulled from a live API this call
    }
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional


@dataclass
class Query:
    keywords: str = ""
    naics_code: Optional[str] = None
    set_aside: Optional[str] = None
    state: Optional[str] = None
    max_results: int = 20


def opportunity(
    *,
    id: str,
    source: str,
    title: str,
    agency: str,
    url: str,
    solicitation_number: Optional[str] = None,
    naics_code: Optional[str] = None,
    set_aside: Optional[str] = None,
    deadline: Optional[str] = None,
    posted_date: Optional[str] = None,
    description: str = "",
    type: str = "solicitation",
    live: bool = False,
) -> dict:
    """Build a normalized opportunity dict (keeps every adapter consistent)."""
    return {
        "id": id,
        "source": source,
        "solicitation_number": solicitation_number,
        "title": (title or "Untitled").strip(),
        "agency": (agency or "").strip(),
        "naics_code": naics_code,
        "set_aside": set_aside,
        "deadline": _iso(deadline),
        "posted_date": _iso(posted_date),
        "description": (description or "")[:500],
        "url": url,
        "type": type,
        "live": live,
        # A row that didn't come from a live API/scrape is representative SAMPLE
        # data — the UI labels it and production can hide it entirely.
        "sample": not live,
    }


class BidSource:
    """Base class for a bid site adapter."""

    name: str = "Source"
    kind: str = "federal"          # federal | state | grants | dod
    homepage: str = ""
    #: whether this adapter can currently return *live* data (vs curated fallback)
    live_capable: bool = False

    def enabled(self) -> bool:
        return True

    async def search(self, q: Query) -> List[dict]:  # pragma: no cover - interface
        raise NotImplementedError

    # helper for adapters that keyword-filter their own curated lists
    @staticmethod
    def _matches(text: str, keywords: str) -> bool:
        if not keywords:
            return True
        text = (text or "").lower()
        terms = [t for t in keywords.lower().split() if len(t) > 2]
        return any(t in text for t in terms) if terms else True


def _iso(value) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    s = str(value).strip()
    # Grants.gov uses MM/DD/YYYY; normalize a few common shapes to ISO.
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            return datetime.strptime(s[:10], fmt).isoformat()
        except Exception:
            continue
    return s  # already ISO-ish or unparseable — pass through
