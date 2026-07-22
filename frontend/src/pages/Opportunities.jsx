import { useState, useEffect } from "react"
import { apiJson } from "../lib/api"

const KIND_COLOR = {
  federal: "#1FB6EE", grants: "#1DB954", dod: "#F8C81C", state: "#EC1C7B",
}
const WIN_TONE = { good: "#1DB954", ok: "#1FB6EE", warn: "#F8C81C", bad: "#FF6432" }

export default function Opportunities({ onNavigate }) {
  const [search, setSearch] = useState("")
  const [naics, setNaics] = useState("")
  const [setAside, setSetAside] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)      // has the user run a search yet
  const [error, setError] = useState(null)
  const [sourceReport, setSourceReport] = useState([]) // per-source counts after a search
  const [allSources, setAllSources] = useState([])     // every site we search
  const [scores, setScores] = useState({})             // winnability score per result id
  const [savedSearches, setSavedSearches] = useState([])
  const [savingSearch, setSavingSearch] = useState(false)

  const daysUntil = d => (d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null)

  // Load the roster of bid sites once, for the legend.
  useEffect(() => {
    let alive = true
    apiJson("/api/opportunities/sources")
      .then(({ sources }) => { if (alive && sources) setAllSources(sources) })
      .catch(() => {})
    apiJson("/api/searches")
      .then(({ searches }) => { if (alive && searches) setSavedSearches(searches) })
      .catch(() => {})   // signed out / no table yet — saved searches just stay hidden
    return () => { alive = false }
  }, [])

  // ── saved searches ───────────────────────────────────────────
  const saveCurrentSearch = async () => {
    if (!search && !naics && !setAside) { setError("Enter a keyword, NAICS code, or set-aside first."); return }
    const suggested = [search, naics, setAside].filter(Boolean).join(" · ").slice(0, 40)
    const name = window.prompt("Name this search", suggested)
    if (!name) return
    setSavingSearch(true); setError(null)
    try {
      const { search: row } = await apiJson("/api/searches", {
        method: "POST",
        body: JSON.stringify({ name, keywords: search || null, naics_code: naics || null, set_aside: setAside || null }),
      })
      setSavedSearches(list => [row, ...list])
    } catch (e) { setError(e.message) } finally { setSavingSearch(false) }
  }

  const runSavedSearch = async (s) => {
    setSearch(s.keywords || ""); setNaics(s.naics_code || ""); setSetAside(s.set_aside || "")
    apiJson(`/api/searches/${s.id}/run`, { method: "POST" }).catch(() => {})
    // run with the saved values directly (state updates are async)
    await doSearch({ keywords: s.keywords || "", naics_code: s.naics_code || null, set_aside: s.set_aside || null })
  }

  const deleteSavedSearch = async (id, e) => {
    e?.stopPropagation()
    setSavedSearches(list => list.filter(x => x.id !== id))
    apiJson(`/api/searches/${id}`, { method: "DELETE" }).catch(() => {})
  }

  const doSearch = async (override) => {
    setLoading(true); setError(null); setSearched(true)
    try {
      const data = await apiJson("/api/opportunities/search", {
        method: "POST",
        body: JSON.stringify({
          keywords: (override?.keywords ?? search) || "technology services",
          naics_code: override ? override.naics_code : (naics || null),
          set_aside: override ? override.set_aside : (setAside || null),
          max_results: 40,
        })
      })
      // Backend already filters + de-dupes across every site — trust its results.
      const rows = Array.isArray(data.results) ? data.results : []
      setResults(rows)
      setSourceReport(Array.isArray(data.sources) ? data.sources : [])
      // Fire-and-forget: annotate each listing with a winnability score.
      setScores({})
      const items = rows.filter(r => r.naics_code).map(r => ({ id: r.id, naics_code: r.naics_code, agency: r.agency, set_aside: r.set_aside }))
      if (items.length) {
        apiJson("/api/intel/scores", { method: "POST", body: JSON.stringify({ items }) })
          .then(s => setScores(s.scores || {})).catch(() => {})
      }
    } catch (e) {
      setResults([])
      setSourceReport([])
      setError(e.message || "Search failed — please try again.")
    } finally {
      setLoading(false)
    }
  }

  const filtered = results

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }}>
          Every bid site, one search
        </div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>
          Find Bids
        </h1>
      </div>

      {/* Search bar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 180px auto", gap: ".75rem", marginBottom: "1.5rem" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doSearch()}
          placeholder="Search by keyword, agency, or solicitation number..."
          style={{ background: "rgba(255,255,255,.05)", border: "2px solid rgba(255,255,255,.12)", color: "#fff", padding: ".75rem 1rem", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".9rem", outline: "none", borderRadius: 6, transition: "border-color .15s" }} />
        <input value={naics} onChange={e => setNaics(e.target.value)}
          placeholder="NAICS code"
          style={{ background: "rgba(255,255,255,.05)", border: "2px solid rgba(255,255,255,.12)", color: "#fff", padding: ".75rem 1rem", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".9rem", outline: "none", borderRadius: 6 }} />
        <select value={setAside} onChange={e => setSetAside(e.target.value)}
          style={{ background: "rgba(255,255,255,.05)", border: "2px solid rgba(255,255,255,.12)", color: "#fff", padding: ".75rem 1rem", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".9rem", outline: "none", borderRadius: 6 }}>
          <option value="">All Set-Asides</option>
          <option value="WOSB">WOSB</option>
          <option value="SBA">Small Business</option>
          <option value="8A">8(a)</option>
        </select>
        <button onClick={() => doSearch()} disabled={loading}
          style={{ background: "#EC1C7B", color: "#fff", border: "none", padding: ".75rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".68rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap" }}>
          {loading ? "Searching..." : "Search →"}
        </button>
      </div>

      {/* Saved searches — the retention loop: set it up once, re-run forever */}
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <button onClick={saveCurrentSearch} disabled={savingSearch}
          style={{ background: "none", border: "1px dashed rgba(255,255,255,.25)", color: "rgba(255,255,255,.6)", padding: ".35rem .8rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" }}>
          {savingSearch ? "Saving…" : "★ Save this search"}
        </button>
        {savedSearches.map(s => (
          <span key={s.id} onClick={() => runSavedSearch(s)} title={[s.keywords, s.naics_code, s.set_aside].filter(Boolean).join(" · ")}
            style={{ display: "inline-flex", alignItems: "center", gap: ".45rem", background: "rgba(31,182,238,.1)", border: "1px solid rgba(31,182,238,.3)", color: "#1FB6EE", padding: ".35rem .5rem .35rem .8rem", borderRadius: 20, fontSize: ".78rem", cursor: "pointer" }}>
            {s.name}
            <button onClick={(e) => deleteSavedSearch(s.id, e)} title="Remove"
              style={{ background: "none", border: "none", color: "rgba(255,255,255,.35)", cursor: "pointer", fontSize: ".95rem", lineHeight: 1, padding: "0 .1rem" }}>×</button>
          </span>
        ))}
      </div>

      {/* Sources legend — every bid site we search, with live/curated + post-search counts */}
      {allSources.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.35)", marginBottom: ".6rem" }}>
            Searching {allSources.filter(s => s.enabled).length} bid sites simultaneously
          </div>
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            {allSources.map(s => {
              const report = sourceReport.find(r => r.name === s.name)
              const color = KIND_COLOR[s.kind] || "#1FB6EE"
              const dim = !s.enabled
              return (
                <span key={s.name} title={s.live_capable ? "Live API connected" : "Curated feed (live integration available)"}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: ".4rem",
                    background: `${color}14`, border: `1px solid ${color}33`,
                    color: dim ? "rgba(255,255,255,.3)" : color,
                    padding: ".3rem .7rem", borderRadius: 20,
                    fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".05em",
                    opacity: dim ? .5 : 1,
                  }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: report?.live ? "#1DB954" : color, boxShadow: report?.live ? "0 0 6px #1DB954" : "none" }} />
                  {s.name}
                  {report && <span style={{ color: "rgba(255,255,255,.5)" }}>· {report.count}</span>}
                </span>
              )
            })}
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".7rem", color: "rgba(255,255,255,.3)", marginTop: ".55rem" }}>
            <span style={{ color: "#1DB954" }}>●</span> live API · <span style={{ color: "rgba(255,255,255,.5)" }}>●</span> curated feed
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, padding: ".8rem 1rem", marginBottom: "1rem", fontSize: ".85rem", color: "#FF8870" }}>{error}</div>
      )}

      {/* Empty states */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 1.5rem", border: "1px dashed rgba(255,255,255,.1)", borderRadius: 12 }}>
          <div style={{ fontSize: "1rem", color: "rgba(255,255,255,.75)", marginBottom: ".4rem" }}>
            {searched ? "No opportunities matched" : "Search live government opportunities"}
          </div>
          <div style={{ fontSize: ".85rem", color: "rgba(255,255,255,.4)", maxWidth: 440, margin: "0 auto" }}>
            {searched
              ? "Try broader keywords, a different NAICS code, or clear the set-aside filter. We search SAM.gov, Grants.gov, FedConnect, and state/local portals."
              : "Enter a keyword or your NAICS code above and hit Search. FinesseWins pulls live bids from every major federal, grant, and state/local site into one list."}
          </div>
        </div>
      )}

      {/* Results */}
      <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
        {filtered.map(opp => {
          const days = daysUntil(opp.deadline)
          const urgent = days !== null && days <= 7 && days >= 0
          return (
            <div key={opp.id}
              style={{
                background: "rgba(255,255,255,.03)", border: `1px solid ${urgent ? "rgba(255,100,50,.25)" : "rgba(255,255,255,.08)"}`,
                borderRadius: 10, padding: "1.25rem", display: "grid",
                gridTemplateColumns: "1fr auto", gap: "1rem", alignItems: "center"
              }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: ".4rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: ".95rem" }}>{opp.title}</span>
                  {opp.sample && (
                    <span title="Representative sample — this exact listing may not be live. Verify on the source site."
                      style={{ background: "rgba(248,200,28,.12)", color: "#F8C81C", border: "1px solid rgba(248,200,28,.3)", padding: ".15rem .5rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".54rem", letterSpacing: ".1em" }}>SAMPLE</span>
                  )}
                  {scores[opp.id] && scores[opp.id].score != null && (
                    <span title={`Winnability: ${scores[opp.id].label}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", background: `${WIN_TONE[scores[opp.id].tone]}1a`, color: WIN_TONE[scores[opp.id].tone], border: `1px solid ${WIN_TONE[scores[opp.id].tone]}55`, padding: ".15rem .5rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".04em", fontWeight: 600 }}>
                      ◎ {scores[opp.id].score} · {scores[opp.id].label}
                    </span>
                  )}
                  {opp.set_aside && (
                    <span style={{ background: "rgba(31,182,238,.1)", color: "#1FB6EE", border: "1px solid rgba(31,182,238,.2)", padding: ".2rem .6rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".1em" }}>
                      {opp.set_aside}
                    </span>
                  )}
                  {opp.match && (
                    <span style={{ background: opp.match >= 90 ? "rgba(29,185,84,.1)" : "rgba(248,200,28,.1)", color: opp.match >= 90 ? "#1DB954" : "#F8C81C", border: `1px solid ${opp.match >= 90 ? "rgba(29,185,84,.2)" : "rgba(248,200,28,.2)"}`, padding: ".2rem .6rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".58rem" }}>
                      {opp.match}% match
                    </span>
                  )}
                </div>
                <div style={{ fontSize: ".83rem", color: "rgba(255,255,255,.55)", marginBottom: ".35rem" }}>
                  {opp.agency}
                </div>
                <div style={{ display: "flex", gap: "1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".62rem", color: "rgba(255,255,255,.35)", letterSpacing: ".06em", flexWrap: "wrap" }}>
                  {opp.solicitation_number && <span>{opp.solicitation_number}</span>}
                  {opp.naics_code && <span>NAICS {opp.naics_code}</span>}
                  <span style={{ color: urgent ? "#FF6432" : "rgba(255,255,255,.35)" }}>
                    {days === null ? "No deadline listed" : days < 0 ? "Deadline passed" : `${days} days left`}
                  </span>
                  {opp.type === "grant" && <span style={{ color: "#1DB954" }}>GRANT</span>}
                  {opp.value_est && <span style={{ color: "#F8C81C" }}>{opp.value_est}</span>}
                  <span style={{ color: "#1FB6EE" }}>{opp.source}</span>
                  {opp.url && <a href={opp.url} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,.4)", textDecoration: "none" }}>view ↗</a>}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
                <button
                  onClick={() => onNavigate("intel", { naics_code: opp.naics_code, agency: opp.agency, set_aside: opp.set_aside, title: opp.title })}
                  disabled={!opp.naics_code}
                  title={opp.naics_code ? "Check your real odds on this bid" : "No NAICS code on this listing"}
                  style={{ background: "rgba(31,182,238,.12)", color: "#1FB6EE", border: "1px solid rgba(31,182,238,.35)", padding: ".5rem 1.1rem", fontFamily: "'DM Mono', monospace", fontSize: ".62rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: opp.naics_code ? "pointer" : "not-allowed", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap", opacity: opp.naics_code ? 1 : .4 }}>
                  📊 My odds
                </button>
                <button
                  onClick={() => onNavigate("new-proposal")}
                  style={{ background: urgent ? "#EC1C7B" : "rgba(236,28,123,.15)", color: urgent ? "#fff" : "#EC1C7B", border: `1px solid ${urgent ? "#EC1C7B" : "rgba(236,28,123,.3)"}`, padding: ".5rem 1.1rem", fontFamily: "'DM Mono', monospace", fontSize: ".62rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap" }}>
                  Build Proposal →
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
