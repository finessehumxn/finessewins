import { useState, useEffect } from "react"
import { apiJson } from "../lib/api"

const KIND_TINT = { grant: "#1DB954", contract: "#1FB6EE" }
const WIN_TONE = { good: "#1DB954", ok: "#1FB6EE", warn: "#F8C81C", bad: "#FF6432" }

export default function Alerts({ onNavigate }) {
  const [codes, setCodes] = useState([])          // [{code, name}]
  const [keywords, setKeywords] = useState("")
  const [alertEmail, setAlertEmail] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [suggestions, setSuggestions] = useState([])
  const [matches, setMatches] = useState([])
  const [unseen, setUnseen] = useState(0)
  const [newCode, setNewCode] = useState("")
  const [results, setResults] = useState([])       // live search matches
  const [scores, setScores] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)

  // Initial load — settings, suggestions, and the current feed.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [settings, sug, feed] = await Promise.all([
          apiJson("/api/alerts/settings"),
          apiJson("/api/naics/suggestions").catch(() => ({ suggestions: [] })),
          apiJson("/api/alerts/matches").catch(() => ({ matches: [], unseen: 0 })),
        ])
        if (!alive) return
        setCodes(settings.watched_naics || [])
        setKeywords(settings.alert_keywords || "")
        setAlertEmail(settings.alert_email || "")
        setEnabled(settings.alerts_enabled !== false)
        setSuggestions(sug.suggestions || [])
        setMatches(feed.matches || [])
        setUnseen(feed.unseen || 0)
        scoreMatches(feed.matches || [])
      } catch (e) {
        if (alive) setError(e.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // Live NAICS search — type "cleaning", "trucking", "catering", or a code.
  useEffect(() => {
    const q = newCode.trim()
    if (q.length < 2) { setResults([]); return }
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await apiJson(`/api/naics/suggestions?q=${encodeURIComponent(q)}`)
        if (alive) setResults((r.suggestions || []).filter(s => !codes.some(c => c.code === s.code)))
      } catch { if (alive) setResults([]) }
    }, 180)
    return () => { alive = false; clearTimeout(t) }
  }, [newCode, codes])

  const addCode = (code, name) => {
    const c = String(code || "").trim()
    if (!/^\d{2,6}$/.test(c)) { setError('Search by what you do (e.g. "cleaning") and tap a match, or enter a NAICS code.'); return }
    if (codes.some(x => x.code === c)) { setNewCode(""); setResults([]); return }
    const label = name || suggestions.find(s => s.code === c)?.name || results.find(s => s.code === c)?.name || null
    setCodes([...codes, { code: c, name: label }])
    setNewCode(""); setResults([])
    setError(null)
  }

  const removeCode = (code) => setCodes(codes.filter(x => x.code !== code))

  const save = async () => {
    setSaving(true); setError(null); setNotice(null)
    try {
      await apiJson("/api/alerts/settings", {
        method: "PUT",
        body: JSON.stringify({
          watched_naics: codes.map(c => c.code),
          alert_keywords: keywords || null,
          alert_email: alertEmail || null,
          alerts_enabled: enabled,
        }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const checkNow = async () => {
    if (!codes.length) { setError("Add at least one NAICS code first."); return }
    setChecking(true); setError(null); setNotice(null)
    try {
      await save() // persist codes before sweeping
      const res = await apiJson("/api/alerts/run", { method: "POST" })
      const feed = await apiJson("/api/alerts/matches")
      setMatches(feed.matches || [])
      setUnseen(feed.unseen || 0)
      scoreMatches(feed.matches || [])
      setNotice(res.new_count > 0
        ? `Found ${res.new_count} new opportunit${res.new_count === 1 ? "y" : "ies"} across all bid sites!`
        : "You're all caught up — no new matches right now. We'll keep checking twice a day.")
    } catch (e) { setError(e.message) } finally { setChecking(false) }
  }

  const markAllSeen = async () => {
    try {
      const res = await apiJson("/api/alerts/matches/seen", { method: "POST", body: JSON.stringify({}) })
      setUnseen(res.unseen || 0)
      setMatches(matches.map(m => ({ ...m, seen: true })))
    } catch (e) { setError(e.message) }
  }

  const scoreMatches = (rows) => {
    const items = (rows || []).filter(m => m.naics_code || m.matched_naics)
      .map(m => ({ id: m.id || m.opportunity_id, naics_code: m.naics_code || m.matched_naics, agency: m.agency, set_aside: m.set_aside }))
    if (!items.length) return
    apiJson("/api/intel/scores", { method: "POST", body: JSON.stringify({ items }) })
      .then(s => setScores(prev => ({ ...prev, ...(s.scores || {}) }))).catch(() => {})
  }

  const daysUntil = (d) => (d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null)

  const card = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "1.75rem", marginBottom: "1.25rem" }
  const label = { display: "block", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: ".4rem" }
  const input = { width: "100%", background: "rgba(255,255,255,.05)", border: "2px solid rgba(255,255,255,.12)", color: "#fff", padding: ".7rem .9rem", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".9rem", outline: "none", borderRadius: 8, boxSizing: "border-box" }

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,.4)", fontFamily: "'DM Mono', monospace", fontSize: ".8rem" }}>Loading your watchlist…</div>
  )

  return (
    <div style={{ maxWidth: 820 }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }}>
          NAICS Watch · Updated twice daily
        </div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>
          Your Bid Radar
        </h1>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".92rem", lineHeight: 1.6, marginTop: ".75rem", maxWidth: 640 }}>
          Save the <strong style={{ color: "#fff" }}>NAICS codes</strong> for the work you do — the industry codes the
          government uses to categorize contracts. FinesseWins then watches <strong style={{ color: "#fff" }}>every bid
          site</strong> (SAM.gov, Grants.gov, FedConnect, GSA eBuy, DIBBS, and state/local portals) and drops every new
          match into one feed below. We refresh <strong style={{ color: "#1FB6EE" }}>twice a day</strong> so you never
          miss a deadline.
        </p>
      </div>

      {notice && (
        <div style={{ background: "rgba(29,185,84,.1)", border: "1px solid rgba(29,185,84,.3)", borderRadius: 8, padding: ".8rem 1rem", marginBottom: "1rem", fontSize: ".85rem", color: "#1DB954" }}>{notice}</div>
      )}
      {error && (
        <div style={{ background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, padding: ".8rem 1rem", marginBottom: "1rem", fontSize: ".85rem", color: "#FF8870" }}>{error}</div>
      )}

      {/* Watched codes */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: 0 }}>Codes you're watching</h3>
          <a href="https://www.census.gov/naics/" target="_blank" rel="noreferrer"
            style={{ fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".08em", color: "#1FB6EE", textDecoration: "none" }}>
            Not sure of yours? Look it up ↗
          </a>
        </div>

        {/* Current codes */}
        {codes.length > 0 ? (
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            {codes.map(c => (
              <span key={c.code} style={{ display: "inline-flex", alignItems: "center", gap: ".5rem", background: "rgba(236,28,123,.1)", border: "1px solid rgba(236,28,123,.3)", color: "#fff", padding: ".4rem .5rem .4rem .8rem", borderRadius: 8, fontSize: ".82rem" }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "#EC1C7B" }}>{c.code}</span>
                {c.name && <span style={{ color: "rgba(255,255,255,.7)", fontSize: ".78rem" }}>{c.name}</span>}
                <button onClick={() => removeCode(c.code)} title="Remove"
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "0 .15rem" }}>×</button>
              </span>
            ))}
          </div>
        ) : (
          <div style={{ padding: "1rem", background: "rgba(248,200,28,.06)", border: "1px dashed rgba(248,200,28,.3)", borderRadius: 8, color: "rgba(255,255,255,.6)", fontSize: ".85rem", marginBottom: "1rem" }}>
            👋 No codes yet. Add the ones for your line of work below — tap a suggestion to start.
          </div>
        )}

        {/* Add code — search by trade OR type a code */}
        <div style={{ position: "relative", marginBottom: "1rem" }}>
          <div style={{ display: "flex", gap: ".6rem" }}>
            <input value={newCode} onChange={e => setNewCode(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { const top = results[0]; top ? addCode(top.code, top.name) : addCode(newCode) }
                if (e.key === "Escape") setResults([])
              }}
              placeholder='Search your trade — "cleaning", "trucking", "catering"… or a code'
              style={{ ...input, flex: 1 }} />
            <button onClick={() => { const top = results[0]; top ? addCode(top.code, top.name) : addCode(newCode) }}
              style={{ background: "#EC1C7B", color: "#fff", border: "none", padding: ".7rem 1.25rem", fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>
              + Add
            </button>
          </div>

          {/* Live results dropdown */}
          {results.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: ".4rem", background: "#140e18", border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.5)", zIndex: 20, overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
              {results.map((s, i) => (
                <button key={s.code} onClick={() => addCode(s.code, s.name)}
                  style={{ display: "flex", alignItems: "center", gap: ".7rem", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: i ? "1px solid rgba(255,255,255,.06)" : "none", color: "#fff", padding: ".65rem .9rem", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".85rem" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(236,28,123,.12)"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".72rem", fontWeight: 700, color: "#EC1C7B", minWidth: 52 }}>{s.code}</span>
                  <span style={{ color: "rgba(255,255,255,.85)" }}>{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div>
            <div style={{ ...label, marginBottom: ".5rem" }}>Popular for small & minority-owned firms</div>
            <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
              {suggestions.filter(s => !codes.some(c => c.code === s.code)).slice(0, 10).map(s => (
                <button key={s.code} onClick={() => addCode(s.code)} title={s.name}
                  style={{ background: "none", border: "1px solid rgba(255,255,255,.15)", color: "rgba(255,255,255,.6)", padding: ".3rem .7rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".04em", cursor: "pointer" }}>
                  + {s.code} · {s.name.length > 26 ? s.name.slice(0, 24) + "…" : s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Settings */}
      <div style={card}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 1.25rem" }}>Alert settings</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <label style={label}>Send alerts to</label>
            <input style={input} type="email" value={alertEmail} onChange={e => setAlertEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div>
            <label style={label}>Extra keyword filter (optional)</label>
            <input style={input} value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="e.g. website, training, health" />
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: ".6rem", cursor: "pointer", fontSize: ".88rem", color: "rgba(255,255,255,.8)" }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#EC1C7B" }} />
          Email me a digest when new opportunities are posted (twice daily)
        </label>

        <div style={{ display: "flex", gap: ".75rem", marginTop: "1.5rem" }}>
          <button onClick={save} disabled={saving}
            style={{ background: saved ? "#1DB954" : "#EC1C7B", color: "#fff", border: "none", padding: ".7rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".68rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: saving ? "wait" : "pointer", borderRadius: 8, fontWeight: 700 }}>
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save Watchlist"}
          </button>
          <button onClick={checkNow} disabled={checking}
            style={{ background: "rgba(31,182,238,.12)", color: "#1FB6EE", border: "1px solid rgba(31,182,238,.35)", padding: ".7rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".68rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: checking ? "wait" : "pointer", borderRadius: 8, fontWeight: 700, display: "flex", alignItems: "center", gap: ".5rem" }}>
            {checking ? "Scanning all sites…" : "⚡ Check now"}
          </button>
        </div>
      </div>

      {/* Matches feed */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: 0 }}>
          Matches {matches.length > 0 && <span style={{ color: "rgba(255,255,255,.4)", fontWeight: 400 }}>({matches.length})</span>}
          {unseen > 0 && <span style={{ marginLeft: ".6rem", background: "#EC1C7B", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: ".55rem", padding: ".2rem .5rem", borderRadius: 20, letterSpacing: ".08em", verticalAlign: "middle" }}>{unseen} NEW</span>}
        </h3>
        {unseen > 0 && (
          <button onClick={markAllSeen}
            style={{ background: "none", border: "1px solid rgba(255,255,255,.15)", color: "rgba(255,255,255,.5)", padding: ".4rem .9rem", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6 }}>
            Mark all seen
          </button>
        )}
      </div>

      {matches.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 2rem", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, color: "rgba(255,255,255,.4)" }}>
          <div style={{ fontSize: "2rem", marginBottom: ".75rem" }}>📡</div>
          <div style={{ fontSize: ".92rem", color: "rgba(255,255,255,.6)", marginBottom: ".4rem" }}>No matches yet.</div>
          <div style={{ fontSize: ".82rem" }}>Add your codes and hit <strong style={{ color: "#1FB6EE" }}>Check now</strong> — or we'll find them for you within 12 hours.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          {matches.map(m => {
            const days = daysUntil(m.deadline)
            const urgent = days !== null && days >= 0 && days <= 7
            return (
              <div key={m.id || m.opportunity_id}
                style={{ background: m.seen ? "rgba(255,255,255,.02)" : "rgba(236,28,123,.05)", border: `1px solid ${m.seen ? "rgba(255,255,255,.08)" : "rgba(236,28,123,.25)"}`, borderRadius: 10, padding: "1.1rem 1.25rem", display: "grid", gridTemplateColumns: "1fr auto", gap: "1rem", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".35rem", flexWrap: "wrap" }}>
                    {!m.seen && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#EC1C7B" }} />}
                    <span style={{ fontWeight: 700, fontSize: ".92rem" }}>{m.title}</span>
                    {(() => { const s = scores[m.id || m.opportunity_id]; return s && s.score != null ? (
                      <span title={`Winnability: ${s.label}`} style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", background: `${WIN_TONE[s.tone]}1a`, color: WIN_TONE[s.tone], border: `1px solid ${WIN_TONE[s.tone]}55`, padding: ".12rem .5rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".04em", fontWeight: 600 }}>◎ {s.score}</span>
                    ) : null })()}
                    {m.type === "grant" && <span style={{ background: "rgba(29,185,84,.12)", color: "#1DB954", padding: ".15rem .5rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".1em" }}>GRANT</span>}
                    {m.set_aside && <span style={{ background: "rgba(31,182,238,.1)", color: "#1FB6EE", padding: ".15rem .5rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".08em" }}>{m.set_aside}</span>}
                  </div>
                  <div style={{ fontSize: ".82rem", color: "rgba(255,255,255,.55)", marginBottom: ".3rem" }}>{m.agency}</div>
                  <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", color: "rgba(255,255,255,.35)", letterSpacing: ".05em" }}>
                    <span style={{ color: "#1FB6EE" }}>{m.source}</span>
                    {(m.naics_name || m.matched_naics) && <span>NAICS {m.matched_naics}{m.naics_name ? ` · ${m.naics_name}` : ""}</span>}
                    <span style={{ color: urgent ? "#FF6432" : "rgba(255,255,255,.35)" }}>
                      {days === null ? "No deadline listed" : days < 0 ? "Closed" : `${days} days left`}
                    </span>
                    {m.url && <a href={m.url} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,.4)", textDecoration: "none" }}>view ↗</a>}
                  </div>
                </div>
                <button onClick={() => onNavigate("new-proposal")}
                  style={{ background: urgent ? "#EC1C7B" : "rgba(236,28,123,.15)", color: urgent ? "#fff" : "#EC1C7B", border: `1px solid ${urgent ? "#EC1C7B" : "rgba(236,28,123,.3)"}`, padding: ".55rem 1.1rem", fontFamily: "'DM Mono', monospace", fontSize: ".62rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap" }}>
                  Build Proposal →
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
