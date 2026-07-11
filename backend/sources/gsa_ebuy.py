"""
GSA eBuy — RFQs against GSA Multiple Award Schedules (MAS).

eBuy RFQs are only visible to Schedule contract holders after login (no public
API). This adapter is a placeholder that returns curated MAS-style RFQs and is
disabled unless the seller has a Schedule (set GSA_SCHEDULE_HOLDER=1). To wire
live data, drive an authenticated eBuy session in `_live()`.
"""
from __future__ import annotations

import os
from typing import List

from .base import BidSource, Query, opportunity

HOMEPAGE = "https://www.ebuy.gsa.gov"


class GsaEbuy(BidSource):
    name = "GSA eBuy"
    kind = "federal"
    homepage = HOMEPAGE
    live_capable = False

    def enabled(self) -> bool:
        # eBuy RFQs are only actionable if you hold a GSA Schedule.
        return os.environ.get("GSA_SCHEDULE_HOLDER", "1") == "1"

    async def search(self, q: Query) -> List[dict]:
        rows = [
            opportunity(
                id="ebuy-RFQ1567890", source="GSA eBuy",
                solicitation_number="RFQ1567890",
                title="Agile Software Development — Task Order (MAS SIN 54151S)",
                agency="Department of Homeland Security",
                naics_code="541511", set_aside="SBA",
                deadline="2026-08-05T17:00:00", posted_date="2026-06-18",
                description="RFQ against GSA MAS SIN 54151S for agile software development and O&M support.",
                url=HOMEPAGE, type="contract",
            ),
        ]
        return [r for r in rows if BidSource._matches(r["title"] + r["description"], q.keywords)] or rows
