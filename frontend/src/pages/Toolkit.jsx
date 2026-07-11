import { useState, useEffect } from "react"
import { apiJson, apiDownloadPost } from "../lib/api"

const CERTS = ["WOSB", "EDWOSB", "MBE", "DBE", "Black-Owned", "8a", "HUBZone", "SDVOSB"]
const TABS = [
  { id: "cap", label: "Capability Statement", icon: "📄" },
  { id: "rfp", label: "RFP Explainer", icon: "📖" },
  { id: "cert", label: "Certification Check", icon: "✅" },
]

export default function Toolkit({ onNavigate }) {
  const [tab, setTab] = useState("cap")
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    apiJson("/api/profile").then(({ profile: p }) => setProfile(p || {})).catch(() => setProfile({}))
  }, [])

  const card = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "1.75rem" }
  const label = { display: "block", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: ".4rem" }
  const input = { width: "100%", background: "rgba(255,255,255,.05)", border: "2px solid rgba(255,255,255,.12)", color: "#fff", padding: ".7rem .85rem", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".9rem", outline: "none", borderRadius: 8, boxSizing: "border-box" }
  const btn = (bg = "#EC1C7B") => ({ background: bg, color: "#fff", border: "none", padding: ".7rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".68rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 8, fontWeight: 700 })

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }}>Toolkit</div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>Quick tools</h1>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".9rem", marginTop: ".6rem", maxWidth: 620 }}>
          The essentials every first-time bidder needs — a polished capability statement, a plain-English read on any RFP, and a check of which certifications you qualify for.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: ".5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: "flex", alignItems: "center", gap: ".5rem", padding: ".55rem 1rem", border: `2px solid ${tab === t.id ? "#EC1C7B" : "rgba(255,255,255,.12)"}`, background: tab === t.id ? "rgba(236,28,123,.1)" : "none", color: tab === t.id ? "#fff" : "rgba(255,255,255,.55)", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".84rem", fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", borderRadius: 8 }}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {profile === null ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "rgba(255,255,255,.4)", fontFamily: "'DM Mono', monospace", fontSize: ".8rem" }}>Loading…</div>
      ) : (
        <div style={card}>
          {tab === "cap" && <CapabilityTool profile={profile} onNavigate={onNavigate} label={label} input={input} btn={btn} />}
          {tab === "rfp" && <RfpTool profile={profile} label={label} input={input} btn={btn} />}
          {tab === "cert" && <CertTool profile={profile} onNavigate={onNavigate} btn={btn} />}
        </div>
      )}
    </div>
  )
}

