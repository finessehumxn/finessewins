"""
FedConnect — federal opportunities portal (fedconnect.net).

Scraped LIVE from the public opportunities grid (`gridOpportunity`), which is
server-rendered and includes NAICS + response-due dates. Row detail links are
JavaScript postbacks (no deep link), so items link to the public search page.

Live scrape is on by default; set FEDCONNECT_LIVE=0 to force curated data.
"""
from __future__ import annotations

import os
from typing import List

from .base import BidSource, Query, opportunity
from .scrape_util import fetch_html, soup, parse_date, cell_text

PUBLIC_SEARCH = "https://www.fedconnect.net/FedConnect/PublicPages/PublicSearch/Public_Opportunities.aspx"
FEDCONNECT_LIVE = os.environ.get("FEDCONNECT_LIVE", "1") == "1"


class FedConnect(BidSource):
    name = "FedConnect"
    kind = "federal"
    homepage = "https://www.fedconnect.net"
    live_capable = True

    async def search(self, q: Query) -> List[dict]:
        if FEDCONNECT_LIVE:
            live = await self._scrape(q)
            if live:
                return live
        return _curated(q)

    async def _scrape(self, q: Query) -> List[dict]:
        html = await fetch_html(PUBLIC_SEARCH, timeout=25)
        if not html:
            return []
        s = soup(html)
        if not s:
            return []
        grid = s.find("table", id="gridOpportunity")
        if not grid:
            return []
        out = []
        for tr in grid.find_all("tr")[1:]:
            tds = tr.find_all("td")
            if len(tds) < 8:
                continue
            # Columns: Title, Type, Agency, Issuing Office, Issue Date,
            #          Response Due Date, PSC/FSC, NAICS, [Reference #]
            title = cell_text(tds[0])
            if not title:
                continue
            agency = cell_text(tds[2]) or cell_text(tds[3])
            issue = parse_date(cell_text(tds[4]))
            due = parse_date(cell_text(tds[5]))
            naics = cell_text(tds[7]) if len(tds) > 7 else None
            ref = cell_text(tds[8]) if len(tds) > 8 else None
            out.append(opportunity(
                id=f"fc-{ref or title[:40]}", source="FedConnect",
                solicitation_number=ref, title=title, agency=agency,
                naics_code=(naics or None), deadline=due, posted_date=issue,
                description=f"{cell_text(tds[1])} · {agency}".strip(" ·"),
                url=PUBLIC_SEARCH, type="contract", live=True,
            ))
        # Respect the query's NAICS filter (grid isn't server-filtered).
        if q.naics_code:
            out = [o for o in out if not o["naics_code"] or o["naics_code"][:4] == q.naics_code[:4]] or out
        return out


def _curated(q: Query) -> List[dict]:
    rows = [
        opportunity(
            id="fc-DE-FOA-0003210", source="FedConnect",
            solicitation_number="DE-FOA-0003210",
            title="Clean Energy Technical Assistance for Tribal & Rural Communities",
            agency="Department of Energy", naics_code="541690", set_aside="SBA",
            deadline="2026-09-10T17:00:00", posted_date="2026-06-12",
            description="Technical assistance for clean-energy deployment in tribal and rural communities.",
            url=PUBLIC_SEARCH, type="contract"),
        opportunity(
            id="fc-75N98026R00012", source="FedConnect",
            solicitation_number="75N98026R00012",
            title="Public Health Data Modernization Support Services",
            agency="Centers for Disease Control and Prevention",
            naics_code="541512", set_aside="WOSB",
            deadline="2026-08-22T14:00:00", posted_date="2026-05-30",
            description="Support services for CDC public health data systems modernization and analytics.",
            url=PUBLIC_SEARCH, type="contract"),
    ]
    return [r for r in rows if BidSource._matches(r["title"] + r["description"], q.keywords)] or rows
