import { useState, useEffect } from "react"
import { apiJson, apiDownloadPost } from "../lib/api"

const CERTS = ["WOSB", "EDWOSB", "MBE", "DBE", "Black-Owned", "8a", "HUBZone", "SDVOSB"]
const TABS = [
  { id: "cap", label: "Capability Statement", icon: "📄" },
  { id: "rfp", label: "RFP Explainer", icon: "📖" },
  { id: "price", label: "Price Builder", icon: "🧮" },
  { id: "gonogo", label: "Bid / No-Bid", icon: "⚖️" },
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
          The essentials every first-time bidder needs — a polished capability statement, a plain-English read on any RFP,
          a real government cost build-up so you price to win, an honest bid/no-bid call before you burn a week, and a
          check of which certifications you qualify for.
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
          {tab === "price" && <PriceBuilder label={label} input={input} btn={btn} />}
          {tab === "gonogo" && <GoNoGo btn={btn} />}
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

/* ── PRICE BUILDER ────────────────────────────────────────────────
   First-timers lose bids two ways on price: they guess low and win
   unprofitable work, or guess high and never win. Agencies evaluate a
   cost build-up (direct labor → fringe → overhead → G&A → fee), so this
   builds the same stack and shows the fully burdened rate that results. */
function PriceBuilder({ label, input, btn }) {
  const [rows, setRows] = useState([{ title: "Project Lead", rate: 45, hours: 160 }])
  const [fringe, setFringe] = useState(30)
  const [overhead, setOverhead] = useState(25)
  const [ga, setGa] = useState(12)
  const [fee, setFee] = useState(8)
  const [odc, setOdc] = useState(0)

  const n = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v))
  const money = (v) => "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 })

  const directLabor = rows.reduce((s, r) => s + n(r.rate) * n(r.hours), 0)
  const totalHours  = rows.reduce((s, r) => s + n(r.hours), 0)
  const fringeAmt   = directLabor * (n(fringe) / 100)
  const laborFringe = directLabor + fringeAmt
  const ohAmt       = laborFringe * (n(overhead) / 100)
  const subtotal    = laborFringe + ohAmt
  const gaBase      = subtotal + n(odc)
  const gaAmt       = gaBase * (n(ga) / 100)
  const totalCost   = gaBase + gaAmt
  const feeAmt      = totalCost * (n(fee) / 100)
  const totalPrice  = totalCost + feeAmt
  const burdened    = totalHours ? totalPrice / totalHours : 0
  const multiplier  = directLabor ? totalPrice / directLabor : 0

  const setRow = (i, k, v) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const addRow = () => setRows(rs => [...rs, { title: "", rate: 0, hours: 0 }])
  const delRow = (i) => setRows(rs => rs.filter((_, j) => j !== i))

  const Line = ({ k, v, strong, tint }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: ".45rem 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
      <span style={{ fontSize: ".85rem", color: strong ? "#fff" : "rgba(255,255,255,.6)", fontWeight: strong ? 600 : 400 }}>{k}</span>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".85rem", color: tint || (strong ? "#fff" : "rgba(255,255,255,.75)"), fontWeight: strong ? 700 : 400 }}>{v}</span>
    </div>
  )
  const pct = (v, set, lbl) => (
    <div>
      <label style={label}>{lbl}</label>
      <input style={input} type="number" value={v} onChange={e => set(e.target.value)} />
    </div>
  )

  return (
    <div>
      <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 .3rem" }}>Price Builder — the government cost build-up</h3>
      <p style={{ fontSize: ".85rem", color: "rgba(255,255,255,.5)", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
        Evaluators don't just look at your number — they check that it's <em>built</em>. Enter your real labor, then your
        indirect rates, and this produces the same stack a contracting officer expects to see.
      </p>

      <div style={{ marginBottom: "1.25rem" }}>
        <label style={label}>Labor</label>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px auto", gap: ".5rem", marginBottom: ".5rem" }}>
            <input style={input} placeholder="Labor category (e.g. Site Supervisor)" value={r.title} onChange={e => setRow(i, "title", e.target.value)} />
            <input style={input} type="number" placeholder="$/hr" value={r.rate} onChange={e => setRow(i, "rate", e.target.value)} />
            <input style={input} type="number" placeholder="hours" value={r.hours} onChange={e => setRow(i, "hours", e.target.value)} />
            <button onClick={() => delRow(i)} title="Remove"
              style={{ background: "none", border: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.4)", borderRadius: 6, cursor: "pointer", padding: "0 .7rem" }}>×</button>
          </div>
        ))}
        <button onClick={addRow} style={{ ...btn, background: "none", border: "1px dashed rgba(255,255,255,.2)", color: "rgba(255,255,255,.5)" }}>+ Add labor category</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: ".6rem", marginBottom: "1.25rem" }}>
        {pct(fringe, setFringe, "Fringe %")}
        {pct(overhead, setOverhead, "Overhead %")}
        {pct(ga, setGa, "G&A %")}
        {pct(fee, setFee, "Fee %")}
        <div>
          <label style={label}>Other costs $</label>
          <input style={input} type="number" value={odc} onChange={e => setOdc(e.target.value)} />
        </div>
      </div>

      <div style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
        <Line k="Direct labor" v={money(directLabor)} />
        <Line k={`Fringe (${n(fringe)}%)`} v={money(fringeAmt)} />
        <Line k={`Overhead (${n(overhead)}%)`} v={money(ohAmt)} />
        {n(odc) > 0 && <Line k="Other direct costs" v={money(n(odc))} />}
        <Line k={`G&A (${n(ga)}%)`} v={money(gaAmt)} />
        <Line k="Total cost" v={money(totalCost)} strong />
        <Line k={`Fee / profit (${n(fee)}%)`} v={money(feeAmt)} tint="#1DB954" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: ".9rem" }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>Total price</span>
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.6rem", fontWeight: 900, color: "#F8C81C" }}>{money(totalPrice)}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem", marginTop: ".9rem" }}>
        <div style={{ background: "rgba(31,182,238,.08)", border: "1px solid rgba(31,182,238,.25)", borderRadius: 8, padding: ".8rem 1rem" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".12em", textTransform: "uppercase", color: "#1FB6EE" }}>Fully burdened rate</div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.2rem", fontWeight: 900, marginTop: ".2rem" }}>${burdened.toFixed(2)}<span style={{ fontSize: ".75rem", color: "rgba(255,255,255,.45)" }}>/hr</span></div>
        </div>
        <div style={{ background: "rgba(248,200,28,.08)", border: "1px solid rgba(248,200,28,.25)", borderRadius: 8, padding: ".8rem 1rem" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".12em", textTransform: "uppercase", color: "#F8C81C" }}>Wrap multiplier</div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.2rem", fontWeight: 900, marginTop: ".2rem" }}>{multiplier.toFixed(2)}×</div>
        </div>
      </div>
      <p style={{ fontSize: ".76rem", color: "rgba(255,255,255,.38)", marginTop: ".8rem", lineHeight: 1.6 }}>
        A wrap multiplier of roughly 1.8×–2.4× is common for services work. Far below that and you may be underbidding your
        true cost; far above and you'll likely be priced out. Check this against the price-to-win band in Bid IQ.
      </p>
    </div>
  )
}

