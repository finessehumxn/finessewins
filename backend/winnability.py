"""
FinesseWins — Winnability Engine

The thing no one builds for first-time / minority small-business bidders: an
HONEST, data-grounded answer to "should I even bid on this?" — so they stop
burning 40 hours on proposals they can't win.

Everything here is derived from REAL federal award history (usaspending.py):
  • price-to-win band   — what winning awards actually paid
  • incumbent analysis  — who wins here, and how entrenched they are
  • small-biz / WOSB share — how much of the money reaches firms like theirs
  • an honest 0–100 score + a concrete path to win

No LLM required — this is math on public data, so it's fast and defensible.
"""
from __future__ import annotations

import asyncio
import time
from typing import List, Optional

import usaspending as usa

# Market reads are cached per (naics, agency): award history moves slowly and
# many listings share a NAICS, so inline scoring stays cheap.
_MARKET_TTL = 6 * 3600
_market_cache: dict = {}


def _fmt(n) -> str:
    if not n:
        return "—"
    n = float(n)
    if n >= 1_000_000:
        return f"${n/1_000_000:.1f}M"
    if n >= 1_000:
        return f"${n/1_000:.0f}K"
    return f"${n:,.0f}"


async def analyze(
    naics_code: str,
    agency: Optional[str] = None,
    set_aside: Optional[str] = None,
    title: str = "",
    company_profile: Optional[dict] = None,
) -> dict:
    profile = company_profile or {}
    certs = profile.get("certifications", []) or []
    has_past_perf = bool(profile.get("past_performance"))

    # Which set-aside codes represent "firms like this company"?
    my_codes: List[str] = []
    for c in certs:
        my_codes += usa.CERT_SETASIDE_CODES.get(c, [])
    my_codes = sorted(set(my_codes))

    # Shared, cached market read (total, small-biz share, incumbents, entrenchment).
    market = await market_read(naics_code, agency)
    total_count = market["total_count"]
    small_biz_share = market["small_biz_share"]
    incumbents = market["incumbents"]
    entrench = market["entrenchment"]
    data_ok = market["data_ok"]

    # "Your lane" share (depends on the company's certs — not cached in market_read).
    my_count = await usa.award_count(naics_code, agency, my_codes) if my_codes else 0
    my_share = round(100 * my_count / total_count) if (total_count and my_count) else None

    # Price comps from the pool matching how THIS bid is competed (its set-aside).
    price = await _price_read(naics_code, agency, set_aside) or market["smallbiz_price"]

    score, reasons, warnings = _score(
        certs=certs, set_aside=set_aside, small_biz_share=small_biz_share,
        my_share=my_share, entrench=entrench, has_past_perf=has_past_perf,
        price=price, data_ok=data_ok,
    )
    verdict, verdict_tone = _verdict(score)
    path = _path_to_win(
        certs=certs, my_codes=my_codes, set_aside=set_aside,
        small_biz_share=small_biz_share, entrench=entrench, incumbents=incumbents,
        has_past_perf=has_past_perf, price=price,
    )

    return {
        "naics_code": naics_code,
        "agency": agency,
        "title": title,
        "data_available": data_ok,
        "score": score,
        "verdict": verdict,
        "verdict_tone": verdict_tone,
        "reasons": reasons,
        "warnings": warnings,
        "market": {
            "total_awards_3y": total_count,
            "small_business_share_pct": small_biz_share,
            "your_lane_share_pct": my_share,
            "your_lane_label": _lane_label(certs),
        },
        "price_to_win": _price_band(price),
        "incumbents": [
            {"name": r["name"], "awards": r["count"], "total": r["total"],
             "total_fmt": _fmt(r["total"])}
            for r in incumbents
        ],
        "incumbent_entrenchment_pct": entrench,
        "path_to_win": path,
    }


