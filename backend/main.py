"""
FinesseWins — Government Contract Proposal Platform
FastAPI backend with LangGraph-powered proposal generation.

Now wired for production:
  • Supabase Auth (JWT) protects per-user data   → auth.py
  • Supabase Postgres persistence                 → db.py
  • Real DOCX export (python-docx)                → docx_export.py
  • Amendment + deadline email notifications      → email_service.py / scheduler.py
"""
import os
import uuid
import asyncio
from datetime import datetime
from typing import Optional, List

# Load a local .env in DEV ONLY. On a hosting platform (Render sets RENDER=true)
# the platform's own env vars are authoritative — a stray .env / Secret File must
# never shadow them, or the dashboard value silently does nothing.
if not os.environ.get("RENDER"):
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except Exception:
        pass

def _hydrate_env_from_secret_files(secrets_dir: str = "/etc/secrets") -> None:
    """Render 'Secret Files' are files on disk, not environment variables — so a
    key put there is silently invisible to the app. Surface any ENV-VAR-shaped
    secret file as an env var (a real env var always wins) so a key works from
    EITHER place. This is the difference between 'saved it' and 'it took effect'."""
    import re as _re
    try:
        if not os.path.isdir(secrets_dir):
            return
        for name in os.listdir(secrets_dir):
            if not _re.fullmatch(r"[A-Z][A-Z0-9_]{2,}", name):
                continue                       # only ENV_VAR-looking filenames
            if (os.environ.get(name) or "").strip():
                continue                       # an explicitly-set env var wins
            try:
                val = open(os.path.join(secrets_dir, name), "r", errors="replace").read().strip()
                if val:
                    os.environ[name] = val
            except Exception:
                pass
    except Exception:
        pass


_hydrate_env_from_secret_files()


def _resolve_anthropic_key() -> str:
    """Accept the Anthropic key from either a normal env var OR a Render
    'Secret File' (/etc/secrets/ANTHROPIC_API_KEY) — people reasonably put it in
    either place. A real Anthropic key always starts with 'sk-ant-'; if the env
    var holds something else (e.g. a Groq 'gsk_' key), prefer a valid secret file."""
    env_key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if env_key.startswith("sk-ant-"):
        return env_key
    for p in ("/etc/secrets/ANTHROPIC_API_KEY", "/etc/secrets/anthropic_api_key",
              "/etc/secrets/ANTHROPIC_KEY"):
        try:
            if os.path.exists(p):
                val = open(p, "r", errors="replace").read().strip()
                # tolerate a KEY=VALUE line as well as a bare value
                if "=" in val.splitlines()[0] and val.upper().startswith("ANTHROPIC"):
                    val = val.splitlines()[0].split("=", 1)[1].strip()
                if val.startswith("sk-ant-"):
                    return val
        except Exception:
            pass
    return env_key


os.environ["ANTHROPIC_API_KEY"] = _resolve_anthropic_key()

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent import ProposalAgent
from opportunity_matcher import rank_opportunities
from stripe_billing import (
    create_checkout_session, get_plans, plan_limit, parse_webhook, plan_key_from_price,
)
from amendment_tracker import tracker as amendment_tracker
from sam_search import search_opportunities, search_opportunities_detailed
from sources import list_sources
from docx_export import build_proposal_docx, build_capability_docx, safe_filename
from email_service import send_amendment_alert
import scheduler
import alerts as alerts_engine
import advisor as advisor_report
import winnability as winnability_engine
from naics_data import naics_name, suggestions as naics_suggestions, search as naics_search
import docparse
import rfp_shredder

from ratelimit import search_limit, intel_limit, generate_limit
from auth import require_user, optional_user, User, auth_enabled
from db import (
    proposals as store, profiles as profile_store, tracked as tracked_store,
    matches as match_store, clients as client_store, supabase_enabled,
    saved_searches as search_store,
)

app = FastAPI(title="FinesseWins", version="1.1.0")

ALLOWED_ORIGINS = [o.strip() for o in os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,https://app.finessewins.com,https://finessewins.com"
).split(",") if o.strip()]

# Also allow any Render subdomain (finessewins-app/web/preview…) and any
# finessewins.com subdomain automatically — so the deployed app works without
# hand-editing CORS_ORIGINS in the dashboard for every URL.
ALLOWED_ORIGIN_REGEX = r"https://([a-z0-9-]+\.)*(onrender\.com|finessewins\.com)$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    scheduler.start()


@app.on_event("shutdown")
async def _shutdown():
    scheduler.stop()


# ── MODELS ────────────────────────────────────────────────────────

class CompanyProfile(BaseModel):
    name: str
    uei: Optional[str] = None
    cage: Optional[str] = None
    ein: Optional[str] = None
    certifications: List[str] = []
    naics_codes: List[str] = []
    capabilities: str = ""
    past_performance: List[dict] = []
    state: str = "AZ"
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None

