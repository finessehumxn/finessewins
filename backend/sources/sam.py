"""
SAM.gov — federal contract opportunities (System for Award Management).
Real public API: https://api.sam.gov/opportunities/v2/search  (needs SAM_API_KEY).
Falls back to representative curated data when no key is set.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import List

import httpx

from .base import BidSource, Query, opportunity

SAM_API_KEY = os.environ.get("SAM_API_KEY", "")
SAM_BASE = "https://api.sam.gov/opportunities/v2/search"

SET_ASIDE_MAP = {"WOSB": "WOSB", "SBA": "SBA", "8A": "8A", "HUBZone": "HZS"}


class SamGov(BidSource):
    name = "SAM.gov"
    kind = "federal"
    homepage = "https://sam.gov"
    live_capable = True

    def enabled(self) -> bool:
        return True  # always on (curated fallback when no key)

    async def search(self, q: Query) -> List[dict]:
        if not SAM_API_KEY:
            return _curated(q)

        params = {
            "api_key": SAM_API_KEY,
            "keyword": q.keywords,
            "limit": q.max_results,
            "postedFrom": (datetime.now() - timedelta(days=30)).strftime("%m/%d/%Y"),
            "postedTo": (datetime.now() + timedelta(days=90)).strftime("%m/%d/%Y"),
        }
        if q.naics_code:
            params["naicsCode"] = q.naics_code
        if q.set_aside:
            params["typeOfSetAsideDescription"] = SET_ASIDE_MAP.get(q.set_aside, q.set_aside)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(SAM_BASE, params=params)
            data = resp.json()

        out = []
        for o in data.get("opportunitiesData", []):
            out.append(opportunity(
                id=o.get("noticeId"),
                source=self.name,
                solicitation_number=o.get("solicitationNumber"),
                title=o.get("title"),
                agency=o.get("fullParentPathName"),
                naics_code=o.get("naicsCode"),
                set_aside=o.get("typeOfSetAside"),
                deadline=o.get("responseDeadLine"),
                posted_date=o.get("postedDate"),
                description=o.get("description", ""),
                url=f"https://sam.gov/opp/{o.get('noticeId')}/view",
                type="contract",
                live=True,
            ))
        return out


def _curated(q: Query) -> List[dict]:
    rows = [
        opportunity(
            id="sam-90MC0026R0004", source="SAM.gov",
            solicitation_number="90MC0026R0004",
            title="Selective Service System Website Modernization",
            agency="Selective Service System", naics_code="541512", set_aside="WOSB",
            deadline="2026-08-15T17:00:00", posted_date="2026-05-01",
            description="Full modernization of the Selective Service System public-facing website using Azure Government infrastructure.",
            url="https://sam.gov/opp/sam-90MC0026R0004/view", type="contract",
        ),
        opportunity(
            id="sam-VA-2026-IT-001", source="SAM.gov",
            solicitation_number="VA-2026-IT-001",
            title="VA Clinical Documentation AI System",
            agency="Department of Veterans Affairs", naics_code="541511", set_aside="WOSB",
            deadline="2026-09-15T17:00:00", posted_date="2026-06-01",
            description="AI-powered clinical documentation system to reduce nurse documentation time by 40%.",
            url="https://sam.gov/opp/sam-VA-2026-IT-001/view", type="contract",
        ),
    ]
    kw = q.keywords
    return [r for r in rows if BidSource._matches(r["title"] + r["description"], kw)] or rows
