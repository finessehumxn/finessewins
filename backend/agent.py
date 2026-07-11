"""
FinesseWins — LangGraph Proposal Generation Agent
Built for first-time WOSB, MBE, Black-owned, and minority small business bidders.

Key differentiators baked into every prompt:
  1. Zero past performance mode — uses private sector + nonprofit work
  2. Certification leverage — WOSB/MBE/Black-owned/8a language woven in
  3. Plain English solicitation explainer — before writing starts
  4. First-timer guidance — explains every step
"""
from typing import TypedDict, Annotated, List, Optional
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
import json, os

# Model is configurable; defaults to a current Claude model. Built lazily so the
# app boots (and every non-AI feature works) even when ANTHROPIC_API_KEY is unset —
# only actual proposal generation requires the key.
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
_llm = None


def _get_llm():
    global _llm
    if _llm is None:
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set — proposal generation is unavailable. "
                "Add it to the backend environment to enable AI features."
            )
        _llm = ChatAnthropic(model=ANTHROPIC_MODEL, anthropic_api_key=key, max_tokens=4096)
    return _llm

# ── STATE ────────────────────────────────────────────────────────

class ProposalState(TypedDict):
    messages: Annotated[list, add_messages]
    solicitation_number: str
    solicitation_title: str
    agency: str
    requirements: str
    deadline: str
    naics_code: str
    set_aside: Optional[str]
    company_profile: dict
    volumes_requested: List[str]
    plain_english_summary: Optional[str]   # NEW: explain the RFP simply
    analysis: Optional[dict]
    plan: Optional[dict]
    technical_volume: Optional[str]
    past_performance_volume: Optional[str]
    pricing_volume: Optional[str]
    review_notes: Optional[str]
    complete: bool

# ── HELPER: certification context ───────────────────────────────

def _cert_context(profile: dict) -> str:
    certs = profile.get("certifications", [])
    lines = []
    if "WOSB" in certs or "EDWOSB" in certs:
        lines.append("Women-Owned Small Business (WOSB) — eligible for WOSB set-aside contracts per FAR 19.15")
    if "MBE" in certs:
        lines.append("Minority Business Enterprise (MBE) — strengthens past performance narrative and agency diversity goals")
    if "Black-Owned" in certs or "Black Owned" in certs:
        lines.append("Black-Owned Business — relevant to agency supplier diversity goals and SDB programs")
    if "8a" in certs or "8(a)" in certs:
        lines.append("SBA 8(a) participant — eligible for sole-source awards up to $4.5M and competitive set-asides")
    if "HUBZone" in certs:
        lines.append("HUBZone certified — 10% price evaluation preference on full-and-open competitions")
    if "DBE" in certs:
        lines.append("Disadvantaged Business Enterprise (DBE) — relevant for DOT-funded state and local contracts")
    if not lines:
        lines.append("Small Business — eligible for small business set-asides per FAR 19.5")
    return "\n".join(f"  • {l}" for l in lines)

def _is_first_timer(profile: dict) -> bool:
    """Detect if this is a first-time bidder with no formal past performance"""
    pp = profile.get("past_performance", [])
    return len(pp) == 0 or all(p.get("is_private_sector") for p in pp)

# ── NODE 1: Plain English Explainer ─────────────────────────────

async def explain_solicitation(state: ProposalState) -> ProposalState:
    """Translate the government RFP into plain language — for first-timers"""
    prompt = f"""You are a government contracting coach helping a first-time small business owner understand a solicitation.

Read this solicitation and explain it in plain, friendly language as if you're texting a friend who has never bid on a government contract before. Cover:
1. What the agency actually wants done (in 2-3 sentences)
2. What makes a strong bid for this (top 3 things)
3. Any certifications that help here ({', '.join(state['company_profile'].get('certifications', ['WOSB']))})
4. The biggest risk or gotcha to watch out for
5. Whether this is a good fit for a first-time bidder (honest assessment)

SOLICITATION: {state['solicitation_title']}
AGENCY: {state['agency']}
SET-ASIDE: {state.get('set_aside') or 'None stated'}
NAICS: {state['naics_code']}
REQUIREMENTS (excerpt):
{state['requirements'][:1500]}

Keep it conversational, supportive, and honest. No jargon."""

    response = await _get_llm().ainvoke([HumanMessage(content=prompt)])
    return {**state, "plain_english_summary": response.content}


# ── NODE 2: Analyze Solicitation ────────────────────────────────