class OpportunitySearch(BaseModel):
    keywords: str
    naics_code: Optional[str] = None
    set_aside: Optional[str] = None
    state: Optional[str] = None
    max_results: int = 30
    sources: Optional[List[str]] = None   # restrict to named sources, or all

class ProposalRequest(BaseModel):
    solicitation_number: str
    solicitation_title: str
    agency: str
    requirements: str
    deadline: str
    naics_code: str
    set_aside: Optional[str] = None
    company_profile: CompanyProfile
    volumes_requested: List[str] = ["technical", "past_performance", "pricing"]

class AmendmentCheck(BaseModel):
    solicitation_number: str
    known_amendments: List[str] = []

class TrackRequest(BaseModel):
    solicitation_number: str
    title: Optional[str] = None
    deadline: Optional[str] = None
    known_amendments: List[str] = []
    notify_email: Optional[str] = None

class AlertSettings(BaseModel):
    watched_naics: List[str] = []
    alert_keywords: Optional[str] = None
    alert_email: Optional[str] = None
    alerts_enabled: bool = True

class OrgSettings(BaseModel):
    is_advisor: bool = True
    org_name: Optional[str] = None
    org_type: Optional[str] = None   # apex|sbdc|mbda|diversity|prime|other

class WinnabilityRequest(BaseModel):
    naics_code: str
    agency: Optional[str] = None
    set_aside: Optional[str] = None
    title: Optional[str] = ""
    company_profile: Optional[dict] = None   # lenient: reads certs/past_performance

class ClientIn(BaseModel):
    name: str
    contact_email: Optional[str] = None
    certifications: List[str] = []
    naics_codes: List[str] = []
    stage: str = "lead"
    bids_submitted: int = 0
    bids_won: int = 0
    dollars_won: float = 0
    notes: Optional[str] = None

class ClientPatch(BaseModel):
    name: Optional[str] = None
    contact_email: Optional[str] = None
    certifications: Optional[List[str]] = None
    naics_codes: Optional[List[str]] = None
    stage: Optional[str] = None
    bids_submitted: Optional[int] = None
    bids_won: Optional[int] = None
    dollars_won: Optional[float] = None
    notes: Optional[str] = None

# ── ROUTES ───────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "app": "FinesseWins",
        "status": "operational",
        "version": "1.1.0",
        "auth": "supabase" if auth_enabled() else "disabled (dev)",
        "persistence": "supabase" if supabase_enabled() else "in-memory (dev)",
    }

@app.get("/api/debug/anthropic-key")
async def _debug_anthropic_key():
    """TEMPORARY diagnostic — reports the key FINGERPRINT only (never the key).
    Remove after verifying prod config."""
    k = os.environ.get("ANTHROPIC_API_KEY", "")
    # Where could a competing value be coming from?
    candidates = [".env", os.path.join(os.getcwd(), ".env"), "/etc/secrets/.env",
                  "/etc/secrets/ANTHROPIC_API_KEY"]
    found = {}
    for p in candidates:
        try:
            if os.path.exists(p):
                txt = open(p, "r", errors="replace").read().strip()
                found[p] = {"exists": True, "content_prefix": txt[:14], "content_len": len(txt)}
        except Exception as e:
            found[p] = {"exists": True, "error": str(e)[:80]}
    return {
        "present": bool(k),
        "length": len(k),
        "prefix": k[:14],
        "suffix": k[-4:] if len(k) > 8 else "",
        "has_leading_or_trailing_space": k != k.strip(),
        "has_quotes": k.startswith(('"', "'")) or k.endswith(('"', "'")),
        "model": os.environ.get("ANTHROPIC_MODEL", "(default)"),
        "on_render": bool(os.environ.get("RENDER")),
        "cwd": os.getcwd(),
        "dotenv_files_found": found or "none",
    }


@app.get("/api/health")
async def health():
    return {"ok": True, "auth_enabled": auth_enabled(), "db": supabase_enabled()}

@app.get("/api/opportunities/sources")
async def get_sources():
    """List every bid site FinesseWins searches (name, kind, live capability)."""
    return {"sources": list_sources()}

@app.post("/api/opportunities/search")
async def search_ops(req: OpportunitySearch, user=Depends(optional_user), _rl=Depends(search_limit)):
    """Search every connected bid site (SAM.gov, Grants.gov, FedConnect, GSA eBuy,
    DLA DIBBS, state/local portals) and return matches + per-source status."""
    try:
        detailed = await search_opportunities_detailed(
            keywords=req.keywords,
            naics_code=req.naics_code,
            set_aside=req.set_aside,
            state=req.state,
            max_results=req.max_results,
            only=req.sources,
        )
        return detailed  # {results, count, sources}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/proposal/generate")
