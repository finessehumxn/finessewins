import { useState, useEffect } from "react"
import { apiJson } from "../lib/api"
import GettingStarted from "../components/GettingStarted"

const MOCK_PROPOSALS = [
  { id: "1", title: "SSS Website Modernization", agency: "Selective Service System", solicitation: "90MC0026R0004", status: "submitted", deadline: "2026-07-06", value: "$392,000" },
  { id: "2", title: "ICPC Interstate Compact", agency: "AZ Dept of Child Safety", solicitation: "BPM007620", status: "submitted", deadline: "2026-06-30", value: "$14,350" },
  { id: "3", title: "LIHTC Application Support", agency: "Salt River Pima-Maricopa", solicitation: "ECS-26-037", status: "submitted", deadline: "2026-06-24", value: "$50,000" },
  { id: "4", title: "Child Specific Recruitment", agency: "AZ Dept of Child Safety", solicitation: "BPM007574", status: "in_progress", deadline: "2026-07-08", value: "TBD" },
  { id: "5", title: "School Improvement Services", agency: "Salt River Schools", solicitation: "BPM007660", status: "not_started", deadline: "2026-07-23", value: "TBD" },
]

const STATUS_CONFIG = {
  submitted: { label: "Submitted", color: "#1DB954", bg: "rgba(29,185,84,.1)" },
  in_progress: { label: "In Progress", color: "#F8C81C", bg: "rgba(248,200,28,.1)" },
  not_started: { label: "Not Started", color: "rgba(255,255,255,.4)", bg: "rgba(255,255,255,.05)" },
  generating: { label: "Generating...", color: "#1FB6EE", bg: "rgba(31,182,238,.1)" },
  complete: { label: "Complete", color: "#1DB954", bg: "rgba(29,185,84,.1)" },
  error: { label: "Error", color: "#FF6432", bg: "rgba(255,100,50,.1)" },
}

const SAMPLE_STATS = [
  { label: "Bids Submitted", value: "6+", sub: "This quarter" },
  { label: "Pipeline Value", value: "$1M+", sub: "Total submitted" },
  { label: "Certifications", value: "WOSB · MBE · DBE", sub: "Active" },
  { label: "Win Rate", value: "—", sub: "First awards pending" },
]

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
})

export default function Dashboard({ onNavigate }) {
  const [filter, setFilter] = useState("all")
  const [proposals, setProposals] = useState(MOCK_PROPOSALS)
  const [usingReal, setUsingReal] = useState(false)

  useEffect(() => {
    let alive = true
    apiJson("/api/proposals")
      .then(({ proposals: list }) => {
        if (!alive || !Array.isArray(list)) return
        if (list.length) {
          setProposals(list.map(toRow))
          setUsingReal(true)
        }
      })
      .catch(() => {}) // unauth / backend down → keep sample data
    return () => { alive = false }
  }, [])

  const filtered = proposals.filter(p => filter === "all" || p.status === filter)

  const stats = usingReal ? [
    { label: "Proposals", value: String(proposals.length), sub: "All time" },
    { label: "Completed", value: String(proposals.filter(p => p.status === "complete").length), sub: "Ready to submit" },
    { label: "In Progress", value: String(proposals.filter(p => p.status === "generating").length), sub: "Generating" },
    { label: "Due ≤ 7 days", value: String(proposals.filter(p => { const d = daysUntil(p.deadline); return d >= 0 && d <= 7 }).length), sub: "Act now" },
  ] : SAMPLE_STATS

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }}>
          Millennials Creatives LLC · CAGE 18ZQ0
        </div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>
          Bid Pipeline
        </h1>
        {!usingReal && (
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.3)", marginTop: ".5rem" }}>
            Showing sample pipeline — generate a proposal to see your own
          </div>
        )}
      </div>

      {/* First-run onboarding checklist (hides itself once complete/dismissed) */}
      <GettingStarted onNavigate={onNavigate} />

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

        {filtered.map((p, i) => {
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
              <div style={{ alignSelf: "center", color: "rgba(255,255,255,.25)", fontSize: ".9rem" }}>→</div>
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div style={{ marginTop: "2rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "1.5rem" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", textTransform: "uppercase", color: "#1FB6EE", marginBottom: ".75rem" }}>Active Certifications</div>
          {["WOSB — Women-Owned Small Business", "MBE — Minority Business Enterprise", "DBE — Disadvantaged Business Enterprise", "SAM.gov Active — UEI: WBGAAWMD3YE5"].map(c => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: ".5rem", padding: ".3rem 0", fontSize: ".82rem", color: "rgba(255,255,255,.7)" }}>
              <span style={{ color: "#1DB954", fontSize: ".7rem" }}>✓</span> {c}
            </div>
          ))}
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