async def analyze_solicitation(state: ProposalState) -> ProposalState:
    """Deep analysis of requirements + win themes tailored to certifications"""
    profile = state["company_profile"]
    cert_ctx = _cert_context(profile)
    first_timer = _is_first_timer(profile)

    prompt = f"""You are a senior government proposal strategist specializing in helping
WOSB, MBE, Black-owned, and first-time small business bidders win contracts.

Analyze this solicitation and return a JSON object with:
- evaluation_criteria: list of what evaluators will score and their relative weight
- win_themes: 3-5 specific win themes this company can credibly claim given their certifications
- certification_advantages: how to leverage each active certification in the proposal
- first_timer_strategy: {"specific guidance for a company with no formal past performance" if first_timer else "standard past performance approach"}
- risks: top 3 risks or compliance requirements to address
- structure_recommendations: suggested page counts and section order per volume
- key_differentiators: what makes this company stand out vs. typical competitors

SOLICITATION: {state['solicitation_title']}
AGENCY: {state['agency']}
NAICS: {state['naics_code']}
SET-ASIDE: {state.get('set_aside') or 'None / Full & Open'}
DEADLINE: {state['deadline']}

REQUIREMENTS:
{state['requirements'][:2000]}

COMPANY CERTIFICATIONS AND ADVANTAGES:
{cert_ctx}

COMPANY CAPABILITIES: {profile.get('capabilities', '')}
FIRST-TIME BIDDER: {first_timer}

Return only valid JSON."""

    response = await _get_llm().ainvoke([HumanMessage(content=prompt)])
    try:
        analysis = json.loads(response.content)
    except Exception:
        # Try to extract JSON from the response
        import re
        match = re.search(r'\{.*\}', response.content, re.DOTALL)
        analysis = json.loads(match.group()) if match else {"raw": response.content}

    return {**state, "analysis": analysis}


# ── NODE 3: Plan Volumes ─────────────────────────────────────────

async def plan_volumes(state: ProposalState) -> ProposalState:
    profile = state["company_profile"]
    cert_ctx = _cert_context(profile)

    prompt = f"""Create a detailed writing plan for each requested proposal volume.
The company is {profile['name']} — a {'first-time bidder with ' if _is_first_timer(profile) else ''}WOSB/MBE/minority-owned business.

SOLICITATION: {state['solicitation_title']}
VOLUMES NEEDED: {', '.join(state['volumes_requested'])}
ANALYSIS SUMMARY: {json.dumps(state.get('analysis', {}))[:800]}
CERTIFICATIONS: {cert_ctx}

For each volume, provide exact section headings, 2-3 key points per section,
word count targets, and compliance checklist items.
Include a specific section in the technical volume about how the company's
certifications and diverse ownership directly benefit the agency.
Return as JSON with volume names as keys."""

    response = await _get_llm().ainvoke([HumanMessage(content=prompt)])
    try:
        plan = json.loads(response.content)
    except Exception:
        plan = {"raw": response.content}

    return {**state, "plan": plan}


# ── NODE 4a: Technical Volume ────────────────────────────────────

async def write_technical_volume(state: ProposalState) -> ProposalState:
    if "technical" not in state["volumes_requested"]:
        return {**state, "technical_volume": None}

    profile = state["company_profile"]
    cert_ctx = _cert_context(profile)
    analysis = state.get("analysis", {})
    first_timer = _is_first_timer(profile)

    system = """You are an expert federal proposal writer specializing in helping
WOSB, MBE, Black-owned, and minority small businesses win their first government contracts.
Write in clear, confident, specific prose. Active voice. No filler phrases.
Weave the company's certifications and diverse ownership naturally into win themes — not as an afterthought."""

    prompt = f"""Write a complete Technical Approach volume for this government proposal.

SOLICITATION: {state['solicitation_title']}
AGENCY: {state['agency']}
NAICS: {state['naics_code']}
SET-ASIDE: {state.get('set_aside') or 'None'}
DEADLINE: {state['deadline']}

REQUIREMENTS:
{state['requirements'][:2000]}

COMPANY: {profile['name']}
CERTIFICATIONS & ADVANTAGES:
{cert_ctx}

CAPABILITIES: {profile.get('capabilities', '')}

WIN THEMES FROM ANALYSIS: {json.dumps(analysis.get('win_themes', []))}
DIFFERENTIATORS: {json.dumps(analysis.get('key_differentiators', []))}

{"IMPORTANT: This company has no formal past performance. Use private sector work, nonprofit work, and relevant experience. Frame capabilities through what the team has built and demonstrated — not what contracts they've won." if first_timer else ""}

Requirements:
- Open with the strongest certification-leveraged differentiator
- Include a clear methodology with specific steps
- Add a project timeline (realistic for the scope)
- Include a section on how diverse ownership benefits this specific agency
- Reference WOSB/MBE/Black-owned certifications where genuinely relevant
- End with management approach and key personnel
- 5-10 pages equivalent

Write the full Technical Approach volume now:"""

    response = await _get_llm().ainvoke([SystemMessage(content=system), HumanMessage(content=prompt)])
    return {**state, "technical_volume": response.content}