async def generate_proposal(
    req: ProposalRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_user),
    _rl=Depends(generate_limit),
):
    """Generate a complete proposal using the LangGraph agent (scoped to the user)."""
    # ── Enforce the monthly plan limit ──
    profile = await profile_store.get(user.id) or {}
    limit = plan_limit(profile.get("plan"))
    used = await store.count_this_month(user.id)
    if used >= limit:
        raise HTTPException(
            status_code=402,
            detail=(
                f"You've used all {limit} proposals on your "
                f"{profile.get('plan', 'free')} plan this month. Upgrade to generate more."
            ),
        )

    proposal_id = str(uuid.uuid4())

    await store.create(proposal_id, {
        "id": proposal_id,
        "user_id": user.id,
        "solicitation_number": req.solicitation_number,
        "title": req.solicitation_title,
        "agency": req.agency,
        "naics_code": req.naics_code,
        "set_aside": req.set_aside,
        "deadline": _parse_deadline(req.deadline),
        "status": "generating",
        "created_at": datetime.utcnow().isoformat(),
        "volumes": {},
    })

    background_tasks.add_task(_run_proposal_generation, proposal_id, req)

    return {
        "proposal_id": proposal_id,
        "status": "generating",
        "message": "Proposal generation started. Poll /api/proposal/{id} for status.",
    }

