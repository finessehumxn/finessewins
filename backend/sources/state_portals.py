"""
State & local procurement portals.

The Arizona APP Portal (app.az.gov) is MC's home market and is scraped LIVE from
its public "Browse public RFx" grid (server-rendered — no browser needed). Other
states/local aggregators (BidNet/Periscope, Bonfire, Ionwave, DemandStar) are
included as curated entries and plug in as dedicated adapters over time.

Live scrape is on by default; set AZ_APP_LIVE=0 to force curated data.
"""
from __future__ import annotations

import os
from typing import List

from .base import BidSource, Query, opportunity
from .scrape_util import fetch_html, soup, parse_date, cell_text

AZ_BROWSE = "https://app.az.gov/page.aspx/en/rfp/request_browse_public"
AZ_ROOT = "https://app.az.gov"
AZ_APP_LIVE = os.environ.get("AZ_APP_LIVE", "1") == "1"


class StatePortals(BidSource):
    name = "State & Local"
    kind = "state"
    homepage = AZ_BROWSE
    live_capable = True

    async def search(self, q: Query) -> List[dict]:
        state = (q.state or "").upper()
        rows: List[dict] = []

        # Arizona — live scrape (skip if the user pinned a non-AZ state).
        if AZ_APP_LIVE and state in ("", "ALL", "AZ", "ARIZONA"):
            rows.extend(await self._scrape_az())

        # Curated national/local aggregators + AZ fallback if the scrape was empty.
        curated = _OTHER_STATES + (_AZ_FALLBACK if not rows else [])
        if state and state not in ("", "ALL"):
            curated = [r for r in curated if r["_state"] in (state, "US")]
        rows.extend(_strip(r) for r in curated)

        return [r for r in rows if BidSource._matches((r["title"] or "") + (r["description"] or ""), q.keywords)] or rows

    async def _scrape_az(self) -> List[dict]:
        html = await fetch_html(AZ_BROWSE, timeout=25)
        if not html:
            return []
        s = soup(html)
        if not s:
            return []
        grid = s.find("table", id="body_x_grid_grd")
        if not grid:
            return []
        out = []
        for tr in grid.find_all("tr")[1:]:
            tds = tr.find_all("td")
            if len(tds) < 8:
                continue
            code = cell_text(tds[1])
            label = cell_text(tds[2])
            if not code or not label:
                continue
            commodity = cell_text(tds[4])
            agency = cell_text(tds[5])
            status = cell_text(tds[7])
            deadline = parse_date(cell_text(tds[-1]))
            link = tr.find("a", href=True)
            url = (AZ_ROOT + link["href"]) if link and link["href"].startswith("/") else AZ_BROWSE
            out.append(opportunity(
                id=f"az-{code}", source="AZ APP Portal",
                solicitation_number=code, title=label, agency=agency or "State of Arizona",
                naics_code=None, deadline=deadline,
                description=f"{commodity} · {status}".strip(" ·"),
                url=url, type="solicitation", live=True,
            ))
        return out


def _row(state, **kw):
    o = opportunity(**kw)
    o["_state"] = state
    return o


def _strip(r):
    return {k: v for k, v in r.items() if not k.startswith("_")}


# Used only if the AZ live scrape is unavailable.
_AZ_FALLBACK = [
    _row("AZ",
        id="az-BPM007574", source="AZ APP Portal", solicitation_number="BPM007574",
        title="Child Specific Recruitment", agency="Arizona Department of Child Safety",
        naics_code="624110", deadline="2026-07-30T12:00:00",
        description="Child-specific recruitment services for foster and adoptive families.",
        url="https://app.az.gov/page.aspx/en/rfp/request_browse_public", type="solicitation"),
]

_OTHER_STATES = [
    _row("US",
        id="bidnet-2026-consult", source="BidNet / Periscope",
        solicitation_number="RFP-2026-CONSULT",
        title="Management Consulting & Program Evaluation (multi-state)",
        agency="Regional Council of Governments", naics_code="541611",
        deadline="2026-08-14T15:00:00",
        description="Statewide/local RFP for management consulting and program evaluation (posted via BidNet).",
        url="https://www.bidnetdirect.com", type="solicitation"),
    _row("US",
        id="bonfire-webredesign", source="Bonfire",
        solicitation_number="CITY-2026-WEB",
        title="Municipal Website Redesign & CMS Migration",
        agency="City Procurement (Bonfire)", naics_code="541512",
        deadline="2026-08-01T16:00:00",
        description="Local government website redesign, accessibility (WCAG 2.1) and CMS migration.",
        url="https://gobonfire.com", type="solicitation"),
]
