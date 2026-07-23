import { useState, useEffect } from "react"
import { apiJson } from "../lib/api"

const STATUS_CONFIG = {
  submitted: { label: "Submitted", color: "#1DB954", bg: "rgba(29,185,84,.1)" },
  in_progress: { label: "In Progress", color: "#F8C81C", bg: "rgba(248,200,28,.1)" },
  not_started: { label: "Not Started", color: "rgba(255,255,255,.4)", bg: "rgba(255,255,255,.05)" },
  generating: { label: "Generating...", color: "#1FB6EE", bg: "rgba(31,182,238,.1)" },
  complete: { label: "Complete", color: "#1DB954", bg: "rgba(29,185,84,.1)" },
  error: { label: "Error", color: "#FF6432", bg: "rgba(255,100,50,.1)" },
}

const CERT_LABELS = {
  WOSB: "WOSB — Women-Owned Small Business",
  EDWOSB: "EDWOSB — Economically Disadvantaged WOSB",
  MBE: "MBE — Minority Business Enterprise",
  DBE: "DBE — Disadvantaged Business Enterprise",
  "8A": "8(a) — SBA Business Development",
  HUBZone: "HUBZone — Historically Underutilized Business Zone",
  SDVOSB: "SDVOSB — Service-Disabled Veteran-Owned",
  VOSB: "VOSB — Veteran-Owned Small Business",
  SDB: "SDB — Small Disadvantaged Business",
  "Black-Owned": "Black-Owned Business",
}

const daysUntil = (deadline) => {
  if (!deadline) return 9999
  return Math.ceil((new Date(deadline) - new Date()) / 86400000)
}

// Map an API proposal into the row shape this table renders.
const toRow = (p) => ({
  id: p.id || p.proposal_id,
  title: p.title || p.solicitation_number || "Untitled proposal",
  agency: p.agency || "—",
  solicitation: p.solicitation_number || "—",
  status: p.status || "complete",
  deadline: p.deadline || null,
  value: p.set_aside || "Full & Open",
  outcome: p.outcome || null,
})

const OUTCOME_STYLE = {
  won:       { label: "Won",  color: "#1DB954" },
  lost:      { label: "Lost", color: "#FF6432" },
  submitted: { label: "Sent", color: "#1FB6EE" },
}

