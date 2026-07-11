"""
FinesseWins — Opportunity Matching Engine
Scores each opportunity 0-100 for fit based on company profile,
certifications, NAICS codes, and past performance.
"""
from typing import List, Optional
import re

CERT_SET_ASIDE_MAP = {
    "WOSB":       ["WOSB", "EDWOSB", "Women-Owned Small Business"],
    "EDWOSB":     ["EDWOSB", "WOSB"],
    "MBE":        ["SDB", "Small Disadvantaged Business", "MBE"],
    "Black-Owned":["SDB", "Small Disadvantaged Business"],
    "8a":         ["8(a)", "8a", "SBA 8(a)"],
    "HUBZone":    ["HUBZone", "Historically Underutilized Business Zone"],
    "DBE":        ["DBE", "Disadvantaged Business Enterprise"],
    "SDVOSB":     ["SDVOSB", "Service-Disabled Veteran-Owned"],
}

def score_opportunity(opportunity: dict, company_profile: dict) -> dict:
    """
    Score an opportunity 0-100 for this company.
    Returns score + reasoning so the UI can explain the match.
    """
    score = 0
    reasons = []
    warnings = []

    certs = company_profile.get("certifications", [])
    naics_codes = company_profile.get("naics_codes", [])
    opp_naics = opportunity.get("naics_code", "")
    opp_set_aside = opportunity.get("set_aside", "") or ""
    opp_title = opportunity.get("title", "").lower()
    opp_desc = opportunity.get("description", "").lower()

    # ── NAICS match (0-35 pts) ──
    if opp_naics:
        if opp_naics in naics_codes:
            score += 35
            reasons.append(f"Exact NAICS match ({opp_naics})")
        elif any(opp_naics[:4] == c[:4] for c in naics_codes):
            score += 20
            reasons.append(f"Close NAICS match ({opp_naics})")
        elif any(opp_naics[:2] == c[:2] for c in naics_codes):
            score += 10
            reasons.append(f"Industry NAICS match ({opp_naics})")

    # ── Set-aside match (0-35 pts) ──
    if opp_set_aside:
        matched_cert = None
        for cert in certs:
            eligible = CERT_SET_ASIDE_MAP.get(cert, [])
            if any(e.lower() in opp_set_aside.lower() for e in eligible):
                matched_cert = cert
                break
        if matched_cert:
            score += 35
            reasons.append(f"{matched_cert} certification matches {opp_set_aside} set-aside")
        else:
            warnings.append(f"Set-aside is {opp_set_aside} — verify your certifications qualify")
    else:
        score += 15  # Full & open — you can bid
        reasons.append("Full & open competition — any qualified firm can bid")

    # ── Keyword relevance (0-20 pts) ──
    capabilities = company_profile.get("capabilities", "").lower()
    cap_words = set(re.findall(r'\b\w{4,}\b', capabilities))
    opp_words = set(re.findall(r'\b\w{4,}\b', opp_title + " " + opp_desc))
    overlap = cap_words & opp_words
    keyword_score = min(20, len(overlap) * 2)
    score += keyword_score
    if keyword_score >= 10:
        reasons.append(f"Strong capability keyword match ({len(overlap)} terms)")
    elif keyword_score > 0:
        reasons.append(f"Partial capability match ({len(overlap)} terms)")

    # ── Deadline urgency bonus/penalty (0-10 pts) ──
    from datetime import datetime
    deadline_str = opportunity.get("deadline", "")
    if deadline_str:
        try:
            deadline = datetime.fromisoformat(deadline_str.replace("Z", ""))
            days_left = (deadline - datetime.now()).days
            if 3 <= days_left <= 14:
                score += 10
                reasons.append(f"Deadline in {days_left} days — act now")
            elif days_left < 3:
                score += 5
                warnings.append(f"Only {days_left} day(s) left — very tight deadline")
            elif days_left > 30:
                score += 8
                reasons.append(f"{days_left} days to prepare — good runway")
        except Exception:
            pass

    score = max(0, min(100, score))

    return {
        "score": score,
        "grade": "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 50 else "D",
        "reasons": reasons,
        "warnings": warnings,
        "recommend": score >= 70,
    }


def rank_opportunities(opportunities: List[dict], company_profile: dict) -> List[dict]:
    """Score and rank all opportunities for a company profile"""
    scored = []
    for opp in opportunities:
        match = score_opportunity(opp, company_profile)
        scored.append({**opp, "match": match})
    return sorted(scored, key=lambda x: x["match"]["score"], reverse=True)
