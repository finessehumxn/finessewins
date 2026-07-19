"""
FinesseWins — offline test suite.

Covers the pure logic and in-memory stores without any network or external keys.
Run:  cd backend && pip install pytest && pytest -q
"""
import asyncio
import io
import os
import types

os.environ.pop("SUPABASE_URL", None)
os.environ.pop("SUPABASE_SERVICE_KEY", None)
os.environ["RATE_LIMIT_DISABLED"] = "0"

import db
import advisor
import winnability
import naics_data
import opportunity_matcher as om
from docx_export import build_proposal_docx, safe_filename
import sources
from sources.base import BidSource, Query, opportunity
import ratelimit


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ── NAICS names ──────────────────────────────────────────────────
def test_naics_name_exact_and_sector():
    assert naics_data.naics_name("541512") == "Computer Systems Design Services"
    assert naics_data.naics_name("624999") == "Health Care & Social Assistance"  # sector fallback
    assert naics_data.naics_name(None) is None


def test_winloss_analytics():
    import main
    rows = [
        {"user_id": "wl1", "agency": "AZ DCS", "naics_code": "624110", "set_aside": "WOSB", "outcome": "won", "award_value": 85000},
        {"user_id": "wl1", "agency": "AZ DCS", "naics_code": "624110", "set_aside": "WOSB", "outcome": "lost"},
        {"user_id": "wl1", "agency": "City of Chandler", "naics_code": "541611", "outcome": "won", "award_value": 40000},
        {"user_id": "wl1", "agency": "City of Chandler", "naics_code": "541611", "outcome": "submitted"},
        {"user_id": "wl1", "agency": "VA", "naics_code": "541512", "outcome": None},
    ]
    for i, r in enumerate(rows):
        run(db.proposals.create(f"wl{i}", r))

    class U:
        id = "wl1"
    res = run(main.winloss_analytics(U()))

    assert res["totals"] == {"proposals": 5, "won": 2, "lost": 1,
                             "submitted_awaiting": 1, "no_bid": 0, "undecided": 1}
    assert res["win_rate"] == 67          # 2 of 3 decided bids
    assert res["dollars_won"] == 125000
    assert res["avg_award"] == 62500
    # agencies ranked by wins, with per-agency rate
    top = res["by_agency"][0]
    assert top["won"] == 1 and top["win_rate"] in (50, 100)
    # a bidder with no decided bids gets a null rate rather than a divide-by-zero
    class U2:
        id = "nobody"
    empty = run(main.winloss_analytics(U2()))
    assert empty["win_rate"] is None and empty["decided"] == 0


def test_docparse_docx_sections_and_text():
    import io, docx, docparse
    d = docx.Document()
    d.add_heading("SECTION L — INSTRUCTIONS", level=1)
    d.add_paragraph("Submit a technical approach not to exceed 10 pages.")
    d.add_heading("SECTION M — EVALUATION", level=1)
    d.add_paragraph("Proposals scored on experience and price.")
    buf = io.BytesIO(); d.save(buf)
    parsed = docparse.parse(buf.getvalue(), "rfp.docx")
    assert parsed.kind == "docx"
    assert "technical approach" in parsed.text.lower()
    heads = [s.heading for s in parsed.sections]
    assert any("SECTION L" in h for h in heads) and any("SECTION M" in h for h in heads)


def test_docparse_rejects_unsupported():
    import docparse, pytest
    with pytest.raises(ValueError):
        docparse.parse(b"data", "notes.rtf")


def test_shredder_normalizes_and_scores(monkeypatch):
    import rfp_shredder as R

    class FakeResp:
        def __init__(self, c): self.content = c
    class FakeLLM:
        max_tokens = 8000
        def __init__(self, c): self._c = c
        async def ainvoke(self, msgs): return FakeResp(self._c)

    # shred: fills ids + coerces mandatory
    monkeypatch.setattr(R, "_get_llm", lambda mt=8000: FakeLLM(
        '{"summary":"s","requirements":[{"text":"Submit tech approach","category":"Technical"}]}'))
    out = run(R.shred("rfp text"))
    assert out["requirements"][0]["id"] == "R1" and out["requirements"][0]["mandatory"] is True

    # analyze: clamps coverage, fills missing reqs, computes counts
    reqs = [{"id": "R1", "text": "a", "category": "x"}, {"id": "R2", "text": "b", "category": "y"}]
    monkeypatch.setattr(R, "_get_llm", lambda mt=8000: FakeLLM(
        '{"matrix":[{"id":"R1","status":"addressed","coverage":999,"doc":"d","evidence":"e","note":"n"}]}'))
    a = run(R.analyze(reqs, [{"name": "d.docx", "text": "content"}]))
    assert a["matrix"][0]["coverage"] == 100
    assert a["counts"] == {"addressed": 1, "partial": 0, "missing": 1, "total": 2}
    assert a["coverage_pct"] == 50


