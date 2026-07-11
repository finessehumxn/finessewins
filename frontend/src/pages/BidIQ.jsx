import { useState, useEffect } from "react"
import { apiJson } from "../lib/api"

const TONE = {
  good: { c: "#1DB954", bg: "rgba(29,185,84,.1)", b: "rgba(29,185,84,.3)" },
  ok:   { c: "#1FB6EE", bg: "rgba(31,182,238,.1)", b: "rgba(31,182,238,.3)" },
  warn: { c: "#F8C81C", bg: "rgba(248,200,28,.1)", b: "rgba(248,200,28,.3)" },
  bad:  { c: "#FF6432", bg: "rgba(255,100,50,.1)", b: "rgba(255,100,50,.3)" },
}
const SET_ASIDES = ["", "WOSB", "8(a)", "HUBZone", "SDVOSB", "SBA"]

function Gauge({ score, tone }) {
  const t = TONE[tone] || TONE.ok
  const R = 52, C = 2 * Math.PI * R
  const off = C * (1 - score / 100)
  return (
    <div style={{ position: "relative", width: 130, height: 130, flexShrink: 0 }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="11" />
        <circle cx="65" cy="65" r={R} fill="none" stroke={t.c} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 65 65)"
          style={{ transition: "stroke-dashoffset .8s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "2rem", fontWeight: 900, color: t.c, letterSpacing: "-.02em", lineHeight: 1 }}>{score}</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".5rem", letterSpacing: ".12em", color: "rgba(255,255,255,.4)", marginTop: ".2rem" }}>WINNABILITY</div>
      </div>
    </div>
  )
}

export default function BidIQ({ onNavigate, seed }) {
  const [naics, setNaics] = useState(seed?.naics_code || "")
  const [agency, setAgency] = useState(seed?.agency || "")
  const [setAside, setSetAside] = useState(seed?.set_aside || "")
  const [title, setTitle] = useState(seed?.title || "")
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = async (over) => {
    const code = (over?.naics ?? naics).trim()
    if (!/^\d{2,6}$/.test(code)) { setError("Enter a valid NAICS code (2–6 digits)."); return }
    setLoading(true); setError(null); setReport(null)
    try {
      const r = await apiJson("/api/intel/winnability", { method: "POST", body: JSON.stringify({
        naics_code: code, agency: (over?.agency ?? agency) || null,
        set_aside: (over?.set_aside ?? setAside) || null, title: over?.title ?? title,
      }) })
      setReport(r)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  // Auto-run when arriving from a "My odds" click with a seed.
  useEffect(() => { if (seed?.naics_code) run({ naics: seed.naics_code }) /* eslint-disable-next-line */ }, [])

  const t = report ? (TONE[report.verdict_tone] || TONE.ok) : TONE.ok
  const card = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "1.5rem" }
  const label = { display: "block", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: ".4rem" }
  const input = { width: "100%", background: "rgba(255,255,255,.05)", border: "2px solid rgba(255,255,255,.12)", color: "#fff", padding: ".7rem .85rem", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".9rem", outline: "none", borderRadius: 8, boxSizing: "border-box" }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }}>
          Bid IQ · Powered by real federal award data
        </div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>Should you bid?</h1>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".92rem", lineHeight: 1.6, marginTop: ".7rem", maxWidth: 640 }}>
          Before you burn 40 hours on a proposal, get the honest read. We pull <strong style={{ color: "#fff" }}>real
          USAspending.gov award history</strong> to show who actually wins this work, what it pays, and your realistic odds —
          then tell you the moves that improve them. <strong style={{ color: "#1FB6EE" }}>Even when the answer is "skip it."</strong>
        </p>
        <p style={{ color: "rgba(255,255,255,.35)", fontSize: ".72rem", lineHeight: 1.5, marginTop: ".6rem", maxWidth: 640 }}>
          Estimates are derived from public USAspending.gov award history and are guidance only — not a guarantee of award, price, or outcome. Always confirm details on the official solicitation.
        </p>
      </div>

      {/* Query form */}
      <div style={{ ...card, marginBottom: "1.25rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 160px", gap: ".9rem", marginBottom: ".9rem" }}>
          <div><label style={label}>NAICS code *</label><input style={input} value={naics} onChange={e => setNaics(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="541512" /></div>
          <div><label style={label}>Agency (optional)</label><input style={input} value={agency} onChange={e => setAgency(e.target.value)} placeholder="e.g. Department of Veterans Affairs" /></div>
          <div><label style={label}>Set-aside</label><select style={input} value={setAside} onChange={e => setSetAside(e.target.value)}>{SET_ASIDES.map(s => <option key={s} value={s}>{s || "Full & open"}</option>)}</select></div>
        </div>
        <button onClick={() => run()} disabled={loading}
          style={{ background: "#EC1C7B", color: "#fff", border: "none", padding: ".75rem 1.75rem", fontFamily: "'DM Mono', monospace", fontSize: ".72rem", letterSpacing: ".12em", textTransform: "uppercase", cursor: loading ? "wait" : "pointer", borderRadius: 8, fontWeight: 700 }}>
          {loading ? "Reading award history…" : "Check my odds →"}
        </button>
        {error && <div style={{ marginTop: "1rem", background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, padding: ".7rem .9rem", fontSize: ".82rem", color: "#FF8870" }}>{error}</div>}
      </div>

      {loading && <div style={{ textAlign: "center", padding: "2rem", color: "rgba(255,255,255,.4)", fontFamily: "'DM Mono', monospace", fontSize: ".8rem" }}>Analyzing real award data across the last 3 years…</div>}

      {report && !loading && (
        <>
          {/* Verdict */}
          <div style={{ ...card, borderColor: t.b, background: t.bg, marginBottom: "1.25rem", display: "flex", gap: "1.5rem", alignItems: "center" }}>
            <Gauge score={report.score} tone={report.verdict_tone} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.4rem", fontWeight: 900, color: t.c, letterSpacing: "-.02em", marginBottom: ".4rem" }}>{report.verdict}</div>
              {report.reasons?.slice(0, 2).map((r, i) => (
                <div key={i} style={{ display: "flex", gap: ".5rem", fontSize: ".85rem", color: "rgba(255,255,255,.8)", marginBottom: ".3rem" }}>
                  <span style={{ color: "#1DB954" }}>✓</span> {r}
                </div>
              ))}
              {report.warnings?.slice(0, 2).map((w, i) => (
                <div key={i} style={{ display: "flex", gap: ".5rem", fontSize: ".85rem", color: "rgba(255,255,255,.7)", marginBottom: ".3rem" }}>
                  <span style={{ color: "#F8C81C" }}>▲</span> {w}
                </div>
              ))}
              {!report.data_available && <div style={{ fontSize: ".78rem", color: "rgba(255,255,255,.4)", marginTop: ".4rem" }}>Limited award history for this code — treat as a rough read.</div>}
            </div>
          </div>

          {/* Data cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
            {/* Price to win */}
            <div style={card}>
              <div style={{ ...label, marginBottom: ".8rem" }}>💰 Price to win</div>
              {report.price_to_win ? (
                <>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, color: "#F8C81C", letterSpacing: "-.02em" }}>{report.price_to_win.target_fmt}</div>
                  <div style={{ fontSize: ".82rem", color: "rgba(255,255,255,.6)", marginTop: ".3rem" }}>competitive target · typical award {report.price_to_win.typical_fmt}</div>
                  <div style={{ marginTop: ".9rem", height: 6, background: "rgba(255,255,255,.08)", borderRadius: 3, position: "relative" }}>
                    <div style={{ position: "absolute", left: "8%", right: "8%", top: 0, bottom: 0, background: "linear-gradient(90deg,#1DB954,#F8C81C,#FF6432)", borderRadius: 3, opacity: .6 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'DM Mono', monospace", fontSize: ".58rem", color: "rgba(255,255,255,.4)", marginTop: ".4rem" }}>
                    <span>{report.price_to_win.low_fmt}</span><span>range from {report.price_to_win.sample} awards</span><span>{report.price_to_win.high_fmt}</span>
                  </div>
                </>
              ) : <div style={{ color: "rgba(255,255,255,.4)", fontSize: ".85rem" }}>Not enough award data to estimate.</div>}
            </div>

            {/* Market */}
            <div style={card}>
              <div style={{ ...label, marginBottom: ".8rem" }}>📊 The market (last 3 yrs)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
                {[
                  ["Total awards", report.market.total_awards_3y?.toLocaleString() ?? "—"],
                  ["Small-biz share", report.market.small_business_share_pct != null ? report.market.small_business_share_pct + "%" : "—"],
                  [`Your lane (${report.market.your_lane_label})`, report.market.your_lane_share_pct != null ? report.market.your_lane_share_pct + "%" : "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: ".82rem", color: "rgba(255,255,255,.6)" }}>{k}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".95rem", color: "#1FB6EE", fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Incumbents */}
          {report.incumbents?.length > 0 && (
            <div style={{ ...card, marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div style={label}>🏆 Who wins this work</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", color: report.incumbent_entrenchment_pct >= 40 ? "#FF6432" : "rgba(255,255,255,.4)" }}>
                  top firm holds {report.incumbent_entrenchment_pct}%
                </div>
              </div>
              {report.incumbents.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: ".45rem 0", borderTop: i ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                  <span style={{ fontSize: ".85rem", color: "rgba(255,255,255,.8)" }}>{r.name}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".72rem", color: "rgba(255,255,255,.5)" }}>{r.awards} awards · {r.total_fmt}</span>
                </div>
              ))}
            </div>
          )}

          {/* Path to win */}
          <div style={{ ...card, marginBottom: "1.25rem" }}>
            <div style={{ ...label, marginBottom: "1rem" }}>🧭 Your path to win</div>
            <div style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}>
              {report.path_to_win.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: ".75rem", alignItems: "flex-start" }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: "rgba(236,28,123,.15)", color: "#EC1C7B", fontFamily: "'DM Mono', monospace", fontSize: ".65rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                  <span style={{ fontSize: ".88rem", color: "rgba(255,255,255,.78)", lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ display: "flex", gap: ".75rem" }}>
            <button onClick={() => onNavigate("new-proposal")}
              style={{ background: "#EC1C7B", color: "#fff", border: "none", padding: ".75rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".7rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 8, fontWeight: 700 }}>
              {report.score >= 45 ? "Build this proposal →" : "Build it anyway →"}
            </button>
            <button onClick={() => onNavigate("opportunities")}
              style={{ background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.7)", border: "1px solid rgba(255,255,255,.2)", padding: ".75rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".7rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 8 }}>
              {report.score >= 45 ? "Find more bids" : "Find a better fit"}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