export default function Dashboard({ onNavigate }) {
  const [filter, setFilter] = useState("all")
  const [proposals, setProposals] = useState([])
  const [profile, setProfile] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [moves, setMoves] = useState(null)
  const [savingOutcome, setSavingOutcome] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => Promise.all([
    apiJson("/api/proposals").catch(() => ({ proposals: [] })),
    apiJson("/api/profile").catch(() => null),
    apiJson("/api/analytics/winloss").catch(() => null),
    apiJson("/api/me/next-moves").catch(() => null),
  ]).then(([list, prof, stats, mv]) => {
    setProposals(Array.isArray(list?.proposals) ? list.proposals.map(toRow) : [])
    setProfile(prof || null)
    setAnalytics(stats || null)
    setMoves(mv || null)
  })

  useEffect(() => {
    let alive = true
    load()
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // Record what actually happened to a bid — this is what powers the track record.
  async function setOutcome(id, outcome, e) {
    e?.stopPropagation()
    setSavingOutcome(id)
    try {
      await apiJson(`/api/proposal/${id}/outcome`, {
        method: "POST",
        body: JSON.stringify({ outcome }),
      })
      await load()
    } catch (err) { setError(err.message) } finally { setSavingOutcome(null) }
  }

  const filtered = proposals.filter(p => filter === "all" || p.status === filter)

  const stats = [
    { label: "Proposals", value: String(proposals.length), sub: "All time" },
    { label: "Completed", value: String(proposals.filter(p => p.status === "complete" || p.status === "submitted").length), sub: "Ready to submit" },
    { label: "In Progress", value: String(proposals.filter(p => p.status === "generating" || p.status === "in_progress").length), sub: "Working on it" },
    { label: "Due ≤ 7 days", value: String(proposals.filter(p => { const d = daysUntil(p.deadline); return d >= 0 && d <= 7 }).length), sub: "Act now" },
  ]

  const certs = Array.isArray(profile?.certifications) ? profile.certifications.filter(Boolean) : []
  const companyLabel = profile?.name
    ? `${profile.name}${profile.cage ? ` · CAGE ${profile.cage}` : ""}`
    : "Your Bid Pipeline"

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,.4)", fontFamily: "'DM Mono', monospace", fontSize: ".8rem" }}>Loading your pipeline…</div>
  )

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }}>
          {companyLabel}
        </div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>
          {moves?.headline || "Bid Pipeline"}
        </h1>
        {moves?.subhead && (
          <p style={{ color: "rgba(255,255,255,.55)", fontSize: ".92rem", marginTop: ".5rem", maxWidth: 640 }}>{moves.subhead}</p>
        )}
      </div>

      {error && (
        <div style={{ background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, padding: ".8rem 1rem", marginBottom: "1rem", fontSize: ".85rem", color: "#FF8870" }}>{error}</div>
      )}

      {/* What THIS business should do next — the personalization layer */}
      <NextMoves moves={moves} onNavigate={onNavigate} />

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 12, padding: "1.25rem"
          }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.4rem", fontWeight: 900, color: "#F8C81C", letterSpacing: "-.02em" }}>{s.value}</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".78rem", fontWeight: 600, marginTop: ".25rem" }}>{s.label}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".62rem", color: "rgba(255,255,255,.4)", marginTop: ".1rem" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Track record — the loop closed: what actually happened */}
      {analytics && analytics.decided > 0 && (
        <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "1.35rem", marginBottom: "2rem", display: "flex", gap: "2rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "2.1rem", fontWeight: 900, color: analytics.win_rate >= 50 ? "#1DB954" : "#F8C81C", lineHeight: 1 }}>
              {analytics.win_rate ?? "—"}%
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginTop: ".3rem" }}>Win rate</div>
          </div>
          <div style={{ borderLeft: "1px solid rgba(255,255,255,.1)", paddingLeft: "1.5rem" }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.05rem", fontWeight: 700 }}>
              <span style={{ color: "#1DB954" }}>{analytics.totals.won}W</span>
              <span style={{ color: "rgba(255,255,255,.3)" }}> · </span>
              <span style={{ color: "#FF6432" }}>{analytics.totals.lost}L</span>
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", color: "rgba(255,255,255,.4)", marginTop: ".2rem" }}>
              {analytics.totals.submitted_awaiting} awaiting result
            </div>
          </div>
          <div style={{ borderLeft: "1px solid rgba(255,255,255,.1)", paddingLeft: "1.5rem" }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.15rem", fontWeight: 900, color: "#F8C81C" }}>
              ${Number(analytics.dollars_won || 0).toLocaleString()}
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", color: "rgba(255,255,255,.4)", marginTop: ".2rem" }}>Contract value won</div>
          </div>
          {analytics.by_agency?.[0]?.won > 0 && (
            <div style={{ borderLeft: "1px solid rgba(255,255,255,.1)", paddingLeft: "1.5rem", flex: 1, minWidth: 170 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".12em", textTransform: "uppercase", color: "#1FB6EE", marginBottom: ".25rem" }}>You win most with</div>
              <div style={{ fontSize: ".88rem", color: "#fff" }}>{analytics.by_agency[0].key}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", color: "rgba(255,255,255,.4)" }}>
                {analytics.by_agency[0].won} of {analytics.by_agency[0].bids} bids
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter + New Proposal */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: ".5rem" }}>
          {["all", "in_progress", "submitted", "not_started"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: ".4rem 1rem", border: `2px solid ${filter === f ? "#EC1C7B" : "rgba(255,255,255,.12)"}`,
                background: filter === f ? "rgba(236,28,123,.1)" : "none",
                color: filter === f ? "#fff" : "rgba(255,255,255,.5)",
                fontFamily: "'DM Mono', monospace", fontSize: ".62rem",
                letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer",
                borderRadius: 4, transition: "all .15s"
              }}>
              {f === "all" ? "All" : STATUS_CONFIG[f]?.label}
            </button>
          ))}
        </div>
        <button onClick={() => onNavigate("new-proposal")}
          style={{
            background: "#EC1C7B", color: "#fff", border: "none",
            padding: ".6rem 1.25rem", fontFamily: "'DM Mono', monospace",
            fontSize: ".68rem", letterSpacing: ".1em", textTransform: "uppercase",
            cursor: "pointer", borderRadius: 6, fontWeight: 600
          }}>
          + New Proposal
        </button>
      </div>

      {/* Proposals Table */}
      <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr auto",
          gap: "1rem", padding: ".75rem 1.25rem",
          background: "rgba(255,255,255,.03)",
          fontFamily: "'DM Mono', monospace", fontSize: ".6rem",
          letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.4)"
        }}>
          <span>Solicitation</span>
          <span>Agency</span>
          <span>Set-Aside</span>
          <span>Deadline</span>
          <span>Status</span>
          <span></span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "2.5rem 1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: ".95rem", color: "rgba(255,255,255,.7)", marginBottom: ".4rem" }}>
              {proposals.length === 0 ? "No proposals yet" : "Nothing matches this filter"}
            </div>
            <div style={{ fontSize: ".82rem", color: "rgba(255,255,255,.4)", marginBottom: "1.1rem" }}>
              {proposals.length === 0
                ? "Find a live opportunity and let FinesseWins draft your first proposal."
                : "Try a different status filter above."}
            </div>
            {proposals.length === 0 && (
              <button onClick={() => onNavigate("opportunities")}
                style={{ background: "rgba(31,182,238,.12)", color: "#1FB6EE", border: "1px solid rgba(31,182,238,.35)", padding: ".55rem 1.2rem", fontFamily: "'DM Mono', monospace", fontSize: ".64rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, fontWeight: 600 }}>
                Find bids →
              </button>
            )}
          </div>
        ) : filtered.map((p, i) => {
          const status = STATUS_CONFIG[p.status] || STATUS_CONFIG.not_started
          const days = daysUntil(p.deadline)
          const urgent = days <= 3 && days >= 0

          return (
            <div key={p.id}
              onClick={() => onNavigate("proposal", p)}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr auto",
                gap: "1rem", padding: "1rem 1.25rem",
                borderTop: i > 0 ? "1px solid rgba(255,255,255,.05)" : "none",
                cursor: "pointer", transition: "background .15s",
                background: urgent ? "rgba(255,100,50,.03)" : "none"
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.03)"}
              onMouseLeave={e => e.currentTarget.style.background = urgent ? "rgba(255,100,50,.03)" : "none"}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: ".88rem", marginBottom: ".2rem" }}>{p.title}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".62rem", color: "rgba(255,255,255,.4)" }}>{p.solicitation}</div>
              </div>
              <div style={{ fontSize: ".85rem", color: "rgba(255,255,255,.65)", alignSelf: "center" }}>{p.agency}</div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: ".82rem", fontWeight: 700, color: "#F8C81C", alignSelf: "center" }}>{p.value}</div>
              <div style={{ alignSelf: "center" }}>
                <div style={{ fontSize: ".85rem", color: urgent ? "#FF6432" : "rgba(255,255,255,.65)" }}>
                  {p.deadline ? new Date(p.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                </div>
                {urgent && days >= 0 && (
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".58rem", color: "#FF6432", letterSpacing: ".1em" }}>
                    {days === 0 ? "TODAY" : `${days}d LEFT`}
                  </div>
                )}
              </div>
              <div style={{ alignSelf: "center" }}>
                <span style={{
                  background: status.bg, color: status.color,
                  padding: ".25rem .65rem", borderRadius: 20,
                  fontFamily: "'DM Mono', monospace", fontSize: ".6rem",
                  letterSpacing: ".08em", textTransform: "uppercase"
                }}>{status.label}</span>
              </div>
              <div style={{ alignSelf: "center", display: "flex", gap: ".3rem", alignItems: "center" }}>
                {/* record what actually happened — clicks don't open the proposal */}
                {["won", "lost", "submitted"].map(o => {
                  const on = p.outcome === o
                  const st = OUTCOME_STYLE[o]
                  return (
                    <button key={o} title={`Mark ${st.label}`} disabled={savingOutcome === p.id}
                      onClick={(e) => setOutcome(p.id, o, e)}
                      style={{
                        background: on ? `${st.color}22` : "transparent",
                        border: `1px solid ${on ? st.color : "rgba(255,255,255,.12)"}`,
                        color: on ? st.color : "rgba(255,255,255,.35)",
                        fontFamily: "'DM Mono', monospace", fontSize: ".55rem",
                        letterSpacing: ".06em", textTransform: "uppercase",
                        padding: ".2rem .45rem", borderRadius: 4,
                        cursor: savingOutcome === p.id ? "wait" : "pointer", fontWeight: on ? 700 : 400,
                      }}>
                      {st.label}
                    </button>
                  )
                })}
                <span style={{ color: "rgba(255,255,255,.25)", fontSize: ".9rem", marginLeft: ".2rem" }}>→</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div style={{ marginTop: "2rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "1.5rem" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", textTransform: "uppercase", color: "#1FB6EE", marginBottom: ".75rem" }}>Active Certifications</div>
          {certs.length > 0 ? certs.map(c => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: ".5rem", padding: ".3rem 0", fontSize: ".82rem", color: "rgba(255,255,255,.7)" }}>
              <span style={{ color: "#1DB954", fontSize: ".7rem" }}>✓</span> {CERT_LABELS[c] || c}
            </div>
          )) : (
            <div style={{ fontSize: ".8rem", color: "rgba(255,255,255,.4)" }}>
              No certifications yet.{" "}
              <span onClick={() => onNavigate("profile")} style={{ color: "#1FB6EE", cursor: "pointer" }}>Add them in Company Profile →</span>
            </div>
          )}
          {profile?.uei && (
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem", padding: ".3rem 0", fontSize: ".82rem", color: "rgba(255,255,255,.7)" }}>
              <span style={{ color: "#1DB954", fontSize: ".7rem" }}>✓</span> SAM.gov · UEI: {profile.uei}
            </div>
          )}
        </div>
        <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "1.5rem" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".75rem" }}>Upcoming Deadlines</div>
          {(() => {
            const upcoming = proposals
              .filter(p => daysUntil(p.deadline) >= 0 && daysUntil(p.deadline) <= 30)
              .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
            if (!upcoming.length) return (
              <div style={{ fontSize: ".8rem", color: "rgba(255,255,255,.35)", padding: ".35rem 0" }}>No deadlines in the next 30 days.</div>
            )
            return upcoming.map(p => {
              const d = daysUntil(p.deadline)
              return (
                <div key={p.id} onClick={() => onNavigate("proposal", p)}
                  style={{ display: "flex", justifyContent: "space-between", padding: ".35rem 0", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                  <span style={{ fontSize: ".82rem", color: "rgba(255,255,255,.7)" }}>{p.title.length > 32 ? p.title.slice(0, 30) + "…" : p.title}</span>
                  <span style={{
                    fontFamily: "'DM Mono', monospace", fontSize: ".65rem",
                    color: d <= 3 ? "#FF6432" : "rgba(255,255,255,.4)"
                  }}>{d}d</span>
                </div>
              )
            })
          })()}
        </div>
      </div>
    </div>
  )
}


