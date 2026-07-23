import { useState, useEffect } from "react"
import { apiJson } from "../lib/api"

/* Recompete Radar — the forward-looking half of finding work.
   Contracts are won 6–12 months before the RFP is published, by whoever
   already knows the incumbent's contract is ending. Bid-search engines
   only show you what's posted TODAY; this shows what's coming. */

const money = (v) => "$" + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })

export default function Recompetes({ onNavigate }) {
  const [naics, setNaics] = useState("")
  const [months, setMonths] = useState(18)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [myCodes, setMyCodes] = useState([])

  useEffect(() => {
    apiJson("/api/profile")
      .then(({ profile: p }) => {
        const codes = Array.isArray(p?.naics_codes) ? p.naics_codes.filter(Boolean) : []
        setMyCodes(codes)
        if (codes.length && !naics) setNaics(codes[0])
      })
      .catch(() => {})
  }, [])

  const run = async (code = naics, m = months) => {
    const c = String(code || "").trim()
    if (!/^\d{2,6}$/.test(c)) { setError("Enter a NAICS code (2–6 digits)."); return }
    setLoading(true); setError(null)
    try {
      const r = await apiJson(`/api/intel/recompetes?naics=${encodeURIComponent(c)}&months=${m}`)
      setData(r)
    } catch (e) { setError(e.message); setData(null) } finally { setLoading(false) }
  }

  const card = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.25rem" }
  const input = { background: "rgba(255,255,255,.05)", border: "2px solid rgba(255,255,255,.12)", color: "#fff", padding: ".72rem .9rem", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".9rem", outline: "none", borderRadius: 8, boxSizing: "border-box" }

  const urgency = (d) => (d <= 90 ? "#FF6432" : d <= 270 ? "#F8C81C" : "#1DB954")
  const window_ = (d) =>
    d <= 90 ? "RFP likely out now — move" :
    d <= 270 ? "Prime positioning window" :
    "Early — build the relationship"

  return (
    <div style={{ maxWidth: 940 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }}>
          Recompete Radar · Real federal award data
        </div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>
          See the bid before it's posted.
        </h1>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".92rem", lineHeight: 1.6, marginTop: ".6rem", maxWidth: 700 }}>
          Contracts are won <strong style={{ color: "#fff" }}>6–12 months before the RFP is published</strong> — by whoever already knew the
          incumbent's contract was ending. Search sites only show what's posted today. This shows what's <em>coming</em>:
          who holds the work now, what it's worth, and exactly when it expires.
        </p>
      </div>

      {error && <div style={{ background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, padding: ".8rem 1rem", marginBottom: "1rem", fontSize: ".85rem", color: "#FF8870" }}>{error}</div>}

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 170px auto", gap: ".7rem", alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: ".4rem" }}>NAICS code</label>
            <input style={{ ...input, width: "100%" }} value={naics} onChange={e => setNaics(e.target.value)}
              onKeyDown={e => e.key === "Enter" && run()} placeholder="e.g. 561720" />
          </div>
          <div>
            <label style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: ".4rem" }}>Expiring within</label>
            <select style={{ ...input, width: "100%" }} value={months} onChange={e => { setMonths(+e.target.value); if (data) run(naics, +e.target.value) }}>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
              <option value={18}>18 months</option>
              <option value={24}>24 months</option>
            </select>
          </div>
          <button onClick={() => run()} disabled={loading}
            style={{ background: "#EC1C7B", color: "#fff", border: "none", padding: ".78rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".68rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>
            {loading ? "Scanning…" : "Scan →"}
          </button>
        </div>

        {myCodes.length > 0 && (
          <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginTop: ".9rem", alignItems: "center" }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.35)" }}>Your codes:</span>
            {myCodes.map(c => (
              <button key={c} onClick={() => { setNaics(c); run(c) }}
                style={{ background: naics === c ? "rgba(236,28,123,.15)" : "none", border: `1px solid ${naics === c ? "#EC1C7B" : "rgba(255,255,255,.15)"}`, color: naics === c ? "#fff" : "rgba(255,255,255,.5)", padding: ".25rem .7rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".62rem", cursor: "pointer" }}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {data && (
        <>
          <div style={{ ...card, display: "flex", gap: "2rem", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "2.1rem", fontWeight: 900, color: "#F8C81C", lineHeight: 1 }}>{data.count}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginTop: ".3rem" }}>Contracts expiring</div>
            </div>
            <div style={{ borderLeft: "1px solid rgba(255,255,255,.1)", paddingLeft: "1.5rem" }}>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.5rem", fontWeight: 900, color: "#1DB954", lineHeight: 1 }}>{money(data.total_value)}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginTop: ".3rem" }}>Total value in play</div>
            </div>
            <div style={{ borderLeft: "1px solid rgba(255,255,255,.1)", paddingLeft: "1.5rem", fontSize: ".85rem", color: "rgba(255,255,255,.6)", maxWidth: 330, lineHeight: 1.55 }}>
              NAICS <strong style={{ color: "#fff" }}>{data.naics}</strong>{data.naics_name ? ` · ${data.naics_name}` : ""} — work coming up for recompete in the next {data.months} months.
            </div>
          </div>

          {data.count === 0 ? (
            <div style={{ ...card, textAlign: "center", color: "rgba(255,255,255,.5)" }}>
              No contracts in this NAICS are expiring in that window. Try a longer window, or a broader NAICS code.
            </div>
          ) : (
            <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 190px 130px", gap: "1rem", padding: ".75rem 1.25rem", background: "rgba(255,255,255,.03)", fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.4)" }}>
                <span>Expires</span><span>Incumbent</span><span>Agency</span><span style={{ textAlign: "right" }}>Value</span>
              </div>
              {data.recompetes.map((r, i) => (
                <div key={r.award_id || i}
                  style={{ display: "grid", gridTemplateColumns: "110px 1fr 190px 130px", gap: "1rem", padding: ".85rem 1.25rem", borderTop: i ? "1px solid rgba(255,255,255,.05)" : "none", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".74rem", color: "#fff" }}>{r.end_date}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".58rem", color: urgency(r.days_left) }}>{r.days_left}d left</div>
                  </div>
                  <div>
                    <div style={{ fontSize: ".88rem", fontWeight: 600 }}>{r.incumbent}</div>
                    <div style={{ fontSize: ".7rem", color: urgency(r.days_left) }}>{window_(r.days_left)}</div>
                  </div>
                  <div style={{ fontSize: ".78rem", color: "rgba(255,255,255,.6)" }}>{r.agency}{r.sub_agency ? ` · ${r.sub_agency}` : ""}</div>
                  <div style={{ textAlign: "right", fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: ".85rem", color: "#F8C81C" }}>{money(r.amount)}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ ...card, marginTop: "1.25rem" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "#1FB6EE", marginBottom: ".6rem" }}>What to do with this</div>
            <ul style={{ listStyle: "none", display: "grid", gap: ".55rem", fontSize: ".87rem", color: "rgba(255,255,255,.72)", lineHeight: 1.55 }}>
              <li><strong style={{ color: "#fff" }}>12+ months out</strong> — introduce yourself to the contracting office and small-business specialist. Get on the list before anything is written.</li>
              <li><strong style={{ color: "#fff" }}>6–9 months out</strong> — this is the window. Watch for the sources-sought notice and <em>respond to it</em>; that's how requirements get shaped and set-asides get justified.</li>
              <li><strong style={{ color: "#fff" }}>Under 3 months</strong> — the RFP is likely out or imminent. Run it through the <span style={{ color: "#1FB6EE", cursor: "pointer" }} onClick={() => onNavigate("rfp-shredder")}>RFP Shredder</span> the moment it drops.</li>
              <li>A large incumbent on a big award often means <strong style={{ color: "#fff" }}>subcontracting</strong> is the realistic first move — ask them, not the agency.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