@app.get("/api/proposal/{proposal_id}")
async def get_proposal(proposal_id: str, user: User = Depends(require_user)):
    proposal = await store.get(proposal_id, user_id=user.id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal

@app.get("/api/proposals")
async def list_proposals(user: User = Depends(require_user)):
    return {"proposals": await store.list_all(user_id=user.id)}

@app.delete("/api/proposal/{proposal_id}")
async def delete_proposal(proposal_id: str, user: User = Depends(require_user)):
    await store.delete(proposal_id, user_id=user.id)
    return {"deleted": proposal_id}


# ── WIN / LOSS TRACKING + ANALYTICS ──────────────────────────────
# Closing the loop: a bidder records what actually happened, which powers their
# hit-rate analytics AND builds the proprietary outcome data no competitor has.

OUTCOMES = ("submitted", "won", "lost", "no_bid")


class OutcomeReq(BaseModel):
    outcome: str                       # submitted | won | lost | no_bid
    award_value: Optional[float] = None
    notes: Optional[str] = None


@app.post("/api/proposal/{proposal_id}/outcome")
async def set_proposal_outcome(proposal_id: str, req: OutcomeReq, user: User = Depends(require_user)):
    """Record what actually happened to a bid."""
    if req.outcome not in OUTCOMES:
        raise HTTPException(400, f"outcome must be one of: {', '.join(OUTCOMES)}")
    proposal = await store.get(proposal_id, user_id=user.id)
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    updates = {
        "outcome": req.outcome,
        "award_value": req.award_value if req.outcome == "won" else None,
        "outcome_notes": req.notes,
        "outcome_at": datetime.utcnow().isoformat(),
    }
    await store.update(proposal_id, updates)
    return {"proposal_id": proposal_id, **updates}


def _rate(won: int, lost: int) -> Optional[int]:
    decided = won + lost
    return round(won / decided * 100) if decided else None


@app.get("/api/analytics/winloss")
async def winloss_analytics(user: User = Depends(require_user)):
    """Hit rate, dollars won, and where this bidder actually wins."""
    rows = await store.list_all(user_id=user.id)

    def bucket(key_fn):
        out = {}
        for r in rows:
            k = (key_fn(r) or "Unspecified").strip() or "Unspecified"
            b = out.setdefault(k, {"key": k, "bids": 0, "won": 0, "lost": 0, "dollars": 0.0})
            b["bids"] += 1
            if r.get("outcome") == "won":
                b["won"] += 1
                b["dollars"] += float(r.get("award_value") or 0)
            elif r.get("outcome") == "lost":
                b["lost"] += 1
        for b in out.values():
            b["win_rate"] = _rate(b["won"], b["lost"])
        return sorted(out.values(), key=lambda b: (-b["won"], -b["bids"]))[:10]

    won = sum(1 for r in rows if r.get("outcome") == "won")
    lost = sum(1 for r in rows if r.get("outcome") == "lost")
    submitted = sum(1 for r in rows if r.get("outcome") == "submitted")
    no_bid = sum(1 for r in rows if r.get("outcome") == "no_bid")
    undecided = sum(1 for r in rows if not r.get("outcome"))
    dollars_won = sum(float(r.get("award_value") or 0) for r in rows if r.get("outcome") == "won")

    return {
        "totals": {
            "proposals": len(rows), "won": won, "lost": lost,
            "submitted_awaiting": submitted, "no_bid": no_bid, "undecided": undecided,
        },
        "win_rate": _rate(won, lost),
        "decided": won + lost,
        "dollars_won": round(dollars_won, 2),
        "avg_award": round(dollars_won / won, 2) if won else None,
        "by_agency": bucket(lambda r: r.get("agency")),
        "by_naics": bucket(lambda r: r.get("naics_code")),
        "by_set_aside": bucket(lambda r: r.get("set_aside") or "Full & Open"),
    }

@app.get("/api/proposal/{proposal_id}/export")
async def export_proposal(proposal_id: str, user: User = Depends(require_user)):
    """Export a proposal to a real .docx (submission-ready)."""
    proposal = await store.get(proposal_id, user_id=user.id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.get("status") != "complete" or not proposal.get("volumes"):
        raise HTTPException(status_code=409, detail="Proposal is not finished generating yet")

    profile = await profile_store.get(user.id) or {}
    buf = build_proposal_docx(proposal, profile)
    filename = safe_filename(proposal)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.post("/api/rfp/explain")
async def explain_rfp(req: dict, user=Depends(optional_user)):
    agent = ProposalAgent()
    explanation = await agent.explain_rfp(
        requirements=req.get("requirements", ""),
        title=req.get("title", ""),
        certifications=req.get("certifications", ["WOSB", "MBE"]),
    )
    return {"explanation": explanation}


# ── RFP SHREDDER (upload → shred → compliance matrix → strengthen) ────
MAX_UPLOAD_BYTES = 15 * 1024 * 1024   # 15 MB per file


async def _read_upload(f: UploadFile):
    data = await f.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"{f.filename} is too large (max 15 MB).")
    try:
        return docparse.parse(data, f.filename or "upload")
    except ValueError as e:
        raise HTTPException(415, str(e))


@app.post("/api/rfp/shred")
async def rfp_shred(
    file: UploadFile = File(...),
    title: str = Form(""),
    agency: str = Form(""),
    user=Depends(optional_user),
    _rl=Depends(generate_limit),
):
    """Upload the actual solicitation → structured requirements graph (Section L/M)."""
    doc = await _read_upload(file)
    if doc.word_count < 40:
        raise HTTPException(422, "That document has almost no readable text — if it's a scanned PDF, upload a text-based copy.")
    try:
        result = await rfp_shredder.shred(doc.text, title=title or doc.filename, agency=agency)
    except rfp_shredder.ShredderUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Shred failed: {type(e).__name__}: {str(e)[:400]}")
    result["rfp"] = {"filename": doc.filename, "words": doc.word_count, "pages": doc.pages,
                     "sections": [s.heading for s in doc.sections[:40]]}
    return result


@app.post("/api/rfp/analyze")
async def rfp_analyze(
    files: List[UploadFile] = File(...),
    requirements: str = Form(...),
    user=Depends(optional_user),
    _rl=Depends(generate_limit),
):
    """Score the user's own documents against each requirement → compliance matrix."""
    try:
        reqs = json.loads(requirements)
    except Exception:
        raise HTTPException(400, "requirements must be a JSON array.")
    if not isinstance(reqs, list) or not reqs:
        raise HTTPException(400, "No requirements to analyze — shred the RFP first.")
    docs = []
    for f in files:
        d = await _read_upload(f)
        docs.append({"name": d.filename, "text": d.text})
    if not any(d["text"].strip() for d in docs):
        raise HTTPException(422, "None of the uploaded documents had readable text.")
    try:
        result = await rfp_shredder.analyze(reqs, docs)
    except rfp_shredder.ShredderUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Analyze failed: {type(e).__name__}: {str(e)[:400]}")
    # Return parsed text so the client can feed the right content to /strengthen.
    result["docs"] = [{"name": d["name"], "text": d["text"], "words": len(d["text"].split())} for d in docs]
    return result


class StrengthenReq(BaseModel):
    requirement: dict
    user_content: str = ""
    company_profile: Optional[dict] = None
    solicitation_vocab: str = ""


@app.post("/api/rfp/strengthen")
async def rfp_strengthen(req: StrengthenReq, user=Depends(optional_user), _rl=Depends(generate_limit)):
    """Rewrite the user's content to fully address one requirement — never inventing facts."""
    profile = req.company_profile
    if profile is None and user:
        profile = await profile_store.get(user.id)
    try:
        return await rfp_shredder.strengthen(
            req.requirement, req.user_content,
            company_profile=profile, solicitation_vocab=req.solicitation_vocab,
        )
    except rfp_shredder.ShredderUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Strengthen failed: {type(e).__name__}: {str(e)[:400]}")


class MatrixExport(BaseModel):
    title: str = "Solicitation"
    agency: str = ""
    requirements: List[dict]
    matrix: List[dict]
    coverage_pct: int = 0


@app.post("/api/rfp/export/matrix")
async def rfp_export_matrix(req: MatrixExport, user=Depends(optional_user)):
    """Download the compliance matrix as a submission-ready .docx."""
    buf = rfp_shredder.build_matrix_docx(req.title, req.requirements, req.matrix, req.coverage_pct, req.agency)
    name = (req.title or "solicitation").replace(" ", "_")[:60]
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{name}_Compliance_Matrix.docx"'},
    )

