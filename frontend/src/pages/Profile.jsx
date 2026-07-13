import { useState, useEffect } from "react"
import { apiJson } from "../lib/api"

// A blank profile — new users start empty (no other company's data leaks in).
const EMPTY_PROFILE = {
  name: "", uei: "", cage: "", ein: "",
  address: "", phone: "", email: "", website: "",
  state: "", capabilities: "",
  certifications: [], naics_codes: [], past_performance: [],
}

// Certifications a first-time bidder can claim. Selecting them powers set-aside
// matching and is woven into every generated proposal.
const CERT_OPTIONS = ["WOSB", "EDWOSB", "MBE", "DBE", "8A", "HUBZone", "SDVOSB", "VOSB", "SDB", "Black-Owned"]

export default function Profile({ onNavigate }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [newNaics, setNewNaics] = useState("")

  // Load the saved profile for the signed-in user; blank if they have none yet.
  useEffect(() => {
    let alive = true
    apiJson("/api/profile")
      .then(({ profile: p }) => { if (alive && p && Object.keys(p).length) setProfile({ ...EMPTY_PROFILE, ...p }) })
      .catch(() => {}) // no profile yet / auth disabled — keep it blank
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const update = (key, val) => setProfile(p => ({ ...p, [key]: val }))

  const toggleCert = (c) => setProfile(p => ({
    ...p,
    certifications: p.certifications.includes(c)
      ? p.certifications.filter(x => x !== c)
      : [...p.certifications, c],
  }))

  const addNaics = () => {
    const c = newNaics.trim()
    if (!/^\d{2,6}$/.test(c)) { setError("Enter a valid NAICS code (2–6 digits)."); return }
    setError(null)
    setProfile(p => p.naics_codes.includes(c) ? p : { ...p, naics_codes: [...p.naics_codes, c] })
    setNewNaics("")
  }
  const removeNaics = (c) => setProfile(p => ({ ...p, naics_codes: p.naics_codes.filter(x => x !== c) }))

  const addPP = () => setProfile(p => ({
    ...p,
    past_performance: [...p.past_performance, { title: "", agency: "", value: "", naics: "", description: "" }],
  }))
  const updatePP = (i, key, val) => setProfile(p => ({
    ...p,
    past_performance: p.past_performance.map((pp, idx) => idx === i ? { ...pp, [key]: val } : pp),
  }))
  const removePP = (i) => setProfile(p => ({
    ...p,
    past_performance: p.past_performance.filter((_, idx) => idx !== i),
  }))

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const { certifications, naics_codes, past_performance, name, uei, cage, ein,
              capabilities, state, address, phone, email, website } = profile
      await apiJson("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: name || "", uei, cage, ein,
          certifications: certifications || [], naics_codes: naics_codes || [],
          capabilities: capabilities || "", past_performance: past_performance || [],
          state: state || "", address, phone, email, website,
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: "100%", background: "rgba(255,255,255,.05)",
    border: "2px solid rgba(255,255,255,.12)", color: "#fff",
    padding: ".75rem 1rem", fontFamily: "'Space Grotesk', sans-serif",
    fontSize: ".9rem", outline: "none", borderRadius: 6, boxSizing: "border-box"
  }
  const labelStyle = {
    display: "block", fontFamily: "'DM Mono', monospace",
    fontSize: ".62rem", letterSpacing: ".1em", textTransform: "uppercase",
    color: "rgba(255,255,255,.5)", marginBottom: ".4rem"
  }

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: "rgba(255,255,255,.4)", fontFamily: "'DM Mono', monospace", fontSize: ".8rem" }}>Loading your profile…</div>
  )

  const fields = [
    ["name", "Company Name", "Your legal business name"],
    ["uei", "SAM.gov UEI", "12-character UEI"],
    ["cage", "CAGE Code", "5-character CAGE"],
    ["ein", "EIN", "Tax ID"],
    ["phone", "Phone", "Best contact number"],
    ["email", "Email", "Contact email"],
  ]

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }}>Settings</div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>Company Profile</h1>
        </div>
        <button onClick={save} disabled={saving}
          style={{ background: saved ? "#1DB954" : "#EC1C7B", color: "#fff", border: "none", padding: ".6rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".68rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: saving ? "wait" : "pointer", borderRadius: 6, fontWeight: 600, transition: "background .2s", opacity: saving ? .7 : 1 }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Profile"}
        </button>
      </div>
      {error && (
        <div style={{ background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, padding: ".7rem .9rem", marginBottom: "1.5rem", fontSize: ".82rem", color: "#FF8870" }}>
          {error}
        </div>
      )}

      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "2rem", marginBottom: "1.5rem" }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".95rem", fontWeight: 700, margin: "0 0 1.5rem", color: "rgba(255,255,255,.7)" }}>Registration Details</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {fields.map(([key, lbl, ph]) => (
            <div key={key}>
              <label style={labelStyle}>{lbl}</label>
              <input style={inputStyle} value={profile[key] || ""} placeholder={ph}
                onChange={e => update(key, e.target.value)} />
            </div>
          ))}
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Address</label>
            <input style={inputStyle} value={profile.address || ""} placeholder="Street, City, State ZIP"
              onChange={e => update("address", e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "2rem", marginBottom: "1.5rem" }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".95rem", fontWeight: 700, margin: "0 0 .3rem", color: "rgba(255,255,255,.7)" }}>Certifications</h3>
        <p style={{ fontSize: ".82rem", color: "rgba(255,255,255,.4)", margin: "0 0 1rem" }}>
          Tap the certifications you hold. These auto-match set-aside opportunities and are woven into every proposal.
        </p>
        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
          {CERT_OPTIONS.map(c => {
            const on = profile.certifications.includes(c)
            return (
              <button key={c} onClick={() => toggleCert(c)}
                style={{ background: on ? "rgba(31,182,238,.15)" : "none", color: on ? "#1FB6EE" : "rgba(255,255,255,.5)", border: `1px solid ${on ? "rgba(31,182,238,.5)" : "rgba(255,255,255,.15)"}`, padding: ".35rem .9rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".08em", cursor: "pointer" }}>
                {on ? "✓ " : ""}{c}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "2rem", marginBottom: "1.5rem" }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".95rem", fontWeight: 700, margin: "0 0 .3rem", color: "rgba(255,255,255,.7)" }}>Your NAICS Codes</h3>
        <p style={{ fontSize: ".82rem", color: "rgba(255,255,255,.4)", margin: "0 0 1rem" }}>
          The industry codes for the work you do — used to match and score opportunities.
        </p>
        {profile.naics_codes.length > 0 && (
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: ".9rem" }}>
            {profile.naics_codes.map(c => (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: ".45rem", background: "rgba(236,28,123,.1)", border: "1px solid rgba(236,28,123,.3)", color: "#fff", padding: ".35rem .5rem .35rem .8rem", borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: ".72rem" }}>
                <span style={{ color: "#EC1C7B", fontWeight: 600 }}>{c}</span>
                <button onClick={() => removeNaics(c)} title="Remove" style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "0 .15rem" }}>×</button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: ".6rem" }}>
          <input style={{ ...inputStyle, maxWidth: 220 }} value={newNaics}
            onChange={e => setNewNaics(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addNaics()}
            placeholder="Add a NAICS code" />
          <button onClick={addNaics}
            style={{ background: "rgba(236,28,123,.15)", color: "#EC1C7B", border: "1px solid rgba(236,28,123,.3)", padding: ".7rem 1.1rem", fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, fontWeight: 600 }}>
            + Add
          </button>
          <button onClick={() => onNavigate("alerts")}
            style={{ background: "none", color: "rgba(255,255,255,.45)", border: "1px solid rgba(255,255,255,.15)", padding: ".7rem 1rem", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".06em", cursor: "pointer", borderRadius: 6 }}>
            Search by trade →
          </button>
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "2rem", marginBottom: "1.5rem" }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".95rem", fontWeight: 700, margin: "0 0 1rem", color: "rgba(255,255,255,.7)" }}>Core Capabilities</h3>
        <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
          value={profile.capabilities || ""}
          placeholder="Describe what your company does — services, expertise, differentiators. This shapes every proposal."
          onChange={e => update("capabilities", e.target.value)} />
      </div>

      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "2rem" }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".95rem", fontWeight: 700, margin: "0 0 .3rem", color: "rgba(255,255,255,.7)" }}>Past Performance</h3>
        <p style={{ fontSize: ".82rem", color: "rgba(255,255,255,.4)", margin: "0 0 1rem" }}>
          Optional — add prior projects if you have them. No government past performance yet? That's fine; FinesseWins writes proposals in <strong style={{ color: "rgba(255,255,255,.6)" }}>zero-past-performance mode</strong>.
        </p>
        {profile.past_performance.map((pp, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 8, padding: "1rem", marginBottom: ".75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".6rem", marginBottom: ".6rem" }}>
              <input style={inputStyle} value={pp.title} placeholder="Project title" onChange={e => updatePP(i, "title", e.target.value)} />
              <input style={inputStyle} value={pp.agency} placeholder="Client / agency" onChange={e => updatePP(i, "agency", e.target.value)} />
              <input style={inputStyle} value={pp.value} placeholder="Contract value (e.g. $85,000)" onChange={e => updatePP(i, "value", e.target.value)} />
              <input style={inputStyle} value={pp.naics} placeholder="NAICS (optional)" onChange={e => updatePP(i, "naics", e.target.value)} />
            </div>
            <textarea style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} value={pp.description} placeholder="What you delivered and the outcome." onChange={e => updatePP(i, "description", e.target.value)} />
            <button onClick={() => removePP(i)}
              style={{ background: "none", color: "rgba(255,100,80,.7)", border: "none", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".08em", cursor: "pointer", marginTop: ".5rem", padding: 0 }}>
              Remove
            </button>
          </div>
        ))}
        <button onClick={addPP}
          style={{ background: "none", color: "rgba(255,255,255,.4)", border: "1px dashed rgba(255,255,255,.2)", padding: ".6rem 1.25rem", fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", cursor: "pointer", borderRadius: 6, width: "100%", marginTop: ".25rem" }}>
          + Add Past Performance Reference
        </button>
      </div>
    </div>
  )
}
