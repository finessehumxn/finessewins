"""
Grants.gov — federal grant opportunities.
Real public API (no key required): POST https://api.grants.gov/v1/api/search2
Docs: https://www.grants.gov/web/grants/s2s/grantor/web-services/search2.html
"""
from __future__ import annotations

from typing import List

import httpx

from .base import BidSource, Query, opportunity

SEARCH2 = "https://api.grants.gov/v1/api/search2"


class GrantsGov(BidSource):
    name = "Grants.gov"
    kind = "grants"
    homepage = "https://www.grants.gov"
    live_capable = True

    async def search(self, q: Query) -> List[dict]:
        body = {
            "keyword": q.keywords or "",
            "oppStatuses": "forecasted|posted",
            "rows": min(q.max_results, 25),
            "startRecordNum": 0,
        }
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                resp = await client.post(SEARCH2, json=body)
                data = resp.json()
        except Exception as e:
            print(f"[Grants.gov] live search failed ({e}) — using curated fallback")
            return _curated(q)

        hits = (data.get("data") or {}).get("oppHits") or []
        if not hits:
            return _curated(q) if not q.keywords else []

        out = []
        for h in hits:
            num = h.get("number") or h.get("id")
            out.append(opportunity(
                id=f"grants-{h.get('id') or num}",
                source=self.name,
                solicitation_number=num,
                title=h.get("title"),
                agency=h.get("agency") or h.get("agencyCode"),
                naics_code=None,
                set_aside=None,
                deadline=h.get("closeDate"),
                posted_date=h.get("openDate"),
                description=(h.get("agency") or "") + " — federal grant opportunity.",
                url=f"https://www.grants.gov/search-results-detail/{h.get('id')}",
                type="grant",
                live=True,
            ))
        return out


def _curated(q: Query) -> List[dict]:
    rows = [
        opportunity(
            id="grants-HRSA-26-001", source="Grants.gov",
            solicitation_number="HRSA-26-001",
            title="Behavioral Health Workforce Education & Training",
            agency="Health Resources & Services Administration",
            deadline="2026-09-30T23:59:00", posted_date="2026-06-05",
            description="Grants to expand the behavioral health workforce in underserved communities.",
            url="https://www.grants.gov/search-results-detail/HRSA-26-001", type="grant",
        ),
        opportunity(
            id="grants-ED-26-TECH", source="Grants.gov",
            solicitation_number="ED-GRANTS-2026-TECH",
            title="Education Innovation & Research — EdTech",
            agency="Department of Education",
            deadline="2026-08-28T16:30:00", posted_date="2026-05-20",
            description="Funding for evidence-based educational technology and school improvement programs.",
            url="https://www.grants.gov/search-results-detail/ED-26-TECH", type="grant",
        ),
    ]
    return [r for r in rows if BidSource._matches(r["title"] + r["description"], q.keywords)] or rows