# ── RECOMPETE RADAR ──────────────────────────────────────────────

@app.get("/api/intel/recompetes")
async def recompete_radar(
    naics: str,
    agency: Optional[str] = None,
    months: int = 18,
    user=Depends(optional_user),
    _rl=Depends(intel_limit),
):
    """Contracts in a NAICS whose period of performance ends soon — the
    recompete pipeline. Winning starts 6-12 months before the RFP drops."""
    if not naics or not naics.strip().isdigit():
        raise HTTPException(400, "A numeric NAICS code is required.")
    months = max(1, min(int(months or 18), 36))
    try:
        import usaspending as _usa
        rows = await _usa.expiring_awards(naics.strip(), agency or None, within_days=months * 30)
    except Exception as e:
        raise HTTPException(502, f"Award data unavailable: {type(e).__name__}: {str(e)[:200]}")
    total = sum(r["amount"] for r in rows)
    return {
        "naics": naics.strip(),
        "naics_name": naics_name(naics.strip()),
        "months": months,
        "count": len(rows),
        "total_value": total,
        "recompetes": rows[:200],
    }


# ── SAVED SEARCHES (Find Bids retention loop) ────────────────────

class SavedSearchIn(BaseModel):
    name: str
    keywords: Optional[str] = None
    naics_code: Optional[str] = None
    set_aside: Optional[str] = None
    state: Optional[str] = None


@app.get("/api/searches")
async def list_saved_searches(user: User = Depends(require_user)):
    return {"searches": await search_store.list(user.id)}


@app.post("/api/searches")
async def save_search(req: SavedSearchIn, user: User = Depends(require_user)):
    if not any([req.keywords, req.naics_code, req.set_aside, req.state]):
        raise HTTPException(400, "Add at least one filter before saving a search.")
    return {"search": await search_store.create(user.id, req.dict()), "saved": True}


@app.post("/api/searches/{search_id}/run")
async def mark_search_run(search_id: str, user: User = Depends(require_user)):
    await search_store.touch(user.id, search_id)
    return {"ok": True}


@app.delete("/api/searches/{search_id}")
async def delete_saved_search(search_id: str, user: User = Depends(require_user)):
    await search_store.delete(user.id, search_id)
    return {"deleted": True}


# ── COMPANY PROFILE ──────────────────────────────────────────────

@app.get("/api/profile")
async def get_profile(user: User = Depends(require_user)):
    profile = await profile_store.get(user.id)
    return {"profile": profile}

@app.put("/api/profile")
async def save_profile(profile: CompanyProfile, user: User = Depends(require_user)):
    saved = await profile_store.upsert(user.id, profile.dict())
    return {"profile": saved, "saved": True}

@app.post("/api/capability-statement")
async def generate_capability_statement(profile: CompanyProfile, user=Depends(optional_user), _rl=Depends(generate_limit)):
    agent = ProposalAgent()
    content = await agent.generate_capability_statement(profile.dict())
    return {"content": content, "status": "complete"}

class CapabilityExport(BaseModel):
    content: str
    profile: Optional[dict] = None

@app.post("/api/capability-statement/export")
async def export_capability_statement(req: CapabilityExport, user=Depends(optional_user)):
    """Turn a (possibly edited) capability statement into a one-page .docx."""
    profile = req.profile
    if profile is None and user:
        profile = await profile_store.get(user.id)
    buf = build_capability_docx(req.content, profile or {})
    name = ((profile or {}).get("name") or "capability_statement").replace(" ", "_")
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{name}_Capability_Statement.docx"'},
    )

@app.post("/api/certifications/check")
async def check_certifications(profile: CompanyProfile, user=Depends(optional_user)):
    checks = {
        "WOSB": _check_wosb_eligibility(profile),
        "MBE": _check_mbe_eligibility(profile),
        "8a": _check_8a_eligibility(profile),
        "HUBZone": _check_hubzone_eligibility(profile),
        "Black-Owned": _check_blackowned_eligibility(profile),
    }
    return {"checks": checks}

# ── AMENDMENTS / TRACKING ────────────────────────────────────────

@app.post("/api/amendments/check")
async def check_amendments(req: AmendmentCheck, user=Depends(optional_user)):
    amendment_tracker.track(req.solicitation_number, req.known_amendments)
    return await amendment_tracker.check_amendments(req.solicitation_number)

