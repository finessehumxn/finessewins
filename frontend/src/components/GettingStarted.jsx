import { useState, useEffect } from "react"
import { apiJson } from "../lib/api"

// First-run checklist. Reads real account state so steps check themselves off.
// Hides once every step is done, or when the user dismisses it.
export default function GettingStarted({ onNavigate }) {
  const [state, setState] = useState(null) // {profile, codes, proposals}
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("bf_gs_dismissed") === "1" } catch { return false }
  })

  useEffect(() => {
    let alive = true
    Promise.all([
      apiJson("/api/profile").catch(() => ({ profile: null })),
      apiJson("/api/alerts/settings").catch(() => ({ watched_naics: [] })),
      apiJson("/api/proposals").catch(() => ({ proposals: [] })),
    ]).then(([p, a, pr]) => {
      if (!alive) return
      setState({
        profileDone: !!(p.profile && p.profile.name && p.profile.capabilities && (p.profile.certifications || []).length),
        codesDone: (a.watched_naics || []).length > 0,
        proposalDone: (pr.proposals || []).length > 0,
      })
    })
    return () => { alive = false }
  }, [])

  if (dismissed || !state) return null

  const steps = [
    { key: "profileDone", n: 1, title: "Set up your company profile", blurb: "Your name, certifications, and capabilities — used in every proposal and match.", cta: "Company Profile", page: "profile" },
    { key: "codesDone", n: 2, title: "Add your NAICS codes to Bid Radar", blurb: "We'll watch every bid site twice a day and alert you when something matches.", cta: "Open Bid Radar", page: "alerts" },
    { key: "proposalDone", n: 3, title: "Generate your first proposal", blurb: "Paste a solicitation and let AI draft your technical, past-performance, and pricing volumes.", cta: "New Proposal", page: "new-proposal" },
  ]
  const doneCount = steps.filter(s => state[s.key]).length
  if (doneCount === steps.length) return null // fully onboarded — get out of the way

  const dismiss = () => { try { localStorage.setItem("bf_gs_dismissed", "1") } catch {}; setDismissed(true) }

  return (
    <div style={{ background: "linear-gradient(120deg, rgba(236,28,123,.08), rgba(31,182,238,.06))", border: "1px solid rgba(236,28,123,.22)", borderRadius: 14, padding: "1.4rem 1.6rem", marginBottom: "1.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.1rem" }}>
        <div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".14em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".35rem" }}>
            Getting started · {doneCount} of {steps.length} done
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "1.05rem" }}>
            {doneCount === 0 ? "Welcome — here's how to win your first contract" : "You're almost set up"}
          </div>
        </div>
        <button onClick={dismiss} title="Dismiss"
          style={{ background: "none", border: "1px solid rgba(255,255,255,.15)", color: "rgba(255,255,255,.4)", borderRadius: 6, padding: ".3rem .6rem", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".08em", textTransform: "uppercase" }}>
          Dismiss
        </button>
      </div>

      {/* progress bar */}
      <div style={{ height: 5, background: "rgba(255,255,255,.1)", borderRadius: 3, overflow: "hidden", marginBottom: "1.25rem" }}>
        <div style={{ width: `${(doneCount / steps.length) * 100}%`, height: "100%", background: "linear-gradient(90deg,#EC1C7B,#1FB6EE)", transition: "width .4s" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
        {steps.map(s => {
          const done = state[s.key]
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: ".9rem", padding: ".7rem .85rem", background: done ? "rgba(29,185,84,.06)" : "rgba(255,255,255,.03)", border: `1px solid ${done ? "rgba(29,185,84,.2)" : "rgba(255,255,255,.07)"}`, borderRadius: 10 }}>
              <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace", fontSize: ".7rem", fontWeight: 700, background: done ? "#1DB954" : "rgba(236,28,123,.15)", color: done ? "#04121a" : "#EC1C7B" }}>
                {done ? "✓" : s.n}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: ".9rem", fontWeight: 600, color: done ? "rgba(255,255,255,.6)" : "#fff", textDecoration: done ? "line-through" : "none" }}>{s.title}</div>
                {!done && <div style={{ fontSize: ".78rem", color: "rgba(255,255,255,.5)", marginTop: ".15rem" }}>{s.blurb}</div>}
              </div>
              {!done && (
                <button onClick={() => onNavigate(s.page)}
                  style={{ flexShrink: 0, background: "#EC1C7B", color: "#fff", border: "none", padding: ".5rem 1rem", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {s.cta} →
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
