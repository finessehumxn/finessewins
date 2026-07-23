"""
FinesseWins — Next Moves engine (the personalization layer).

A toolbox is not a product. A first-time bidder does not know which of eleven
tools to open on a Tuesday morning; they know they want to win work. This reads
everything we already know about a specific business — what they're certified
for, which NAICS codes they work in, what's registered, what they've bid, what
they've won — and returns a short, ranked list of the highest-value things THIS
business should do next, each with a reason and a one-click destination.

Design rules:
  • Never more than a handful of moves. A list of 20 "opportunities" is the
    same overwhelm the search engines already sell.
  • Every move is specific to them and carries the number that makes it real
    ("3 contracts worth $4.2M in YOUR code expire within 90 days").
  • Blockers first: nothing else matters if they can't legally be awarded.
  • Degrade gracefully — a slow or failed data source drops its moves, never
    the whole dashboard.
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import List, Optional

import usaspending as usa
from naics_data import naics_name


def _money(v: float) -> str:
    v = float(v or 0)
    if v >= 1_000_000_000:
        return f"${v/1_000_000_000:.1f}B"
    if v >= 1_000_000:
        return f"${v/1_000_000:.1f}M"
    if v >= 1_000:
        return f"${v/1_000:.0f}K"
    return f"${v:,.0f}"


def _move(id, title, why, cta, page, *, impact="medium", stat=None, blocker=False):
    return {
        "id": id, "title": title, "why": why, "cta": cta, "page": page,
        "impact": impact, "stat": stat, "blocker": blocker,
    }


def _stage(profile: dict, proposals: List[dict]) -> str:
    """Where this business actually is, so the app can speak to that."""
    p = profile or {}
    if not p.get("name") or not (p.get("naics_codes") or []):
        return "setup"
    if not p.get("uei"):
        return "registering"
    if not proposals:
        return "first_bid"
    if not any((x or {}).get("outcome") == "won" for x in proposals):
        return "bidding"
    return "growing"


STAGE_COPY = {
    "setup":       ("Let's get you set up", "A few details unlock everything else — it takes about five minutes."),
    "registering": ("Get award-ready", "You can't be awarded a federal contract until SAM.gov registration is active."),
    "first_bid":   ("Time to land your first bid", "You're set up. Now the goal is one good, compliant submission."),
    "bidding":     ("Keep the pipeline moving", "You're bidding. Now it's about picking better and closing gaps."),
    "growing":     ("Build on the win", "You've won. Now compound it — recompetes, teaming, and a track record that sells."),
}


async def next_moves(profile: Optional[dict], proposals: List[dict], *, deep: bool = True) -> dict:
    """Build this business's ranked action list."""
    p = profile or {}
    proposals = proposals or []
    codes = [c for c in (p.get("naics_codes") or []) if c]
    certs = [c for c in (p.get("certifications") or []) if c]
    stage = _stage(p, proposals)
    moves: List[dict] = []

    # ── 1. Blockers — nothing else matters until these clear ──────────────
    if not p.get("name"):
        moves.append(_move("profile", "Add your company profile",
                           "Every proposal, capability statement, and match is built from it.",
                           "Complete profile", "profile", impact="high", blocker=True))
    if not codes:
        moves.append(_move("naics", "Add the NAICS codes for your work",
                           "They're how the government classifies what you do — without them we can't match you to anything.",
                           "Add my codes", "profile", impact="high", blocker=True))
    if not p.get("uei"):
        moves.append(_move("sam", "Get SAM.gov registered",
                           "You cannot legally be awarded a federal contract without an active registration. It's free.",
                           "Start registration", "get-registered", impact="high", blocker=True))
    if not certs:
        moves.append(_move("certs", "Confirm your certifications",
                           "WOSB/MBE/DBE/8(a) status is what makes set-aside contracts winnable for you.",
                           "Check eligibility", "toolkit", impact="high"))
    if not (p.get("past_performance") or []):
        moves.append(_move("pastperf", "Write one past-performance entry",
                           "Commercial and nonprofit work counts. Evaluators want scope, numbers, and a reference they can call.",
                           "Build an entry", "toolkit", impact="medium"))

    # ── 2. Their pipeline — deadlines and unrecorded outcomes ─────────────
    now = datetime.utcnow()
    soon = []
    for x in proposals:
        d = (x or {}).get("deadline")
        if not d:
            continue
        try:
            days = (datetime.fromisoformat(str(d)[:19]) - now).days
        except Exception:
            continue
        if 0 <= days <= 10:
            soon.append((days, x))
    if soon:
        soon.sort()
        days, x = soon[0]
        moves.append(_move("deadline", f"{len(soon)} bid{'s' if len(soon) > 1 else ''} due within 10 days",
                           f"“{(x.get('title') or x.get('solicitation_number') or 'A proposal')}” is due in {days} day{'s' if days != 1 else ''}.",
                           "Open pipeline", "dashboard", impact="high",
                           stat=f"{days}d"))

    undecided = [x for x in proposals
                 if (x or {}).get("outcome") in (None, "", "submitted")
                 and (x or {}).get("status") in ("complete", "submitted")]
    if len(undecided) >= 2:
        moves.append(_move("outcomes", f"Record what happened on {len(undecided)} bids",
                           "Your win rate is the most persuasive thing you own — and it only exists if you log outcomes.",
                           "Update outcomes", "dashboard", impact="medium",
                           stat=str(len(undecided))))

    lost_recent = [x for x in proposals if (x or {}).get("outcome") == "lost"]
    if lost_recent:
        moves.append(_move("debrief", "Request a debrief on a loss",
                           "Agencies must tell you why you lost — but federal rules give you only 3 days to ask.",
                           "Write the request", "toolkit", impact="medium"))

    # ── 3. Live market intelligence in THEIR codes ────────────────────────
    if deep and codes:
        code = codes[0]
        label = naics_name(code) or f"NAICS {code}"
        try:
            expiring, primes = await asyncio.wait_for(
                asyncio.gather(
                    usa.expiring_awards(code, within_days=120, pages=1),
                    usa.top_primes(code, pages=1, limit=5),
                    return_exceptions=True,
                ),
                timeout=25,
            )
        except Exception:
            expiring, primes = None, None

        if isinstance(expiring, list) and expiring:
            total = sum(r["amount"] for r in expiring)
            moves.append(_move(
                "recompete",
                f"{len(expiring)} contracts in your work expire within 120 days",
                f"{label} — {_money(total)} coming up for recompete. Winning starts before the RFP posts.",
                "See recompetes", "recompetes", impact="high",
                stat=_money(total)))

        if isinstance(primes, dict) and primes.get("primes"):
            top = primes["primes"][0]
            withplan = [x for x in primes["primes"] if x.get("subk_plan_likely")]
            if withplan:
                moves.append(_move(
                    "teaming",
                    f"Call {top['name'].split(',')[0][:38]} about subcontracting",
                    f"They hold {_money(top['total'])} in {label} and must carry a small-business subcontracting plan — they need firms like you.",
                    "See teaming targets", "recompetes", impact="high",
                    stat=f"{len(withplan)} primes"))

    # ── 4. Always give them a way forward ─────────────────────────────────
    if not any(m["page"] in ("opportunities", "rfp-shredder") for m in moves):
        if codes:
            moves.append(_move("search", "Check today's open bids in your codes",
                               "New solicitations post every day across SAM.gov, Grants.gov, FedConnect and state portals.",
                               "Find bids", "opportunities", impact="medium"))
        moves.append(_move("shred", "Have an RFP already? Shred it",
                           "Upload the solicitation and get every requirement as a compliance matrix before you write a word.",
                           "Open RFP Shredder", "rfp-shredder", impact="medium"))

    rank = {"high": 0, "medium": 1, "low": 2}
    moves.sort(key=lambda m: (not m["blocker"], rank.get(m["impact"], 3)))

    title, sub = STAGE_COPY.get(stage, STAGE_COPY["first_bid"])
    return {
        "stage": stage,
        "headline": title,
        "subhead": sub,
        "company": p.get("name"),
        "moves": moves[:6],
        "blockers": sum(1 for m in moves if m["blocker"]),
    }