@app.post("/api/amendments/track")
async def track_solicitation(req: TrackRequest, user: User = Depends(require_user)):
    """Subscribe to amendment alerts for a solicitation (emails on new amendments)."""
    row = await tracked_store.track(
        user.id, req.solicitation_number,
        title=req.title, deadline=_parse_deadline(req.deadline),
        known_amendments=req.known_amendments,
        notify_email=req.notify_email or user.email,
    )
    # Do an immediate first check so the user gets instant feedback
    amendment_tracker.track(req.solicitation_number, req.known_amendments)
    result = await amendment_tracker.check_amendments(req.solicitation_number)
    if result.get("has_new") and (req.notify_email or user.email):
        await send_amendment_alert(
            req.notify_email or user.email,
            req.solicitation_number, result["new_amendments"], req.title or "",
        )
    return {"tracked": row, "check": result}

# ── NAICS WATCH / ALERTS ─────────────────────────────────────────

@app.get("/api/naics/suggestions")
async def naics_suggestion_list(q: Optional[str] = None):
    """NAICS picker. With ?q= search by code, name, or plain word ("cleaning",
    "trucking", "catering"); without a query, return a friendly starter list."""
    results = naics_search(q) if q else naics_suggestions()
    return {"suggestions": results, "query": q or ""}

@app.get("/api/alerts/settings")
async def get_alert_settings(user: User = Depends(require_user)):
    """Watched codes + settings, each annotated with a human-readable NAICS name."""
    profile = await profile_store.get(user.id) or {}
    codes = profile.get("watched_naics") or []
    return {
        "watched_naics": [{"code": c, "name": naics_name(c)} for c in codes],
        "alert_keywords": profile.get("alert_keywords") or "",
        "alert_email": profile.get("alert_email") or user.email,
        "alerts_enabled": profile.get("alerts_enabled", True),
        "unseen": await match_store.count_unseen(user.id),
        "cadence": "twice daily",
    }

@app.put("/api/alerts/settings")
async def save_alert_settings(settings: AlertSettings, user: User = Depends(require_user)):
    codes = [str(c).strip() for c in settings.watched_naics if str(c).strip()]
    await profile_store.upsert(user.id, {
        "watched_naics": codes,
        "alert_keywords": settings.alert_keywords,
        "alert_email": settings.alert_email or user.email,
        "alerts_enabled": settings.alerts_enabled,
    })
    return {"saved": True, "watched_naics": [{"code": c, "name": naics_name(c)} for c in codes]}

@app.get("/api/alerts/matches")
async def get_alert_matches(unseen_only: bool = False, user: User = Depends(require_user)):
    rows = await match_store.list_for_user(user.id, unseen_only=unseen_only)
    for r in rows:
        r["naics_name"] = naics_name(r.get("naics_code") or r.get("matched_naics"))
    return {"matches": rows, "count": len(rows), "unseen": await match_store.count_unseen(user.id)}

@app.post("/api/alerts/matches/seen")
async def mark_matches_seen(req: dict = None, user: User = Depends(require_user)):
    ids = (req or {}).get("ids")
    await match_store.mark_seen(user.id, ids)
    return {"unseen": await match_store.count_unseen(user.id)}

@app.post("/api/alerts/run")
async def run_alerts_now(user: User = Depends(require_user)):
    """Manual 'Check now' — sweeps all bid sites for the user's codes immediately."""
    profile = await profile_store.get(user.id) or {}
    profile["user_id"] = user.id
    if not (profile.get("watched_naics") or []):
        raise HTTPException(status_code=400, detail="Add at least one NAICS code first.")
    # Don't double-email on manual runs — the feed updates instantly.
    new_rows = await alerts_engine.run_for_profile(profile, send_email=False)
    for r in new_rows:
        r["naics_name"] = naics_name(r.get("naics_code") or r.get("matched_naics"))
    return {
        "new_count": len(new_rows),
        "new_matches": new_rows,
        "unseen": await match_store.count_unseen(user.id),
    }

# ── BID INTELLIGENCE / WINNABILITY (real federal award data) ─────

