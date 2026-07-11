"""
NAICS reference — enough to label codes in plain language for first-time bidders.
Not the full 1,000+ list; covers the codes small/services businesses actually bid,
plus 2-digit sector fallbacks so any code resolves to *something* readable.
"""
from __future__ import annotations

from typing import Optional

# Common 6-digit codes (services / small-biz heavy)
NAICS_NAMES = {
    "541511": "Custom Computer Programming Services",
    "541512": "Computer Systems Design Services",
    "541513": "Computer Facilities Management Services",
    "541519": "Other Computer Related Services",
    "541611": "Administrative & General Management Consulting",
    "541612": "Human Resources Consulting",
    "541613": "Marketing Consulting Services",
    "541618": "Other Management Consulting Services",
    "541810": "Advertising Agencies",
    "541511s": "Software Development",
    "541430": "Graphic Design Services",
    "541990": "Other Professional/Scientific/Technical Services",
    "541330": "Engineering Services",
    "541690": "Other Scientific & Technical Consulting",
    "561311": "Employment Placement Agencies",
    "561320": "Temporary Help Services",
    "561410": "Document Preparation Services",
    "561611": "Investigation Services",
    "611430": "Professional & Management Development Training",
    "611710": "Educational Support Services",
    "621330": "Mental Health Practitioners (ex. Physicians)",
    "621340": "Physical/Occupational & Speech Therapists",
    "623220": "Residential Mental Health Facilities",
    "624110": "Child & Youth Services",
    "624190": "Other Individual & Family Services",
    "624310": "Vocational Rehabilitation Services",
    "541720": "Research & Development in Social Sciences",
    "541910": "Marketing Research & Public Opinion Polling",
    "334111": "Electronic Computer Manufacturing",
    "518210": "Data Processing, Hosting & Related Services",
    "519130": "Internet Publishing & Web Search Portals",
}

# 2-digit sector fallbacks
SECTORS = {
    "11": "Agriculture, Forestry, Fishing & Hunting",
    "21": "Mining, Quarrying, Oil & Gas",
    "22": "Utilities",
    "23": "Construction",
    "31": "Manufacturing", "32": "Manufacturing", "33": "Manufacturing",
    "42": "Wholesale Trade",
    "44": "Retail Trade", "45": "Retail Trade",
    "48": "Transportation & Warehousing", "49": "Transportation & Warehousing",
    "51": "Information",
    "52": "Finance & Insurance",
    "53": "Real Estate & Rental",
    "54": "Professional, Scientific & Technical Services",
    "55": "Management of Companies",
    "56": "Administrative & Support / Waste Services",
    "61": "Educational Services",
    "62": "Health Care & Social Assistance",
    "71": "Arts, Entertainment & Recreation",
    "72": "Accommodation & Food Services",
    "81": "Other Services",
    "92": "Public Administration",
}


def naics_name(code: Optional[str]) -> Optional[str]:
    """Human-readable label for a NAICS code (exact, then sector fallback)."""
    if not code:
        return None
    code = str(code).strip()
    if code in NAICS_NAMES:
        return NAICS_NAMES[code]
    sector = SECTORS.get(code[:2])
    return sector


def suggestions() -> list:
    """A friendly starter list for the UI picker."""
    return [{"code": c, "name": n} for c, n in NAICS_NAMES.items() if not c.endswith("s")]