# ── NODE 4b: Past Performance Volume ────────────────────────────

async def write_past_performance(state: ProposalState) -> ProposalState:
    if "past_performance" not in state["volumes_requested"]:
        return {**state, "past_performance_volume": None}

    profile = state["company_profile"]
    pp = profile.get("past_performance", [])
    first_timer = _is_first_timer(profile)
    cert_ctx = _cert_context(profile)

    system = """You are an expert federal proposal writer who specializes in helping
first-time small business bidders frame their experience compellingly.
You know that government evaluators understand that new businesses exist and that
relevant private sector, nonprofit, and subcontract experience is valid past performance."""

    if first_timer:
        prompt = f"""Write a Past Performance volume for a first-time government contractor.

SOLICITATION: {state['solicitation_title']}
AGENCY: {state['agency']}
REQUIREMENTS: {state['requirements'][:800]}

COMPANY: {profile['name']}
CERTIFICATIONS: {cert_ctx}
CAPABILITIES: {profile.get('capabilities', '')}
AVAILABLE EXPERIENCE: {json.dumps(pp) if pp else 'Private sector and nonprofit work — details to be provided by the company'}

Write a strategy that:
1. Opens with a strong statement about the company's qualifications and certifications
2. Frames private sector and nonprofit work as directly relevant past performance
3. Explains how the team's professional background directly prepares them for this work
4. Includes a relevance matrix showing how prior work maps to this solicitation
5. Uses FAR 15.305 language — agencies may consider "similar" work, not just identical contracts
6. Is honest, confident, and professional

2-3 pages equivalent. Write the full volume:"""
    else:
        prompt = f"""Write a Past Performance volume for this proposal.

SOLICITATION: {state['solicitation_title']}
REQUIREMENTS: {state['requirements'][:800]}

COMPANY: {profile['name']}
PAST PERFORMANCE REFERENCES:
{json.dumps(pp, indent=2)}

Write a narrative for each reference showing relevance to this solicitation.
Include a relevance matrix. 2-3 pages equivalent. Write the full volume:"""

    response = await _get_llm().ainvoke([SystemMessage(content=system), HumanMessage(content=prompt)])
    return {**state, "past_performance_volume": response.content}


# ── NODE 4c: Pricing Volume ──────────────────────────────────────

async def write_pricing_volume(state: ProposalState) -> ProposalState:
    if "pricing" not in state["volumes_requested"]:
        return {**state, "pricing_volume": None}

    profile = state["company_profile"]
    cert_ctx = _cert_context(profile)

    system = """You are a government contracts pricing expert who helps small, minority-owned,
and first-time businesses price competitively without underselling themselves."""

    prompt = f"""Write a Price/Cost Volume for this government proposal.

SOLICITATION: {state['solicitation_title']}
AGENCY: {state['agency']}
NAICS: {state['naics_code']}
REQUIREMENTS: {state['requirements'][:800]}

COMPANY: {profile['name']}
CERTIFICATIONS: {cert_ctx}

Provide:
1. Pricing narrative — approach, basis of estimate, and how prices were determined
2. A sample labor rate table with realistic Arizona market rates for this type of work
3. Competitive pricing strategy — how to be priced to win, not just to survive
4. How WOSB/MBE/minority certifications may factor into evaluation (some agencies weight this)
5. FAR compliance notes (representations, certifications) for this contract type
6. Guidance on whether firm-fixed-price, T&M, or IDIQ is appropriate here

Write the full pricing volume now:"""

    response = await _get_llm().ainvoke([SystemMessage(content=system), HumanMessage(content=prompt)])
    return {**state, "pricing_volume": response.content}


# ── NODE 5: Review ───────────────────────────────────────────────

