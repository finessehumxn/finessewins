import { useState, useEffect } from "react"
import { apiJson, apiDownload } from "../lib/api"

const ORG_TYPES = [
  { v: "apex", label: "APEX Accelerator (PTAC)" },
  { v: "sbdc", label: "Small Business Development Center" },
  { v: "mbda", label: "MBDA Center" },
  { v: "diversity", label: "Supplier Diversity Office" },
  { v: "prime", label: "Prime Contractor" },
  { v: "other", label: "Other" },
]
const STAGES = ["lead", "active", "bidding", "won", "inactive"]
const STAGE_COLOR = { lead: "#8A8AA0", active: "#1FB6EE", bidding: "#F8C81C", won: "#1DB954", inactive: "#6A6A7A" }
const CERTS = ["WOSB", "EDWOSB", "MBE", "DBE", "Black-Owned", "8a", "HUBZone", "SDVOSB"]

const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString()

export default function Advisor({ onNavigate }) {
  const [org, setOrg] = useState({ is_advisor: false, org_name: "", org_type: "apex" })
  const [clients, setClients] = useState([])
  const [impact, setImpact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingOrg, setSavingOrg] = useState(false)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newClient, setNewClient] = useState({ name: "", contact_email: "", certifications: [], naics_codes: "", stage: "lead" })
  const [matchesFor, setMatchesFor] = useState({}) // clientId -> {loading, rows}

  const load = async () => {
    try {
      const [o, c] = await Promise.all([apiJson("/api/org"), apiJson("/api/org/clients")])
      setOrg({ is_advisor: o.is_advisor, org_name: o.org_name || "", org_type: o.org_type || "apex" })
      setClients(c.clients || [])
      setImpact(c.impact || null)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const saveOrg = async () => {
    setSavingOrg(true); setError(null)
    try {
      await apiJson("/api/org", { method: "PUT", body: JSON.stringify({ is_advisor: true, org_name: org.org_name, org_type: org.org_type }) })
      setOrg(o => ({ ...o, is_advisor: true }))
    } catch (e) { setError(e.message) } finally { setSavingOrg(false) }
  }

  const addClient = async () => {
    if (!newClient.name.trim()) { setError("Give the business a name."); return }
    setError(null)
    try {
      await apiJson("/api/org/clients", { method: "POST", body: JSON.stringify({
        ...newClient,
        naics_codes: newClient.naics_codes.split(/[,\s]+/).map(s => s.trim()).filter(Boolean),
      }) })
      setNewClient({ name: "", contact_email: "", certifications: [], naics_codes: "", stage: "lead" })
      setShowAdd(false)
      await load()
    } catch (e) { setError(e.message) }
  }

  const patchClient = async (id, patch) => {
    setClients(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c)) // optimistic
    try {
      await apiJson(`/api/org/clients/${id}`, { method: "PUT", body: JSON.stringify(patch) })
      const c = await apiJson("/api/org/clients"); setImpact(c.impact) // refresh impact totals
    } catch (e) { setError(e.message); load() }
  }

  const removeClient = async (id) => {
    setClients(cs => cs.filter(c => c.id !== id))
    try { await apiJson(`/api/org/clients/${id}`, { method: "DELETE" }); const c = await apiJson("/api/org/clients"); setImpact(c.impact) }
    catch (e) { setError(e.message); load() }
  }

  const findMatches = async (id) => {
    setMatchesFor(m => ({ ...m, [id]: { loading: true, rows: [] } }))
    try {
      const res = await apiJson(`/api/org/clients/${id}/matches`)
      setMatchesFor(m => ({ ...m, [id]: { loading: false, rows: res.matches || [] } }))
    } catch (e) { setMatchesFor(m => ({ ...m, [id]: { loading: false, rows: [], error: e.message } })) }
  }

  const exportCsv = () => apiDownload("/api/org/impact/report.csv", "finessewins_impact_report.csv").catch(e => setError(e.message))

  const card = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.25rem" }
  const label = { display: "block", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: ".4rem" }
  const input = { width: "100%", background: "rgba(255,255,255,.05)", border: "2px solid rgba(255,255,255,.12)", color: "#fff", padding: ".65rem .85rem", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".88rem", outline: "none", borderRadius: 8, boxSizing: "border-box" }
  const numInput = { ...input, padding: ".4rem .5rem", textAlign: "center", fontFamily: "'DM Mono', monospace" }

  if (loading) return <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,.4)", fontFamily: "'DM Mono', monospace", fontSize: ".8rem" }}>Loading console…</div>

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }}>
          For Accelerators · SBDCs · MBDA · Supplier Diversity
        </div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>Advisor Console</h1>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".9rem", lineHeight: 1.6, marginTop: ".7rem", maxWidth: 660 }}>
          Manage every business you counsel in one place — match live bids to each client's NAICS codes and
          <strong style={{ color: "#fff" }}> prove your program's impact</strong> with an export-ready report.
        </p>
      </div>

      {error && <div style={{ background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, padding: ".8rem 1rem", marginBottom: "1rem", fontSize: ".85rem", color: "#FF8870" }}>{error}</div>}

      {/* Org identity */}
      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr auto", gap: ".9rem", alignItems: "end" }}>
          <div>
            <label style={label}>Organization name</label>
            <input style={input} value={org.org_name} onChange={e => setOrg({ ...org, org_name: e.target.value })} placeholder="e.g. Phoenix APEX Accelerator" />
          </div>
          <div>
            <label style={label}>Type</label>
            <select style={input} value={org.org_type} onChange={e => setOrg({ ...org, org_type: e.target.value })}>
              {ORG_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
          <button onClick={saveOrg} disabled={savingOrg}
            style={{ background: "#EC1C7B", color: "#fff", border: "none", padding: ".65rem 1.3rem", fontFamily: "'DM Mono', monospace", fontSize: ".66rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 8, fontWeight: 700, whiteSpace: "nowrap" }}>
            {savingOrg ? "Saving…" : org.is_advisor ? "✓ Save" : "Activate"}
          </button>
        </div>
      </div>

      {/* Impact tiles */}
      {impact && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.1rem" }}>
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: 0 }}>Program impact</h3>
            <button onClick={exportCsv} disabled={!clients.length}
              style={{ background: "rgba(31,182,238,.12)", color: "#1FB6EE", border: "1px solid rgba(31,182,238,.35)", padding: ".5rem 1rem", fontFamily: "'DM Mono', monospace", fontSize: ".62rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: clients.length ? "pointer" : "not-allowed", borderRadius: 6, fontWeight: 700, opacity: clients.length ? 1 : .5 }}>
              ⬇ Export report (CSV)
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: ".8rem" }}>
            {[
              { l: "Businesses served", v: impact.clients_served, c: "#fff" },
              { l: "Diverse-owned", v: `${impact.diverse_pct}%`, c: "#EC1C7B" },
              { l: "Bids submitted", v: impact.bids_submitted, c: "#1FB6EE" },
              { l: "Contracts won", v: impact.bids_won, c: "#1DB954" },
              { l: "$ Won", v: money(impact.dollars_won), c: "#F8C81C" },
            ].map(s => (
              <div key={s.l} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: "1rem .9rem" }}>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.3rem", fontWeight: 900, color: s.c, letterSpacing: "-.02em" }}>{s.v}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".56rem", letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,.45)", marginTop: ".35rem" }}>{s.l}</div>
              </div>
            ))}
          </div>
          {Object.keys(impact.cert_breakdown || {}).length > 0 && (
            <div style={{ marginTop: "1rem", display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
              {Object.entries(impact.cert_breakdown).map(([c, n]) => (
                <span key={c} style={{ background: "rgba(31,182,238,.1)", color: "#1FB6EE", border: "1px solid rgba(31,182,238,.2)", padding: ".2rem .6rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".06em" }}>{c} · {n}</span>
              ))}
              <span style={{ color: "rgba(255,255,255,.4)", fontFamily: "'DM Mono', monospace", fontSize: ".58rem", alignSelf: "center" }}>
                · win rate {impact.win_rate_pct}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Clients */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: 0 }}>
          Client businesses {clients.length > 0 && <span style={{ color: "rgba(255,255,255,.4)", fontWeight: 400 }}>({clients.length})</span>}
        </h3>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ background: showAdd ? "rgba(255,255,255,.06)" : "#EC1C7B", color: "#fff", border: showAdd ? "1px solid rgba(255,255,255,.2)" : "none", padding: ".55rem 1.1rem", fontFamily: "'DM Mono', monospace", fontSize: ".64rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, fontWeight: 600 }}>
          {showAdd ? "Cancel" : "+ Add business"}
        </button>
      </div>

      {/* Add client form */}
      {showAdd && (
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".9rem", marginBottom: ".9rem" }}>
            <div><label style={label}>Business name</label><input style={input} value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} placeholder="Client business name" /></div>
            <div><label style={label}>Contact email</label><input style={input} value={newClient.contact_email} onChange={e => setNewClient({ ...newClient, contact_email: e.target.value })} placeholder="owner@business.com" /></div>
            <div><label style={label}>NAICS codes (comma-separated)</label><input style={input} value={newClient.naics_codes} onChange={e => setNewClient({ ...newClient, naics_codes: e.target.value })} placeholder="541512, 624110" /></div>
            <div><label style={label}>Stage</label><select style={input} value={newClient.stage} onChange={e => setNewClient({ ...newClient, stage: e.target.value })}>{STAGES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <label style={label}>Certifications</label>
          <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            {CERTS.map(c => {
              const on = newClient.certifications.includes(c)
              return <button key={c} onClick={() => setNewClient(n => ({ ...n, certifications: on ? n.certifications.filter(x => x !== c) : [...n.certifications, c] }))}
                style={{ padding: ".3rem .8rem", border: `2px solid ${on ? "#1FB6EE" : "rgba(255,255,255,.15)"}`, background: on ? "rgba(31,182,238,.1)" : "none", color: on ? "#1FB6EE" : "rgba(255,255,255,.5)", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".08em", cursor: "pointer", borderRadius: 4 }}>{c}</button>
            })}
          </div>
          <button onClick={addClient} style={{ background: "#EC1C7B", color: "#fff", border: "none", padding: ".65rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".66rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 8, fontWeight: 700 }}>Add business</button>
        </div>
      )}

      {/* Empty state */}
      {clients.length === 0 && !showAdd && (
        <div style={{ textAlign: "center", padding: "3rem 2rem", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, color: "rgba(255,255,255,.5)" }}>
          <div style={{ fontSize: "2rem", marginBottom: ".75rem" }}>🏢</div>
          <div style={{ fontSize: ".92rem", color: "rgba(255,255,255,.7)", marginBottom: ".4rem" }}>No client businesses yet.</div>
          <div style={{ fontSize: ".82rem" }}>Add the businesses you counsel — FinesseWins tracks their bids and rolls up your program impact automatically.</div>
        </div>
      )}

      {/* Client cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
        {clients.map(c => {
          const m = matchesFor[c.id]
          return (
            <div key={c.id} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".3rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: ".95rem" }}>{c.name}</span>
                    <select value={c.stage} onChange={e => patchClient(c.id, { stage: e.target.value })}
                      style={{ background: `${STAGE_COLOR[c.stage]}22`, color: STAGE_COLOR[c.stage], border: `1px solid ${STAGE_COLOR[c.stage]}55`, borderRadius: 20, padding: ".15rem .6rem", fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", outline: "none" }}>
                      {STAGES.map(s => <option key={s} value={s} style={{ background: "#1a0f40" }}>{s}</option>)}
                    </select>
                    {(c.certifications || []).map(x => <span key={x} style={{ background: "rgba(236,28,123,.1)", color: "#EC1C7B", padding: ".1rem .45rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".54rem", letterSpacing: ".06em" }}>{x}</span>)}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", color: "rgba(255,255,255,.4)", letterSpacing: ".05em" }}>
                    {(c.naics_codes || []).length ? `NAICS ${(c.naics_codes || []).join(", ")}` : "No NAICS codes"} {c.contact_email ? `· ${c.contact_email}` : ""}
                  </div>
                </div>
                <button onClick={() => removeClient(c.id)} title="Remove"
                  style={{ background: "none", border: "1px solid rgba(255,255,255,.15)", color: "rgba(255,255,255,.4)", borderRadius: 6, padding: ".3rem .55rem", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".06em" }}>Remove</button>
              </div>

              {/* Outcome ledger + actions */}
              <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginTop: ".9rem", flexWrap: "wrap" }}>
                {[["Bids", "bids_submitted"], ["Won", "bids_won"]].map(([lbl, key]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".56rem", letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.4)" }}>{lbl}</span>
                    <input type="number" min="0" value={c[key] ?? 0} onChange={e => patchClient(c.id, { [key]: Math.max(0, parseInt(e.target.value || 0)) })} style={{ ...numInput, width: 52 }} />
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".56rem", letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.4)" }}>$ Won</span>
                  <input type="number" min="0" value={c.dollars_won ?? 0} onChange={e => patchClient(c.id, { dollars_won: Math.max(0, parseFloat(e.target.value || 0)) })} style={{ ...numInput, width: 92 }} />
                </div>
                <button onClick={() => findMatches(c.id)} disabled={!(c.naics_codes || []).length}
                  style={{ marginLeft: "auto", background: "rgba(31,182,238,.12)", color: "#1FB6EE", border: "1px solid rgba(31,182,238,.3)", padding: ".45rem 1rem", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".08em", textTransform: "uppercase", cursor: (c.naics_codes || []).length ? "pointer" : "not-allowed", borderRadius: 6, fontWeight: 600, opacity: (c.naics_codes || []).length ? 1 : .4 }}>
                  {m?.loading ? "Scanning…" : "🎯 Find live bids"}
                </button>
              </div>

              {/* Matches for this client */}
              {m && !m.loading && (
                <div style={{ marginTop: ".9rem", borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: ".8rem" }}>
                  {m.rows.length === 0 ? (
                    <div style={{ fontSize: ".8rem", color: "rgba(255,255,255,.4)" }}>No live matches right now for their codes.</div>
                  ) : (
                    <>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".56rem", letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: ".5rem" }}>{m.rows.length} live opportunit{m.rows.length === 1 ? "y" : "ies"} across all bid sites</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
                        {m.rows.slice(0, 6).map(r => (
                          <div key={r.opportunity_id} style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", fontSize: ".8rem" }}>
                            <span style={{ color: "rgba(255,255,255,.8)" }}>{r.title}</span>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".58rem", color: "#1FB6EE", whiteSpace: "nowrap" }}>
                              {r.source}{r.url ? " · " : ""}{r.url && <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,.45)", textDecoration: "none" }}>view ↗</a>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