@app.post("/api/intel/winnability")
async def winnability(req: WinnabilityRequest, user=Depends(optional_user), _rl=Depends(intel_limit)):
    """Honest, data-grounded odds for a bid — built from real USAspending award history.

    Tells a first-time / small business whether a bid is worth their time, what it
    actually pays, who they're up against, and their concrete path to win.
    """
    profile = req.company_profile if req.company_profile else None
    if profile is None and user:
        profile = await profile_store.get(user.id)
    try:
        return await winnability_engine.analyze(
            naics_code=req.naics_code,
            agency=req.agency,
            set_aside=req.set_aside,
            title=req.title or "",
            company_profile=profile,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Award-data lookup failed: {e}")

@app.post("/api/intel/scores")
async def intel_scores(req: dict, user=Depends(optional_user), _rl=Depends(intel_limit)):
    """Batch quick winnability scores for a list of listings (inline badges).

    Body: {"items":[{"id","naics_code","agency","set_aside"}]}
    Returns {"scores": {id: {score, tone, label}}}."""
    items = req.get("items") or []
    if not isinstance(items, list) or not items:
        return {"scores": {}}
    profile = None
    if user:
        profile = await profile_store.get(user.id)
    scores = await winnability_engine.score_many(items[:60], profile)
    return {"scores": scores}

@app.post("/api/intel/market")
async def market_snapshot(req: dict, user=Depends(optional_user)):
    """Lightweight market read for a NAICS (+agency): counts, price band, top winners."""
    naics = req.get("naics_code")
    if not naics:
        raise HTTPException(status_code=400, detail="naics_code is required")
    agency = req.get("agency")
    awards, total, smallbiz = await asyncio.gather(
        winnability_engine.usa.award_search(naics, agency, limit=100),
        winnability_engine.usa.award_count(naics, agency),
        winnability_engine.usa.award_count(naics, agency, winnability_engine.usa.SMALL_BIZ_CODES),
    )
    price = winnability_engine.usa.price_stats(awards)
    return {
        "naics_code": naics, "agency": agency,
        "total_awards_3y": total,
        "small_business_share_pct": round(100 * smallbiz / total) if total else None,
        "price": winnability_engine._price_band(price),
        "top_recipients": [
            {"name": r["name"], "awards": r["count"], "total_fmt": winnability_engine._fmt(r["total"])}
            for r in winnability_engine.usa.top_recipients(awards, 5)
        ],
    }

# ── ADVISOR CONSOLE / PROGRAM IMPACT ─────────────────────────────
# For APEX Accelerators, SBDCs, MBDA Centers & supplier-diversity offices: manage
# many client businesses, match bids for each, and report program outcomes.

@app.get("/api/org")
async def get_org(user: User = Depends(require_user)):
    profile = await profile_store.get(user.id) or {}
    return {
        "is_advisor": profile.get("is_advisor", False),
        "org_name": profile.get("org_name"),
        "org_type": profile.get("org_type"),
    }

@app.put("/api/org")
async def save_org(settings: OrgSettings, user: User = Depends(require_user)):
    await profile_store.upsert(user.id, {
        "is_advisor": settings.is_advisor,
        "org_name": settings.org_name,
        "org_type": settings.org_type,
    })
    return {"saved": True, "is_advisor": settings.is_advisor,
            "org_name": settings.org_name, "org_type": settings.org_type}

@app.get("/api/org/clients")
async def list_clients(user: User = Depends(require_user)):
    rows = await client_store.list(user.id)
    return {"clients": rows, "impact": advisor_report.compute_impact(rows)}

@app.post("/api/org/clients")
async def add_client(client: ClientIn, user: User = Depends(require_user)):
    row = await client_store.create(user.id, client.dict())
    return {"client": row}

@app.put("/api/org/clients/{client_id}")
async def update_client(client_id: str, patch: ClientPatch, user: User = Depends(require_user)):
    row = await client_store.update(user.id, client_id, {k: v for k, v in patch.dict().items() if v is not None})
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"client": row}

@app.delete("/api/org/clients/{client_id}")
async def delete_client(client_id: str, user: User = Depends(require_user)):
    await client_store.delete(user.id, client_id)
    return {"deleted": client_id}

@app.get("/api/org/clients/{client_id}/matches")
async def client_matches(client_id: str, user: User = Depends(require_user)):
    """Live opportunities across all bid sites for this client's NAICS codes."""
    client = await client_store.get(user.id, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    rows = await alerts_engine.matches_for(client.get("naics_codes") or [])
    for r in rows:
        r["naics_name"] = naics_name(r.get("naics_code") or r.get("matched_naics"))
    return {"matches": rows, "count": len(rows)}

@app.get("/api/org/impact")
async def get_impact(user: User = Depends(require_user)):
    rows = await client_store.list(user.id)
    return advisor_report.compute_impact(rows)

@app.get("/api/org/impact/report.csv")
async def impact_report_csv(user: User = Depends(require_user)):
    profile = await profile_store.get(user.id) or {}
    rows = await client_store.list(user.id)
    buf = advisor_report.impact_csv(rows, profile.get("org_name") or "")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="finessewins_impact_report.csv"'},
    )

# ── BILLING ──────────────────────────────────────────────────────

@app.get("/api/billing/plans")
async def get_billing_plans():
    return {"plans": get_plans()}

@app.get("/api/usage")
async def get_usage(user: User = Depends(require_user)):
    """Current plan + how many proposals used this month (drives the UI meter)."""
    profile = await profile_store.get(user.id) or {}
    plan = profile.get("plan", "free")
    limit = plan_limit(plan)
    used = await store.count_this_month(user.id)
    return {
        "plan": plan,
        "used": used,
        "limit": limit,
        "remaining": max(0, limit - used),
    }

@app.post("/api/billing/checkout")
async def create_billing_checkout(req: dict, user=Depends(optional_user)):
    email = req.get("customer_email") or (user.email if user else "")
    url = await create_checkout_session(
        plan_key=req.get("plan_key", "pro"),
        customer_email=email,
        success_url=req.get("success_url", "https://app.finessewins.com/success"),
        cancel_url=req.get("cancel_url", "https://app.finessewins.com/pricing"),
        user_id=user.id if user else None,
    )
    return {"checkout_url": url, "fallback": not bool(url)}

