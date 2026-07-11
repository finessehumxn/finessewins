import { useState, useEffect } from "react"
import { apiJson } from "../lib/api"

const DEFAULT = {
  name: "Millennials Creatives LLC",
  uei: "WBGAAWMD3YE5",
  cage: "18ZQ0",
  ein: "84-3960409",
  address: "3104 E Camelback Rd, Phoenix, AZ 85016",
  phone: "602-800-0660",
  email: "contact@millennialscreatives.com",
  website: "millennialscreatives.com",
  certifications: ["WOSB", "MBE", "DBE"],
  naics_codes: ["541512", "541511", "541519", "611430", "624110"],
  capabilities: "AI engineering, brand strategy, healthcare consulting, government contracting, web and mobile development, custom software systems, training and development, public health consulting.",
  past_performance: [
    { title: "Finesse Our Minds Platform", agency: "Finesse Our Minds (Nonprofit)", value: "$85,000", naics: "541511", description: "Full-stack mental health platform build and maintenance for a global nonprofit serving 8+ countries." },
    { title: "Website and Brand Identity", agency: "Changing Minds Psychiatry", value: "Available upon request", naics: "541512", description: "Complete brand identity and web presence for multi-state psychiatric practice with locations in AZ, NV, and LA." },
  ]
}

export default function Profile({ onNavigate }) {
  const [profile, setProfile] = useState(DEFAULT)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Load the saved profile for the signed-in user (falls back to DEFAULT).
  useEffect(() => {
    let alive = true
    apiJson("/api/profile")
      .then(({ profile: p }) => { if (alive && p) setProfile(prev => ({ ...prev, ...p })) })
      .catch(() => {}) // no profile yet / auth disabled — keep DEFAULT
    return () => { alive = false }
  }, [])

  const update = (key, val) => setProfile(p => ({ ...p, [key]: val }))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const { certifications, naics_codes, past_performance, name, uei, cage, ein,
              capabilities, state, address, phone, email, website } = profile
      await apiJson("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: name || "", uei, cage, ein,
          certifications: certifications || [], naics_codes: naics_codes || [],
          capabilities: capabilities || "", past_performance: past_performance || [],
          state: state || "AZ", address, phone, email, website,
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
          Couldn’t save: {error}
        </div>
      )}

      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "2rem", marginBottom: "1.5rem" }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".95rem", fontWeight: 700, margin: "0 0 1.5rem", color: "rgba(255,255,255,.7)" }}>Registration Details</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {[
            ["company_name" in profile ? "company_name" : "name", "Company Name", profile.name],
            ["uei", "SAM.gov UEI", profile.uei],
            ["cage", "CAGE Code", profile.cage],
            ["ein", "EIN", profile.ein],
            ["phone", "Phone", profile.phone],
            ["email", "Email", profile.email],
          ].map(([key, lbl, val]) => (
            <div key={key}>
              <label style={labelStyle}>{lbl}</label>
              <input style={inputStyle} value={val}
                onChange={e => update(key === "company_name" ? "name" : key, e.target.value)} />
            </div>
          ))}
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Address</label>
            <input style={inputStyle} value={profile.address}
              onChange={e => update("address", e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "2rem", marginBottom: "1.5rem" }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".95rem", fontWeight: 700, margin: "0 0 .75rem", color: "rgba(255,255,255,.7)" }}>Active Certifications</h3>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: ".75rem" }}>
          {profile.certifications.map(c => (
            <span key={c} style={{ background: "rgba(31,182,238,.1)", color: "#1FB6EE", border: "1px solid rgba(31,182,238,.25)", padding: ".35rem .9rem", borderRadius: 20, fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".08em" }}>
              ✓ {c}
            </span>
          ))}
        </div>
        <p style={{ fontSize: ".82rem", color: "rgba(255,255,255,.4)", margin: 0 }}>
          Certifications are used to automatically match WOSB, MBE, and set-aside opportunities and are included in all generated proposals.
        </p>
      </div>

      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "2rem", marginBottom: "1.5rem" }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".95rem", fontWeight: 700, margin: "0 0 1rem", color: "rgba(255,255,255,.7)" }}>Core Capabilities</h3>
        <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
          value={profile.capabilities}
          onChange={e => update("capabilities", e.target.value)} />
      </div>

      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "2rem" }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".95rem", fontWeight: 700, margin: "0 0 1rem", color: "rgba(255,255,255,.7)" }}>Past Performance</h3>
        {profile.past_performance.map((pp, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 8, padding: "1rem", marginBottom: ".75rem" }}>
            <div style={{ fontWeight: 600, fontSize: ".88rem", marginBottom: ".3rem" }}>{pp.title}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".62rem", color: "rgba(255,255,255,.4)", marginBottom: ".4rem" }}>{pp.agency} · NAICS {pp.naics} · {pp.value}</div>
            <div style={{ fontSize: ".83rem", color: "rgba(255,255,255,.6)" }}>{pp.description}</div>
          </div>
        ))}
        <button
          style={{ background: "none", color: "rgba(255,255,255,.4)", border: "1px dashed rgba(255,255,255,.2)", padding: ".6rem 1.25rem", fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", cursor: "pointer", borderRadius: 6, width: "100%", marginTop: ".25rem" }}>
          + Add Past Performance Reference
        </button>
      </div>
    </div>
  )
}