/* ── BID / NO-BID SCORECARD ──────────────────────────────────────
   The cheapest way to win more is to stop spending weeks on bids you
   were never going to win. Knockouts are absolute; the rest is weighted. */
const GONOGO = [
  { id: "elig",     q: "Do you meet every mandatory eligibility requirement (set-aside, certifications, licenses)?", knockout: true },
  { id: "sam",      q: "Is your SAM.gov registration active right now?", knockout: true },
  { id: "deadline", q: "Is there enough time left to submit a quality proposal?", knockout: true },
  { id: "scope",    q: "Do you clearly understand what they're actually asking for?", weight: 3 },
  { id: "capacity", q: "Can you actually deliver this — staff, equipment, capital?", weight: 3 },
  { id: "relevant", q: "Do you have relevant experience (commercial counts)?", weight: 2 },
  { id: "size",     q: "Is the contract the right size for your business today?", weight: 2 },
  { id: "price",    q: "Can you price this competitively and still profit?", weight: 3 },
  { id: "incumbent",q: "Is this new work (not an incumbent's easy recompete)?", weight: 2 },
  { id: "relation", q: "Have you had any contact with the agency or attended the pre-bid?", weight: 1 },
]

function GoNoGo({ btn }) {
  const [ans, setAns] = useState({})
  const set = (id, v) => setAns(a => ({ ...a, [id]: v }))

  const answered = GONOGO.filter(q => ans[q.id] !== undefined)
  const knockFail = GONOGO.filter(q => q.knockout && ans[q.id] === "no")
  const scored = GONOGO.filter(q => !q.knockout)
  const max = scored.reduce((s, q) => s + q.weight * 2, 0)
  const got = scored.reduce((s, q) => s + (ans[q.id] === "yes" ? q.weight * 2 : ans[q.id] === "partial" ? q.weight : 0), 0)
  const pct = max ? Math.round((got / max) * 100) : 0
  const done = answered.length === GONOGO.length

  const verdict = knockFail.length
    ? { label: "NO-BID", color: "#FF6432", why: `Blocked: ${knockFail.map(q => q.q.split("(")[0].trim().replace(/\?$/, "")).join("; ")}. These are pass/fail — fix them before spending another hour.` }
    : pct >= 70 ? { label: "BID IT", color: "#1DB954", why: "Strong fit. You clear the mandatories and score well on capability, price, and understanding — this is worth your time." }
    : pct >= 45 ? { label: "PROCEED WITH CARE", color: "#F8C81C", why: "Winnable, but you have real gaps. Shore up the weak answers below (or team with a partner) before you commit." }
    : { label: "PROBABLY NO-BID", color: "#FF6432", why: "Low fit. Your time is better spent on a bid you can actually win — use Bid Radar to find a closer match." }

  return (
    <div>
      <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 .3rem" }}>Bid / No-Bid Scorecard</h3>
      <p style={{ fontSize: ".85rem", color: "rgba(255,255,255,.5)", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
        The fastest way to raise your win rate is to stop writing proposals you were never going to win.
        Answer honestly — the first three are pass/fail.
      </p>

      {GONOGO.map(q => (
        <div key={q.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: ".7rem 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          <span style={{ fontSize: ".88rem", color: "rgba(255,255,255,.82)" }}>
            {q.q}
            {q.knockout && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".52rem", letterSpacing: ".1em", color: "#FF6432", border: "1px solid rgba(255,100,50,.35)", borderRadius: 20, padding: ".1rem .45rem", marginLeft: ".5rem", verticalAlign: "middle" }}>PASS/FAIL</span>}
          </span>
          <div style={{ display: "flex", gap: ".35rem", flex: "none" }}>
            {["yes", "partial", "no"].map(v => {
              const on = ans[q.id] === v
              const tint = v === "yes" ? "#1DB954" : v === "partial" ? "#F8C81C" : "#FF6432"
              if (q.knockout && v === "partial") return null
              return (
                <button key={v} onClick={() => set(q.id, v)}
                  style={{ background: on ? `${tint}22` : "none", border: `1px solid ${on ? tint : "rgba(255,255,255,.14)"}`, color: on ? tint : "rgba(255,255,255,.45)", padding: ".28rem .7rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>
                  {v}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {answered.length > 0 && (
        <div style={{ marginTop: "1.5rem", background: `${verdict.color}12`, border: `1px solid ${verdict.color}55`, borderRadius: 10, padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.35rem", fontWeight: 900, color: verdict.color }}>{verdict.label}</span>
            {!knockFail.length && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".8rem", color: "rgba(255,255,255,.6)" }}>fit score {pct}%</span>}
            {!done && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", color: "rgba(255,255,255,.35)" }}>({answered.length}/{GONOGO.length} answered)</span>}
          </div>
          <p style={{ fontSize: ".87rem", color: "rgba(255,255,255,.75)", marginTop: ".6rem", lineHeight: 1.6 }}>{verdict.why}</p>
        </div>
      )}
    </div>
  )
}