/* ── YOUR NEXT MOVES ──────────────────────────────────────────────
   The difference between a toolbox and a product. Instead of eleven
   tools the user must know how to choose between, this is the short,
   ranked list of what THIS business should do next — each with the
   number that makes it real and one click to go do it. */
const IMPACT = {
  high:   { tint: "#EC1C7B", label: "Do this first" },
  medium: { tint: "#1FB6EE", label: "Worth doing" },
  low:    { tint: "rgba(255,255,255,.35)", label: "" },
}

function NextMoves({ moves, onNavigate }) {
  if (!moves || !moves.moves?.length) return null
  const list = moves.moves
  return (
    <div style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".7rem", marginBottom: ".9rem", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.45)" }}>
          Your next moves
        </span>
        {moves.blockers > 0 && (
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".54rem", letterSpacing: ".1em", textTransform: "uppercase", color: "#FF6432", border: "1px solid rgba(255,100,50,.4)", borderRadius: 20, padding: ".12rem .5rem" }}>
            {moves.blockers} blocking {moves.blockers === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: ".6rem" }}>
        {list.map((m, i) => {
          const tone = IMPACT[m.impact] || IMPACT.low
          return (
            <div key={m.id + i}
              onClick={() => onNavigate(m.page)}
              style={{
                display: "flex", alignItems: "center", gap: "1rem",
                background: m.blocker ? "rgba(255,100,50,.06)" : "rgba(255,255,255,.03)",
                border: `1px solid ${m.blocker ? "rgba(255,100,50,.28)" : "rgba(255,255,255,.08)"}`,
                borderLeft: `3px solid ${m.blocker ? "#FF6432" : tone.tint}`,
                borderRadius: 10, padding: "1rem 1.15rem", cursor: "pointer", transition: "background .15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.055)"}
              onMouseLeave={e => e.currentTarget.style.background = m.blocker ? "rgba(255,100,50,.06)" : "rgba(255,255,255,.03)"}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: ".95rem", fontWeight: 600 }}>{m.title}</span>
                  {m.stat && (
                    <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: ".72rem", fontWeight: 900, color: "#F8C81C" }}>{m.stat}</span>
                  )}
                  {m.blocker && (
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".5rem", letterSpacing: ".1em", textTransform: "uppercase", color: "#FF6432", border: "1px solid rgba(255,100,50,.4)", borderRadius: 20, padding: ".1rem .45rem" }}>Blocking</span>
                  )}
                </div>
                <div style={{ fontSize: ".84rem", color: "rgba(255,255,255,.6)", marginTop: ".25rem", lineHeight: 1.5 }}>{m.why}</div>
              </div>
              <span style={{
                flex: "none", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".08em",
                textTransform: "uppercase", color: m.blocker ? "#FF6432" : tone.tint,
                border: `1px solid ${m.blocker ? "rgba(255,100,50,.4)" : tone.tint + "55"}`,
                borderRadius: 6, padding: ".45rem .8rem", whiteSpace: "nowrap",
              }}>{m.cta} →</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
