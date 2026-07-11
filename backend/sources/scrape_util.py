"""
Shared scraping helpers for bid-site adapters that read live HTML.

Kept deliberately small: a browser-like httpx fetch, a BeautifulSoup parse, and
a forgiving date parser. Adapters degrade gracefully — if httpx/bs4 aren't
installed or a fetch fails, they return None and the adapter falls back to
curated data.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


async def fetch_html(url: str, timeout: float = 20.0) -> Optional[str]:
    """GET a page as a browser would. Returns HTML text, or None on any failure."""
    try:
        import httpx
    except Exception:
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers=BROWSER_HEADERS)
        if resp.status_code >= 400:
            return None
        return resp.text
    except Exception as e:
        print(f"[scrape] fetch failed for {url}: {e}")
        return None


def soup(html: str):
    """Parse HTML with lxml (falls back to the stdlib parser). None if bs4 missing."""
    try:
        from bs4 import BeautifulSoup
    except Exception:
        return None
    try:
        return BeautifulSoup(html, "lxml")
    except Exception:
        return BeautifulSoup(html, "html.parser")


# Common date shapes seen on these portals.
_DATE_FORMATS = (
    "%m/%d/%Y %I:%M:%S %p",   # AZ APP:      7/17/2026 3:00:00 PM
    "%m/%d/%Y %I:%M %p",      # FedConnect:  09/04/2026 06:00 PM
    "%m/%d/%Y",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
)


def parse_date(text: Optional[str]) -> Optional[str]:
    """Best-effort parse of a portal date string → ISO 8601, or None."""
    if not text:
        return None
    s = " ".join(str(text).split())
    # Trim trailing timezone labels like "US/Eastern".
    for tz in (" US/", " UTC", " ET", " PT"):
        if tz in s:
            s = s.split(tz)[0].strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s[: len(datetime.now().strftime(fmt)) + 4].strip(), fmt).isoformat()
        except Exception:
            continue
    # Last resort: try the leading "M/D/Y" token.
    token = s.split(" ")[0]
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(token, fmt).isoformat()
        except Exception:
            continue
    return None


def cell_text(td) -> str:
    return td.get_text(" ", strip=True) if td else ""