@app.post("/api/billing/webhook")
async def stripe_webhook(request: Request):
    """Stripe events → sync the user's plan onto company_profiles."""
    payload = await request.body()
    event = parse_webhook(payload, request.headers.get("stripe-signature"))
    if not event:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    etype = event.get("type")
    obj = event.get("data", {}).get("object", {})

    if etype == "checkout.session.completed":
        user_id = obj.get("client_reference_id") or (obj.get("metadata") or {}).get("user_id")
        plan = (obj.get("metadata") or {}).get("plan", "pro")
        customer = obj.get("customer")
        if user_id:
            await profile_store.set_plan(user_id, plan, customer)

    elif etype in ("customer.subscription.updated", "customer.subscription.created"):
        customer = obj.get("customer")
        meta = obj.get("metadata") or {}
        plan = meta.get("plan")
        if not plan:  # derive from the subscription's price
            try:
                price_id = obj["items"]["data"][0]["price"]["id"]
                plan = plan_key_from_price(price_id)
            except Exception:
                plan = None
        user_id = meta.get("user_id")
        if user_id and plan:
            await profile_store.set_plan(user_id, plan, customer)
        elif customer and plan:
            existing = await profile_store.get_by_customer(customer)
            if existing:
                await profile_store.set_plan(existing["user_id"], plan, customer)

    elif etype == "customer.subscription.deleted":
        customer = obj.get("customer")
        existing = await profile_store.get_by_customer(customer) if customer else None
        if existing:
            await profile_store.set_plan(existing["user_id"], "free", customer)

    return {"received": True, "type": etype}

@app.post("/api/opportunities/ranked")
async def ranked_opportunities(req: dict, user=Depends(optional_user)):
    company_profile = req.get("company_profile")
    if not company_profile and user:
        company_profile = await profile_store.get(user.id) or {}
    keywords = req.get("keywords", "technology services")
    raw = await search_opportunities(
        keywords, req.get("naics_code"), req.get("set_aside"), max_results=30
    )
    ranked = rank_opportunities(raw, company_profile or {})
    return {"results": ranked, "count": len(ranked)}

# ── HELPERS ──────────────────────────────────────────────────────

async def _run_proposal_generation(proposal_id: str, req: ProposalRequest):
    try:
        agent = ProposalAgent()
        result = await agent.run(
            solicitation_number=req.solicitation_number,
            solicitation_title=req.solicitation_title,
            agency=req.agency,
            requirements=req.requirements,
            deadline=req.deadline,
            naics_code=req.naics_code,
            set_aside=req.set_aside,
            company_profile=req.company_profile.dict(),
            volumes_requested=req.volumes_requested,
        )
        await store.update(proposal_id, {
            "status": "complete",
            "volumes": result["volumes"],
            "word_counts": result["word_counts"],
            "plain_english_summary": result.get("plain_english_summary"),
            "analysis": result.get("analysis"),
            "review": _as_jsonable(result.get("review")),
            "completed_at": datetime.utcnow().isoformat(),
        })
    except Exception as e:
        await store.update(proposal_id, {"status": "error", "error": str(e)})


def _parse_deadline(value: Optional[str]) -> Optional[str]:
    """Normalize a deadline string to ISO, or None if empty."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "").replace("+00:00", "")).isoformat()
    except Exception:
        return str(value)


def _as_jsonable(review):
    if review is None:
        return None
    if isinstance(review, (dict, list)):
        return review
    try:
        import json
        return json.loads(review)
    except Exception:
        return {"raw": str(review)}


def _check_wosb_eligibility(profile: CompanyProfile) -> dict:
    return {"eligible": True, "certified": "WOSB" in profile.certifications,
            "notes": "51%+ women-owned and controlled required"}

def _check_mbe_eligibility(profile: CompanyProfile) -> dict:
    return {"eligible": True, "certified": "MBE" in profile.certifications,
            "notes": "51%+ minority-owned required"}

def _check_8a_eligibility(profile: CompanyProfile) -> dict:
    return {"eligible": True, "certified": "8a" in profile.certifications,
            "notes": "SBA 8(a) program — 9 year term"}

def _check_blackowned_eligibility(profile: CompanyProfile) -> dict:
    return {"eligible": True,
            "certified": "Black-Owned" in profile.certifications or "Black Owned" in profile.certifications,
            "notes": "51%+ Black-owned and controlled. Qualifies for SDB programs and agency supplier diversity goals."}

def _check_hubzone_eligibility(profile: CompanyProfile) -> dict:
    return {"eligible": False, "certified": "HUBZone" in profile.certifications,
            "notes": "Check address at sba.gov/hubzone-map"}
