"""
NAICS reference — enough to label codes in plain language AND let a first-time
bidder *search by what they do* ("cleaning", "trucking", "catering") instead of
having to already know a 6-digit code.

Covers the codes small / disadvantaged / WOSB / MBE businesses actually bid on
(facilities, construction trades, transportation, food, staffing, security,
health & social services, admin, and the tech/consulting codes), plus 2-digit
sector fallbacks so any code resolves to *something* readable.
"""
from __future__ import annotations

from typing import Optional

# Common 6-digit codes, grouped by the world a small business lives in.
NAICS_NAMES = {
    # ── Facilities, cleaning & grounds (huge for small/disadvantaged firms) ──
    "561720": "Janitorial Services",
    "561740": "Carpet & Upholstery Cleaning",
    "561790": "Other Services to Buildings & Dwellings",
    "561730": "Landscaping Services",
    "561210": "Facilities Support Services",
    "561621": "Security Systems Services",
    "561612": "Security Guards & Patrol Services",
    "561710": "Exterminating & Pest Control Services",
    "562111": "Solid Waste Collection",
    "562910": "Environmental Remediation Services",
    "562991": "Septic Tank & Portable Toilet Servicing",

    # ── Construction trades ──
    "236220": "Commercial & Institutional Building Construction",
    "236118": "Residential Remodelers",
    "237110": "Water & Sewer Line Construction",
    "237310": "Highway, Street & Bridge Construction",
    "238110": "Poured Concrete Foundation & Structure",
    "238160": "Roofing Contractors",
    "238210": "Electrical Contractors",
    "238220": "Plumbing, Heating & Air-Conditioning Contractors",
    "238310": "Drywall & Insulation Contractors",
    "238320": "Painting & Wall Covering Contractors",
    "238910": "Site Preparation Contractors",
    "238990": "All Other Specialty Trade Contractors",

    # ── Transportation, freight & warehousing ──
    "484110": "General Freight Trucking, Local",
    "484121": "General Freight Trucking, Long-Distance",
    "484220": "Specialized Freight Trucking, Local",
    "485410": "School & Employee Bus Transportation",
    "485310": "Taxi & Ride Service",
    "488510": "Freight Transportation Arrangement",
    "492110": "Couriers & Express Delivery",
    "493110": "General Warehousing & Storage",

    # ── Food service & catering ──
    "722310": "Food Service Contractors",
    "722320": "Caterers",
    "722513": "Limited-Service Restaurants",
    "311999": "All Other Miscellaneous Food Manufacturing",

    # ── Staffing, admin & business support ──
    "561110": "Office Administrative Services",
    "561311": "Employment Placement Agencies",
    "561320": "Temporary Help Services",
    "561330": "Professional Employer Organizations (PEO)",
    "561410": "Document Preparation Services",
    "561421": "Telephone Answering Services",
    "561422": "Telemarketing & Call Centers",
    "561431": "Private Mail Centers & Copy Shops",
    "561440": "Collection Agencies",
    "561499": "All Other Business Support Services",
    "561910": "Packaging & Labeling Services",
    "561920": "Convention & Trade Show Organizers",

    # ── Professional, scientific & technical ──
    "541110": "Offices of Lawyers",
    "541211": "Offices of Certified Public Accountants",
    "541219": "Other Accounting Services",
    "541330": "Engineering Services",
    "541350": "Building Inspection Services",
    "541370": "Surveying & Mapping Services",
    "541380": "Testing Laboratories",
    "541430": "Graphic Design Services",
    "541490": "Other Specialized Design Services",
    "541511": "Custom Computer Programming Services",
    "541512": "Computer Systems Design Services",
    "541513": "Computer Facilities Management Services",
    "541519": "Other Computer Related Services",
    "541611": "Administrative & General Management Consulting",
    "541612": "Human Resources Consulting",
    "541613": "Marketing Consulting Services",
    "541614": "Process, Physical Distribution & Logistics Consulting",
    "541618": "Other Management Consulting Services",
    "541620": "Environmental Consulting Services",
    "541690": "Other Scientific & Technical Consulting",
    "541810": "Advertising Agencies",
    "541820": "Public Relations Agencies",
    "541850": "Outdoor & Display Advertising",
    "541860": "Direct Mail Advertising",
    "541890": "Other Advertising Services",
    "541910": "Marketing Research & Public Opinion Polling",
    "541921": "Photography Studios, Portrait",
    "541922": "Commercial Photography",
    "541930": "Translation & Interpretation Services",
    "541990": "Other Professional/Scientific/Technical Services",
    "518210": "Data Processing, Hosting & Related Services",
    "519130": "Internet Publishing & Web Search Portals",
    "323111": "Commercial Printing (except Screen & Books)",
    "512110": "Motion Picture & Video Production",

    # ── Repair & maintenance ──
    "811111": "General Automotive Repair",
    "811121": "Automotive Body, Paint & Interior Repair",
    "811198": "All Other Automotive Repair & Maintenance",
    "811210": "Electronic & Precision Equipment Repair",
    "811310": "Commercial Machinery & Equipment Repair",
    "811412": "Appliance Repair & Maintenance",

    # ── Health care & social assistance ──
    "621340": "Physical, Occupational & Speech Therapists",
    "621399": "Other Health Practitioners",
    "621511": "Medical Laboratories",
    "621610": "Home Health Care Services",
    "621910": "Ambulance Services",
    "621330": "Mental Health Practitioners (ex. Physicians)",
    "623220": "Residential Mental Health Facilities",
    "624110": "Child & Youth Services",
    "624120": "Services for the Elderly & Disabled",
    "624190": "Other Individual & Family Services",
    "624310": "Vocational Rehabilitation Services",

    # ── Education & training ──
    "611430": "Professional & Management Development Training",
    "611519": "Other Technical & Trade Schools",
    "611710": "Educational Support Services",

    # ── Wholesale / supplies / manufacturing (product contracts) ──
    "423450": "Medical & Hospital Equipment Wholesale",
    "424210": "Drugs & Druggists' Sundries Wholesale",
    "423430": "Computer & Software Wholesale",
    "423610": "Electrical Equipment & Wiring Wholesale",
    "339112": "Surgical & Medical Instrument Manufacturing",
    "339113": "Surgical Appliance & Supplies Manufacturing",
    "315990": "Apparel Accessories & Other Apparel Mfg",
}