# ── cached market read (shared by full analyze + inline quick scores) ────────
async def market_read(naics_code: str, agency: Optional[str] = None) -> dict:
    key = f"{naics_code}|{agency or ''}"
    hit = _market_cache.get(key)
    if hit and (time.monotonic() - hit[0]) < _MARKET_TTL:
        return hit[1]

    total_count, smallbiz_count, sb_count_for_page = await asyncio.gather(
        usa.award_count(naics_code, agency),
        usa.award_count(naics_code, agency, usa.SMALL_BIZ_CODES),
        usa.award_count(naics_code, agency, usa.SMALL_BIZ_CODES),
    )
    page = max(1, min(90, (sb_count_for_page // 100) // 2)) if sb_count_for_page else 1
    all_awards, smallbiz_awards = await asyncio.gather(
        usa.award_search(naics_code, agency, limit=100),
        usa.award_search(naics_code, agency, usa.SMALL_BIZ_CODES, limit=100, page=page),
    )
    incumbents = usa.top_recipients(all_awards, 5)
    entrench = round(100 * incumbents[0]["count"] / len(all_awards)) if (all_awards and incumbents) else 0
    result = {
        "total_count": total_count,
        "smallbiz_count": smallbiz_count,
        "small_biz_share": round(100 * smallbiz_count / total_count) if total_count else None,
        "incumbents": incumbents,
        "entrenchment": entrench,
        "smallbiz_price": _price_band(usa.price_stats(smallbiz_awards) or usa.price_stats(all_awards)),
        "data_ok": bool(all_awards) or total_count > 0,
    }
    _market_cache[key] = (time.monotonic(), result)
    return result


async def _price_read(naics_code, agency, set_aside):
    """Set-aside-specific price band (cached). None for full-and-open (use small-biz)."""
    codes = usa.codes_for_setaside(set_aside)
    if not codes:
        return None
    key = f"price|{naics_code}|{agency or ''}|{','.join(codes)}"
    hit = _market_cache.get(key)
    if hit and (time.monotonic() - hit[0]) < _MARKET_TTL:
        return hit[1]
    count = await usa.award_count(naics_code, agency, codes)
    page = max(1, min(90, (count // 100) // 2)) if count else 1
    awards = await usa.award_search(naics_code, agency, codes, limit=100, page=page)
    band = _price_band(usa.price_stats(awards))
    _market_cache[key] = (time.monotonic(), band)
    return band


# ── lightweight inline score (for annotating listings) ───────────────────────
async def quick_score(naics_code: str, agency: Optional[str], set_aside: Optional[str],
                      profile: Optional[dict]) -> dict:
    """Cheap winnability read for a listing — reuses the cached market data."""
    if not naics_code:
        return {"score": None, "tone": "ok", "label": "No NAICS"}
    profile = profile or {}
    market = await market_read(naics_code, agency)
    score, _, _ = _score(
        certs=profile.get("certifications", []) or [],
        set_aside=set_aside,
        small_biz_share=market["small_biz_share"],
        my_share=None,
        entrench=market["entrenchment"],
        has_past_perf=bool(profile.get("past_performance")),
        price=market["smallbiz_price"] or {},
        data_ok=market["data_ok"],
    )
    verdict, tone = _verdict(score)
    return {"score": score, "tone": tone, "label": verdict}


async def score_many(items: List[dict], profile: Optional[dict], max_lookups: int = 14) -> dict:
    """Batch quick-scores for a list of listings, keyed by each item's id.

    Bounds cost: only the first `max_lookups` UNIQUE (naics, agency) pairs hit the
    award API (cached thereafter); extra uniques return null so the UI just omits
    a badge rather than stalling."""
    seen_keys: dict = {}
    order: List[str] = []
    for it in items:
        naics = (it.get("naics_code") or "").strip()
        if not naics:
            continue
        k = f"{naics}|{it.get('agency') or ''}"
        if k not in seen_keys:
            seen_keys[k] = None
            order.append(k)

    allowed = set(order[:max_lookups])

    async def _read(k):
        naics, agency = k.split("|", 1)
        try:
            return k, await market_read(naics, agency or None)
        except Exception:
            return k, None

    reads = await asyncio.gather(*[_read(k) for k in allowed])
    market_by_key = {k: m for k, m in reads}

    out: dict = {}
    for it in items:
        naics = (it.get("naics_code") or "").strip()
        _id = it.get("id")
        if not naics or _id is None:
            continue
        k = f"{naics}|{it.get('agency') or ''}"
        market = market_by_key.get(k)
        if not market:
            continue
        score, _, _ = _score(
            certs=(profile or {}).get("certifications", []) or [],
            set_aside=it.get("set_aside"),
            small_biz_share=market["small_biz_share"],
            my_share=None,
            entrench=market["entrenchment"],
            has_past_perf=bool((profile or {}).get("past_performance")),
            price=market["smallbiz_price"] or {},
            data_ok=market["data_ok"],
        )
        verdict, tone = _verdict(score)
        out[str(_id)] = {"score": score, "tone": tone, "label": verdict}
    return out


# ── scoring ──────────────────────────────────────────────────────────────────
def _score(*, certs, set_aside, small_biz_share, my_share, entrench,
           has_past_perf, price, data_ok):
    score = 50
    reasons, warnings = [], []

    setaside_matches_me = _setaside_matches_cert(set_aside, certs)
    if setaside_matches_me:
        score += 25
        reasons.append(f"This is a {set_aside} set-aside and you're {set_aside}-certified — "
                       "you're only competing against firms like you.")
    elif _is_setaside(set_aside):
        score -= 10
        warnings.append(f"Set-aside is {set_aside}; confirm your certifications qualify.")
    else:
        # Full & open — how much of this market do small firms actually win?
        if small_biz_share is not None:
            if small_biz_share >= 40:
                score += 10
                reasons.append(f"Small businesses win {small_biz_share}% of awards here — a friendly market.")
            elif small_biz_share <= 15:
                score -= 18
                warnings.append(f"Only {small_biz_share}% of awards here go to small businesses — primes dominate.")

    if my_share is not None and my_share >= 10:
        score += 8
        reasons.append(f"Firms in your lane already win ~{my_share}% of this work.")

    if entrench >= 40:
        score -= 15
        warnings.append(f"One incumbent holds ~{entrench}% of recent awards — recompetes favor the incumbent.")
    elif entrench and entrench <= 20:
        score += 5
        reasons.append("No single incumbent dominates — the field is open.")

    if not has_past_perf:
        big = price.get("median", 0) > 3_000_000
        score -= 15 if big else 8
        warnings.append("No past performance on file — evaluators lean on proven performers"
                        + (" on awards this size." if big else "."))
    else:
        score += 5
        reasons.append("You have past performance to cite.")

    if not data_ok:
        warnings.append("Limited federal award history for this code — treat this as a rough read.")

    return max(5, min(95, score)), reasons, warnings


def _verdict(score: int):
    if score >= 70:
        return "Worth bidding", "good"
    if score >= 45:
        return "Winnable — with the right moves", "ok"
    if score >= 25:
        return "Long shot", "warn"
    return "Skip this one", "bad"


def _path_to_win(*, certs, my_codes, set_aside, small_biz_share, entrench,
                 incumbents, has_past_perf, price):
    steps = []
    if not _setaside_matches_cert(set_aside, certs) and not _is_setaside(set_aside):
        if small_biz_share is not None and small_biz_share <= 20:
            steps.append("Primes win most of this work full-and-open. Look for a small-business or "
                         "socioeconomic set-aside version, or team as a subcontractor to a prime.")
        if my_codes:
            steps.append("Filter to your set-aside lane (e.g. WOSB/8(a)/HUBZone) — restricted "
                         "competition dramatically improves your odds.")
    if entrench >= 40 and incumbents:
        steps.append(f"{incumbents[0]['name']} holds ~{entrench}% of recent awards. On a recompete you'll "
                     "need a clear price or innovation edge — or target a different sub-agency/office.")
    if not has_past_perf:
        steps.append("Line up 2–3 past-performance references now — private-sector, subcontract, and "
                     "nonprofit work all count under FAR 15.305 (FinesseWins's zero-past-performance mode drafts these).")
    if price.get("p25") and price.get("median"):
        steps.append(f"Winning awards here run ~{_fmt(price['p25'])}–{_fmt(price['median'])}. "
                     f"Price competitively near {_fmt(price['p25'])} rather than guessing.")
    steps.append("Register/confirm your certifications and set-aside eligibility before the deadline so you're "
                 "not disqualified on a technicality.")
    return steps


# ── helpers ──────────────────────────────────────────────────────────────────
def _price_band(price: dict) -> Optional[dict]:
    if not price or not price.get("median"):
        return None
    return {
        "sample": price.get("count"),
        "low": price.get("p25"), "low_fmt": _fmt(price.get("p25")),
        "typical": price.get("median"), "typical_fmt": _fmt(price.get("median")),
        "high": price.get("p75"), "high_fmt": _fmt(price.get("p75")),
        "target_fmt": _fmt(price.get("p25")),
    }


def _is_setaside(set_aside: Optional[str]) -> bool:
    return bool(set_aside) and set_aside.strip().lower() not in ("", "none", "full & open", "full and open")


def _setaside_matches_cert(set_aside: Optional[str], certs: list) -> bool:
    if not _is_setaside(set_aside):
        return False
    s = set_aside.upper()
    for c in certs:
        cu = c.upper().replace("(", "").replace(")", "")
        if cu and (cu in s or s in cu):
            return True
    if "WOSB" in s and any("WOSB" in c.upper() for c in certs):
        return True
    if "8" in s and any("8" in c for c in certs):
        return True
    return False


def _lane_label(certs: list) -> str:
    for c in ("WOSB", "8a", "8(a)", "HUBZone", "SDVOSB"):
        if any(c.upper().replace("(", "").replace(")", "") in x.upper().replace("(", "").replace(")", "") for x in certs):
            return c
    return "small business"


async def _zero():
    return 0


async def _empty():
    return []