async def review_proposal(state: ProposalState) -> ProposalState:
    vols = []
    if state.get("technical_volume"):
        vols.append(f"TECHNICAL (excerpt):\n{state['technical_volume'][:600]}")
    if state.get("past_performance_volume"):
        vols.append(f"PAST PERFORMANCE (excerpt):\n{state['past_performance_volume'][:400]}")
    if state.get("pricing_volume"):
        vols.append(f"PRICING (excerpt):\n{state['pricing_volume'][:400]}")

    cert_ctx = _cert_context(state["company_profile"])

    prompt = f"""Review this proposal for a WOSB/MBE/minority-owned small business.

SOLICITATION: {state['solicitation_title']}
CERTIFICATIONS: {cert_ctx}
SET-ASIDE: {state.get('set_aside') or 'None'}

VOLUME EXCERPTS:
{chr(10).join(vols)}

Score and review:
- overall_score (1-10)
- compliance_check (does it address all requirements?)
- certification_leverage (does it use the company's certifications as win themes?)
- strengths (top 3)
- gaps (top 3 things to fix before submission)
- action_items (specific next steps)
- first_timer_tips (encouragement and specific advice for a new bidder)

Return as JSON."""

    response = await _get_llm().ainvoke([HumanMessage(content=prompt)])
    try:
        review = json.loads(response.content)
    except Exception:
        import re
        match = re.search(r'\{.*\}', response.content, re.DOTALL)
        review = json.loads(match.group()) if match else {"raw": response.content}

    return {**state, "review_notes": json.dumps(review), "complete": True}


# ── ROUTING ──────────────────────────────────────────────────────

def route_volumes(state: ProposalState):
    nodes = []
    vols = state.get("volumes_requested", [])
    if "technical" in vols: nodes.append("write_technical")
    if "past_performance" in vols: nodes.append("write_past_performance")
    if "pricing" in vols: nodes.append("write_pricing")
    return nodes if nodes else ["review"]


# ── BUILD GRAPH ──────────────────────────────────────────────────

def build_graph():
    graph = StateGraph(ProposalState)

    graph.add_node("explain", explain_solicitation)
    graph.add_node("analyze", analyze_solicitation)
    graph.add_node("plan", plan_volumes)
    graph.add_node("write_technical", write_technical_volume)
    graph.add_node("write_past_performance", write_past_performance)
    graph.add_node("write_pricing", write_pricing_volume)
    graph.add_node("review", review_proposal)

    graph.set_entry_point("explain")
    graph.add_edge("explain", "analyze")
    graph.add_edge("analyze", "plan")
    graph.add_conditional_edges("plan", route_volumes, {
        "write_technical": "write_technical",
        "write_past_performance": "write_past_performance",
        "write_pricing": "write_pricing",
        "review": "review",
    })
    graph.add_edge("write_technical", "review")
    graph.add_edge("write_past_performance", "review")
    graph.add_edge("write_pricing", "review")
    graph.add_edge("review", END)

    return graph.compile()


# ── AGENT CLASS ──────────────────────────────────────────────────

class ProposalAgent:
    def __init__(self):
        self.graph = build_graph()

    async def run(self, **kwargs) -> dict:
        initial_state = {"messages": [], "complete": False, **kwargs}
        result = await self.graph.ainvoke(initial_state)

        volumes = {}
        word_counts = {}
        for key in ["technical", "past_performance", "pricing"]:
            vol = result.get(f"{key}_volume")
            if vol:
                volumes[key] = vol
                word_counts[key] = len(vol.split())

        return {
            "volumes": volumes,
            "word_counts": word_counts,
            "plain_english_summary": result.get("plain_english_summary"),
            "analysis": result.get("analysis"),
            "plan": result.get("plan"),
            "review": result.get("review_notes"),
        }

    async def generate_capability_statement(self, profile: dict) -> str:
        cert_ctx = _cert_context(profile)
        prompt = f"""Write a professional one-page capability statement for:

Company: {profile['name']}
Certifications & Advantages:
{cert_ctx}
NAICS Codes: {', '.join(profile.get('naics_codes', []))}
Capabilities: {profile['capabilities']}
State: {profile.get('state', 'AZ')}
UEI: {profile.get('uei', 'TBD')}
CAGE: {profile.get('cage', 'TBD')}

Format: Company overview → Core competencies (6-8 bullets) →
Certification advantages → Past performance summary → Contact block.
Lead with the WOSB/MBE/minority-owned status as a competitive advantage."""

        response = await _get_llm().ainvoke([HumanMessage(content=prompt)])
        return response.content

    async def explain_rfp(self, requirements: str, title: str, certifications: list) -> str:
        """Standalone plain-English RFP explainer for the UI"""
        prompt = f"""Explain this government RFP in plain language for a first-time small business bidder.

TITLE: {title}
CERTIFICATIONS: {', '.join(certifications)}

REQUIREMENTS:
{requirements[:2000]}

Cover: what they want, how to win, certification advantages, biggest risk, good fit or not.
Be honest, friendly, and specific. No jargon."""
        response = await _get_llm().ainvoke([HumanMessage(content=prompt)])
        return response.content