def test_naics_search_by_trade_and_code():
    def top(q):
        r = naics_data.search(q)
        return r[0]["code"] if r else None
    # plain-word trade searches (what a first-time bidder actually types)
    assert top("cleaning") == "561720"        # Janitorial
    assert top("janitorial") == "561720"
    assert top("trucking") == "484110"        # General Freight Trucking
    assert top("catering") == "722320"        # Caterers
    assert top("security guard") == "561612"
    assert top("plumbing") == "238220"
    assert top("landscaping") == "561730"
    assert top("home health") == "621610"
    # exact code query returns that code first
    assert top("561720") == "561720"
    # code prefix works
    assert "238220" in [r["code"] for r in naics_data.search("2382")]
    # empty query falls back to the starter list
    assert naics_data.search("") == naics_data.suggestions()
    # nonsense returns nothing (not a crash)
    assert naics_data.search("zzzzzz") == []


# ── opportunity matcher ──────────────────────────────────────────
def test_opportunity_matcher_scores_and_ranks():
    profile = {"certifications": ["WOSB"], "naics_codes": ["541512"], "capabilities": "software development cloud"}
    opp = {"naics_code": "541512", "set_aside": "WOSB", "title": "Cloud software", "description": "software", "deadline": ""}
    m = om.score_opportunity(opp, profile)
    assert m["score"] > 50 and m["recommend"] is True
    ranked = om.rank_opportunities([opp, {"naics_code": "111111", "title": "farm"}], profile)
    assert ranked[0]["match"]["score"] >= ranked[1]["match"]["score"]


# ── in-memory stores ─────────────────────────────────────────────
def test_proposal_store_scoping_and_month_count():
    run(db.proposals.create("p1", {"id": "p1", "user_id": "u1", "status": "generating",
                                    "created_at": "2000-01-01T00:00:00", "volumes": {}}))
    run(db.proposals.update("p1", {"status": "complete"}))
    assert run(db.proposals.get("p1", "u1"))["status"] == "complete"
    assert run(db.proposals.get("p1", "OTHER")) is None
    assert run(db.proposals.count_this_month("u1")) == 0  # dated in the past, not this month


def test_profile_upsert_merges():
    run(db.profiles.upsert("u2", {"name": "MC", "certifications": ["WOSB"]}))
    run(db.profiles.upsert("u2", {"alerts_enabled": False}))
    p = run(db.profiles.get("u2"))
    assert p["name"] == "MC" and p["certifications"] == ["WOSB"] and p["alerts_enabled"] is False


def test_match_store_dedupe_and_unseen():
    rows = [{"opportunity_id": "o1", "title": "A"}, {"opportunity_id": "o1", "title": "dup"}, {"opportunity_id": "o2", "title": "B"}]
    new = run(db.matches.add_new("u3", rows))
    assert len(new) == 2
    assert run(db.matches.add_new("u3", rows)) == []          # all seen now
    assert run(db.matches.count_unseen("u3")) == 2
    run(db.matches.mark_seen("u3"))
    assert run(db.matches.count_unseen("u3")) == 0


def test_client_store_crud_and_isolation():
    c = run(db.clients.create("adv1", {"name": "Desert Bloom", "certifications": ["WOSB"], "naics_codes": ["624110"]}))
    assert c["id"]
    run(db.clients.update("adv1", c["id"], {"bids_won": 2, "dollars_won": 5000}))
    assert run(db.clients.get("adv1", c["id"]))["bids_won"] == 2
    assert run(db.clients.get("adv2", c["id"])) is None       # other advisor can't see it
    run(db.clients.delete("adv1", c["id"]))
    assert run(db.clients.get("adv1", c["id"])) is None


# ── advisor impact ───────────────────────────────────────────────
def test_advisor_impact_and_csv():
    clients = [
        {"name": "A", "certifications": ["WOSB", "MBE"], "naics_codes": ["541512"], "bids_submitted": 6, "bids_won": 1, "dollars_won": 85000, "stage": "bidding"},
        {"name": "B", "certifications": [], "naics_codes": ["541611"], "bids_submitted": 2, "bids_won": 0, "dollars_won": 0, "stage": "lead"},
    ]
    imp = advisor.compute_impact(clients)
    assert imp["clients_served"] == 2 and imp["diverse_clients"] == 1 and imp["diverse_pct"] == 50
    assert imp["bids_submitted"] == 8 and imp["bids_won"] == 1 and imp["dollars_won"] == 85000
    csv = advisor.impact_csv(clients, "Phoenix APEX").getvalue()
    assert "Program Impact Report" in csv and "85000" in csv