// ── Capability Statement ─────────────────────────────────────────
function CapabilityTool({ profile, onNavigate, label, input, btn }) {
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)

  const hasProfile = profile && profile.name && profile.capabilities
  const generate = async () => {
    setLoading(true); setError(null)
    try {
      const r = await apiJson("/api/capability-statement", { method: "POST", body: JSON.stringify(_profileBody(profile)) })
      setContent(r.content || "")
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  const download = async () => {
    setExporting(true); setError(null)
    try { await apiDownloadPost("/api/capability-statement/export", { content, profile }, "Capability_Statement.docx") }
    catch (e) { setError(e.message) } finally { setExporting(false) }
  }
  const copy = () => { navigator.clipboard?.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  if (!hasProfile) return (
    <Empty icon="📄" title="Add your company profile first"
      body="Your capability statement is built from your company name, certifications, NAICS codes, and capabilities."
      cta="Go to Company Profile" onClick={() => onNavigate("profile")} btn={btn} />
  )

  return (
    <div>
      <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".88rem", marginTop: 0 }}>
        A one-page capability statement is the first document agencies ask for. Generate one from your profile, edit it, and download a Word file.
      </p>
      <div style={{ display: "flex", gap: ".75rem", marginBottom: content ? "1.25rem" : 0, flexWrap: "wrap" }}>
        <button onClick={generate} disabled={loading} style={btn()}>{loading ? "Writing…" : content ? "Regenerate" : "Generate statement →"}</button>
        {content && <button onClick={copy} style={btn("rgba(255,255,255,.06)")}>{copied ? "✓ Copied" : "Copy"}</button>}
        {content && <button onClick={download} disabled={exporting} style={btn("rgba(31,182,238,.15)")}>{exporting ? "…" : "⬇ Download DOCX"}</button>}
      </div>
      {error && <Err msg={error} />}
      {content && (
        <textarea value={content} onChange={e => setContent(e.target.value)}
          style={{ width: "100%", minHeight: 420, background: "rgba(255,255,255,.04)", border: "2px solid rgba(255,255,255,.12)", color: "#fff", padding: "1.25rem", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".9rem", lineHeight: 1.7, borderRadius: 10, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
      )}
    </div>
  )
}

// ── RFP Explainer ────────────────────────────────────────────────
function RfpTool({ profile, label, input, btn }) {
  const [title, setTitle] = useState("")
  const [text, setText] = useState("")
  const [certs, setCerts] = useState(profile?.certifications?.length ? profile.certifications : ["WOSB"])
  const [out, setOut] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    if (!text.trim()) { setError("Paste the RFP text or requirements first."); return }
    setLoading(true); setError(null); setOut("")
    try {
      const r = await apiJson("/api/rfp/explain", { method: "POST", body: JSON.stringify({ requirements: text, title, certifications: certs }) })
      setOut(r.explanation || "")
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <div>
      <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".88rem", marginTop: 0 }}>
        Paste any solicitation and get a first-timer breakdown: what they actually want, how to win, which certifications help, the biggest gotcha, and whether it's a good fit.
      </p>
      <label style={label}>Solicitation title (optional)</label>
      <input style={{ ...input, marginBottom: "1rem" }} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Website Modernization Services" />
      <label style={label}>RFP text / requirements</label>
      <textarea style={{ ...input, minHeight: 160, resize: "vertical", marginBottom: "1rem" }} value={text} onChange={e => setText(e.target.value)} placeholder="Paste the statement of work or requirements here…" />
      <label style={label}>Your certifications</label>
      <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        {CERTS.map(c => {
          const on = certs.includes(c)
          return <button key={c} onClick={() => setCerts(cs => on ? cs.filter(x => x !== c) : [...cs, c])}
            style={{ padding: ".3rem .8rem", border: `2px solid ${on ? "#1FB6EE" : "rgba(255,255,255,.15)"}`, background: on ? "rgba(31,182,238,.1)" : "none", color: on ? "#1FB6EE" : "rgba(255,255,255,.5)", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", cursor: "pointer", borderRadius: 4 }}>{c}</button>
        })}
      </div>
      <button onClick={run} disabled={loading} style={btn()}>{loading ? "Reading…" : "Explain this RFP →"}</button>
      {error && <div style={{ marginTop: "1rem" }}><Err msg={error} /></div>}
      {out && (
        <div style={{ marginTop: "1.5rem", background: "rgba(31,182,238,.06)", border: "1px solid rgba(31,182,238,.2)", borderRadius: 10, padding: "1.4rem", fontSize: ".9rem", color: "rgba(255,255,255,.82)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{out}</div>
      )}
    </div>
  )
}

// ── Certification Check ──────────────────────────────────────────
function CertTool({ profile, onNavigate, btn }) {
  const [checks, setChecks] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    setLoading(true); setError(null)
    try {
      const r = await apiJson("/api/certifications/check", { method: "POST", body: JSON.stringify(_profileBody(profile)) })
      setChecks(r.checks || {})
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <div>
      <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".88rem", marginTop: 0 }}>
        A quick read on which set-aside certifications apply to you — and what each unlocks. Certifications are the single biggest edge a small business has.
      </p>
      <button onClick={run} disabled={loading} style={btn()}>{loading ? "Checking…" : "Check my certifications →"}</button>
      {error && <div style={{ marginTop: "1rem" }}><Err msg={error} /></div>}
      {checks && (
        <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: ".6rem" }}>
          {Object.entries(checks).map(([name, c]) => {
            const held = c.certified
            const eligible = c.eligible
            const tone = held ? "#1DB954" : eligible ? "#F8C81C" : "rgba(255,255,255,.4)"
            const status = held ? "You hold this" : eligible ? "You may qualify" : "Check eligibility"
            return (
              <div key={name} style={{ display: "flex", alignItems: "flex-start", gap: ".9rem", padding: "1rem", background: "rgba(255,255,255,.03)", border: `1px solid ${held ? "rgba(29,185,84,.25)" : "rgba(255,255,255,.08)"}`, borderRadius: 10 }}>
                <span style={{ flexShrink: 0, fontSize: "1rem", color: tone }}>{held ? "✓" : eligible ? "◐" : "○"}</span>
                <div>
                  <div style={{ display: "flex", gap: ".6rem", alignItems: "center", marginBottom: ".2rem" }}>
                    <span style={{ fontWeight: 700, fontSize: ".9rem" }}>{name}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".08em", textTransform: "uppercase", color: tone }}>{status}</span>
                  </div>
                  <div style={{ fontSize: ".82rem", color: "rgba(255,255,255,.6)" }}>{c.notes}</div>
                </div>
              </div>
            )
          })}
          <div style={{ fontSize: ".78rem", color: "rgba(255,255,255,.4)", marginTop: ".3rem" }}>
            Not certified yet? Update your certifications in <button onClick={() => onNavigate("profile")} style={{ background: "none", border: "none", color: "#EC1C7B", cursor: "pointer", padding: 0, fontSize: ".78rem" }}>Company Profile</button>.
          </div>
        </div>
      )}
    </div>
  )
}

// ── shared bits ──────────────────────────────────────────────────
function Empty({ icon, title, body, cta, onClick, btn }) {
  return (
    <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
      <div style={{ fontSize: "2rem", marginBottom: ".6rem" }}>{icon}</div>
      <div style={{ fontSize: ".95rem", fontWeight: 600, marginBottom: ".35rem" }}>{title}</div>
      <div style={{ fontSize: ".85rem", color: "rgba(255,255,255,.55)", maxWidth: 420, margin: "0 auto 1.25rem" }}>{body}</div>
      <button onClick={onClick} style={btn()}>{cta} →</button>
    </div>
  )
}
function Err({ msg }) {
  return <div style={{ background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, padding: ".7rem .9rem", fontSize: ".82rem", color: "#FF8870" }}>{msg}</div>
}
function _profileBody(p) {
  return {
    name: p.name || "", uei: p.uei, cage: p.cage, ein: p.ein,
    certifications: p.certifications || [], naics_codes: p.naics_codes || [],
    capabilities: p.capabilities || "", past_performance: p.past_performance || [],
    state: p.state || "AZ",
  }
}