# Plain-word synonyms → the code(s) they should surface. Lets a first-timer
# type what they DO instead of a number. Keys are matched as substrings of the
# lowercased query; values are lists of codes (order = relevance).
SYNONYMS = {
    "cleaning": ["561720", "561740", "561790"],
    "janitor": ["561720"],
    "custodial": ["561720"],
    "maid": ["561720"],
    "housekeeping": ["561720"],
    "carpet": ["561740"],
    "pressure wash": ["561790"],
    "landscap": ["561730"],
    "lawn": ["561730"],
    "grounds": ["561730"],
    "mowing": ["561730"],
    "snow": ["561730"],
    "facilit": ["561210", "561790"],
    "security guard": ["561612"],
    "guard": ["561612"],
    "patrol": ["561612"],
    "security": ["561612", "561621"],
    "alarm": ["561621"],
    "surveillance": ["561621"],
    "pest": ["561710"],
    "exterminat": ["561710"],
    "waste": ["562111", "562910"],
    "trash": ["562111"],
    "garbage": ["562111"],
    "recycl": ["562111"],
    "remediation": ["562910"],
    "environmental": ["541620", "562910"],
    "septic": ["562991"],
    "portable toilet": ["562991"],
    # construction
    "construction": ["236220", "236118", "238990"],
    "build": ["236220", "236118"],
    "remodel": ["236118"],
    "renovation": ["236118", "236220"],
    "general contractor": ["236220"],
    "concrete": ["238110"],
    "foundation": ["238110"],
    "roof": ["238160"],
    "electric": ["238210", "423610"],
    "plumb": ["238220"],
    "hvac": ["238220"],
    "heating": ["238220"],
    "air condition": ["238220"],
    "drywall": ["238310"],
    "insulation": ["238310"],
    "paint": ["238320", "811121"],
    "site prep": ["238910"],
    "excavat": ["238910"],
    "demolition": ["238910"],
    "sewer": ["237110"],
    "water line": ["237110"],
    "road": ["237310"],
    "highway": ["237310"],
    "bridge": ["237310"],
    "paving": ["237310"],
    "asphalt": ["237310"],
    # transportation
    "truck": ["484110", "484121", "484220"],
    "freight": ["484110", "484121", "488510"],
    "hauling": ["484110", "484220"],
    "transport": ["484110", "485410", "485310"],
    "delivery": ["492110"],
    "courier": ["492110"],
    "bus": ["485410"],
    "shuttle": ["485410"],
    "taxi": ["485310"],
    "rideshare": ["485310"],
    "logistics": ["488510", "541614"],
    "warehouse": ["493110"],
    "storage": ["493110"],
    "moving": ["484220"],
    # food
    "catering": ["722320"],
    "cater": ["722320"],
    "food service": ["722310"],
    "meal": ["722310", "722320"],
    "cafeteria": ["722310"],
    "restaurant": ["722513"],
    "food": ["722310", "722320", "311999"],
    # staffing / admin
    "staffing": ["561320", "561311"],
    "temp": ["561320"],
    "recruit": ["561311"],
    "employment": ["561311"],
    "payroll": ["561330"],
    "hr": ["541612", "561330"],
    "human resource": ["541612", "561330"],
    "admin": ["561110", "561410"],
    "office": ["561110"],
    "clerical": ["561110", "561410"],
    "call center": ["561422", "561421"],
    "telemarket": ["561422"],
    "answering": ["561421"],
    "collection": ["561440"],
    "billing": ["561440", "541219"],
    "mailing": ["561431", "541860"],
    "packaging": ["561910"],
    "event": ["561920"],
    "trade show": ["561920"],
    "conference": ["561920"],
    # professional / technical
    "legal": ["541110"],
    "lawyer": ["541110"],
    "attorney": ["541110"],
    "account": ["541211", "541219"],
    "bookkeep": ["541219"],
    "cpa": ["541211"],
    "audit": ["541211"],
    "tax": ["541211", "541219"],
    "engineer": ["541330"],
    "survey": ["541370"],
    "mapping": ["541370"],
    "inspect": ["541350"],
    "testing lab": ["541380"],
    "graphic": ["541430"],
    "logo": ["541430"],
    "design": ["541430", "541490"],
    "web": ["541511", "541512", "519130"],
    "website": ["541511", "541512"],
    "software": ["541511", "541512"],
    "programming": ["541511"],
    "developer": ["541511"],
    "coding": ["541511"],
    "information technology": ["541512", "541519"],
    "cyber": ["541512", "541519"],
    "cloud": ["518210", "541512"],
    "data": ["518210", "541511"],
    "hosting": ["518210"],
    "network": ["541512", "541519"],
    "consult": ["541611", "541618", "541690"],
    "management consult": ["541611", "541618"],
    "marketing": ["541613", "541810", "541910"],
    "advertis": ["541810", "541850", "541890"],
    "public relations": ["541820"],
    "photo": ["541921", "541922"],
    "video": ["512110"],
    "translat": ["541930"],
    "interpret": ["541930"],
    "print": ["323111"],
    # repair
    "auto repair": ["811111", "811121"],
    "mechanic": ["811111"],
    "vehicle repair": ["811111", "811198"],
    "equipment repair": ["811310", "811210"],
    "appliance": ["811412"],
    "machinery": ["811310"],
    # health & social
    "home health": ["621610"],
    "medical lab": ["621511"],
    "therapy": ["621340"],
    "therapist": ["621340"],
    "ambulance": ["621910"],
    "mental health": ["621330", "623220"],
    "counseling": ["621330"],
    "child": ["624110"],
    "youth": ["624110"],
    "elderly": ["624120"],
    "disab": ["624120", "624310"],
    "family services": ["624190"],
    "social": ["624190", "624110"],
    # education
    "training": ["611430", "611519"],
    "workforce": ["611430", "611519"],
    "trade school": ["611519"],
    "tutoring": ["611710"],
    "education": ["611430", "611710"],
    # supplies / wholesale / mfg
    "medical supply": ["423450", "339113"],
    "medical equipment": ["423450", "339112"],
    "pharmaceutical": ["424210"],
    "drug": ["424210"],
    "computer supply": ["423430"],
    "uniform": ["315990"],
    "apparel": ["315990"],
    "manufacturing": ["339112", "339113", "311999"],
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

# A short, friendly starter list for the picker (before the user searches) —
# the codes disadvantaged / first-time bidders most commonly win.
STARTER_CODES = [
    "561720", "561730", "561210", "561612", "236220", "238220", "238210",
    "484110", "722320", "561320", "541611", "541512", "541330", "621610",
    "611430", "541430",
]


def naics_name(code: Optional[str]) -> Optional[str]:
    """Human-readable label for a NAICS code (exact, then sector fallback)."""
    if not code:
        return None
    raw = str(code).strip()
    if raw in NAICS_NAMES:
        return NAICS_NAMES[raw]
    return SECTORS.get(raw[:2])


def suggestions() -> list:
    """A friendly starter list for the UI picker (no query)."""
    return [{"code": c, "name": NAICS_NAMES[c]} for c in STARTER_CODES if c in NAICS_NAMES]


def search(query: Optional[str], limit: int = 12) -> list:
    """Search NAICS by code prefix, name text, or plain-word synonym.

    Returns [{code, name}] ranked: exact-code > code-prefix > synonym > name
    substring. Empty/short query returns the starter list.
    """
    q = str(query or "").strip().lower()
    if len(q) < 2:
        return suggestions()

    scored: dict[str, int] = {}

    def bump(code: str, score: int):
        if code in NAICS_NAMES:
            scored[code] = max(scored.get(code, 0), score)

    if q.isdigit():
        # numeric query → code match (exact best, then prefix)
        for code in NAICS_NAMES:
            if code == q:
                bump(code, 100)
            elif code.startswith(q):
                bump(code, 80)
    else:
        # synonym / plain-word map (substring so "security guard" hits)
        for term, codes in SYNONYMS.items():
            if term in q or q in term:
                for i, code in enumerate(codes):
                    bump(code, 70 - i)  # preserve author-ranked order
        # name substring
        for code, name in NAICS_NAMES.items():
            nl = name.lower()
            if q in nl:
                bump(code, 60)
            elif any(w for w in q.split() if len(w) > 2 and w in nl):
                bump(code, 40)

    ranked = sorted(scored.items(), key=lambda kv: (-kv[1], kv[0]))
    return [{"code": c, "name": NAICS_NAMES[c]} for c, _ in ranked[:limit]]