# ── DOCX export ──────────────────────────────────────────────────
def test_docx_export_is_valid():
    proposal = {"title": "Test", "agency": "SSS", "solicitation_number": "X-1", "status": "complete",
                "volumes": {"technical": "## Approach\nWe do it.\n\n- point one\n- **bold** two"}}
    data = build_proposal_docx(proposal, {"name": "MC LLC", "certifications": ["WOSB"]}).getvalue()
    assert data[:2] == b"PK" and len(data) > 5000            # valid .docx zip
    assert safe_filename(proposal) == "X-1.docx"


# ── winnability scoring (pure) ───────────────────────────────────
def test_winnability_score_logic():
    hi, _, _ = winnability._score(certs=["WOSB"], set_aside="WOSB", small_biz_share=40,
                                  my_share=15, entrench=10, has_past_perf=True,
                                  price={"median": 1_000_000}, data_ok=True)
    lo, _, warns = winnability._score(certs=[], set_aside=None, small_biz_share=10,
                                      my_share=None, entrench=50, has_past_perf=False,
                                      price={"median": 5_000_000}, data_ok=True)
    assert hi >= 70 and winnability._verdict(hi)[0] == "Worth bidding"
    assert lo < 40 and any("small businesses" in w for w in warns)


def test_winnability_fmt_and_band():
    assert winnability._fmt(None) == "—" and winnability._fmt(0) == "—"
    assert winnability._fmt(432000) == "$432K" and winnability._fmt(1_200_000) == "$1.2M"
    assert winnability._price_band({}) is None
    assert winnability._price_band({"count": 5, "p25": 1000, "median": 2000, "p75": 3000})["typical_fmt"] == "$2K"


def test_quick_score_uses_market(monkeypatch):
    async def fake_market(naics, agency=None):
        return {"total_count": 100, "smallbiz_count": 40, "small_biz_share": 40,
                "incumbents": [], "entrenchment": 5, "smallbiz_price": None, "data_ok": True}
    monkeypatch.setattr(winnability, "market_read", fake_market)
    q = run(winnability.quick_score("541512", None, "WOSB", {"certifications": ["WOSB"], "past_performance": [{"x": 1}]}))
    assert q["score"] >= 70 and q["tone"] == "good"


# ── source aggregator (dedupe + sample hiding) ───────────────────
class _Fake(BidSource):
    name = "Fake"
    def __init__(self, rows): self._rows = rows
    async def search(self, q): return self._rows


def test_search_all_dedupes_and_hides_samples(monkeypatch):
    live = opportunity(id="1", source="Live", title="Live bid", agency="A", url="u", solicitation_number="S1", live=True)
    samp = opportunity(id="2", source="Curated", title="Sample bid", agency="B", url="u", solicitation_number="S2", live=False)
    dup = opportunity(id="3", source="Live", title="Dup", agency="A", url="u", solicitation_number="S1", live=True)
    monkeypatch.setattr(sources, "ALL_SOURCES", [_Fake([live, dup]), _Fake([samp])])

    monkeypatch.setattr(sources, "HIDE_SAMPLE", False)
    res = run(sources.search_all("x"))
    ids = {r["solicitation_number"] for r in res["results"]}
    assert "S1" in ids and "S2" in ids and len(res["results"]) == 2   # S1 deduped

    monkeypatch.setattr(sources, "HIDE_SAMPLE", True)
    res2 = run(sources.search_all("x"))
    assert all(not r["sample"] for r in res2["results"]) and res2["sample_hidden"] >= 1


# ── rate limiter ─────────────────────────────────────────────────
def test_rate_limiter_blocks_after_max():
    dep = ratelimit.rate_limiter(max=3, window=60, name="test")
    req = types.SimpleNamespace(headers={"x-forwarded-for": "9.9.9.9"}, client=types.SimpleNamespace(host="9.9.9.9"))
    # headers needs .get
    req.headers = {"x-forwarded-for": "9.9.9.9"}
    req = types.SimpleNamespace(headers=_H({"x-forwarded-for": "1.2.3.4"}), client=types.SimpleNamespace(host="1.2.3.4"))
    for _ in range(3):
        run(dep(req))                       # first 3 ok
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        run(dep(req))
    assert exc.value.status_code == 429


class _H(dict):
    def get(self, k, d=None): return dict.get(self, k, d)
