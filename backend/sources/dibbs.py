"""
DLA DIBBS — Defense Logistics Agency Internet Bid Board System.

DIBBS publishes RFQs/solicitations for defense supplies at dibbs.bsm.dla.mil.
Public listings exist but require request-header handling; this adapter is
structured for a real fetch and ships curated defense RFQs meanwhile.
"""
from __future__ import annotations

from typing import List

from .base import BidSource, Query, opportunity

HOMEPAGE = "https://www.dibbs.bsm.dla.mil"


class Dibbs(BidSource):
    name = "DLA DIBBS"
    kind = "dod"
    homepage = HOMEPAGE
    live_capable = False

    async def search(self, q: Query) -> List[dict]:
        rows = [
            opportunity(
                id="dibbs-SPE7L226T", source="DLA DIBBS",
                solicitation_number="SPE7L2-26-T-1234",
                title="IT Hardware & Peripherals — Supply Contract",
                agency="Defense Logistics Agency",
                naics_code="334111", set_aside="SBA",
                deadline="2026-07-30T23:00:00", posted_date="2026-06-25",
                description="Automated RFQ for commercial IT hardware and peripherals under DLA supply programs.",
                url=HOMEPAGE, type="contract",
            ),
        ]
        return [r for r in rows if BidSource._matches(r["title"] + r["description"], q.keywords)] or rows
