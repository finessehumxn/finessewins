import { useState } from "react"
import { apiJson } from "../lib/api"

const VOLUMES = [
  { id: "technical", label: "Technical Approach", desc: "Methodology, timeline, management" },
  { id: "past_performance", label: "Past Performance", desc: "Prior relevant experience" },
  { id: "pricing", label: "Price/Cost", desc: "Labor rates, basis of estimate" },
]

const CERTIFICATIONS = ["WOSB", "MBE", "DBE", "Black-Owned", "8a", "HUBZone", "SDVOSB", "EDWOSB"]

export default function NewProposal({ onNavigate }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    solicitation_number: "",
    solicitation_title: "",
    agency: "",
    requirements: "",
    deadline: "",
    naics_code: "541512",
    set_aside: "",
    volumes: ["technical", "past_performance", "pricing"],
    // Company (pre-filled from MC)
    company_name: "Millennials Creatives LLC",
    uei: "WBGAAWMD3YE5",
    cage: "18ZQ0",
    ein: "84-3960409",
    certifications: ["WOSB", "MBE", "DBE", "Black-Owned"],
    capabilities: "AI engineering, brand strategy, healthcare consulting, government contracting, web development, custom software, training and development.",
    past_performance: [],
  })

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleVolume = (vol) => {
    setForm(f => ({
      ...f,
      volumes: f.volumes.includes(vol) ? f.volumes.filter(v => v !== vol) : [...f.volumes, vol]
    }))
  }

  const toggleCert = (cert) => {
    setForm(f => ({
      ...f,
      certifications: f.certifications.includes(cert)
        ? f.certifications.filter(c => c !== cert)
        : [...f.certifications, cert]
    }))
  }

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = {
        solicitation_number: form.solicitation_number,
        solicitation_title: form.solicitation_title,
        agency: form.agency,
        requirements: form.requirements,
        deadline: form.deadline,
        naics_code: form.naics_code,
        set_aside: form.set_aside || null,
        volumes_requested: form.volumes,
        company_profile: {
          name: form.company_name,
          uei: form.uei,
          cage: form.cage,
          ein: form.ein,
          certifications: form.certifications,
          naics_codes: [form.naics_code, "541511", "541519"],
          capabilities: form.capabilities,
          past_performance: form.past_performance,
          state: "AZ",
        }
      }

      const data = await apiJson("/api/proposal/generate", {
        method: "POST",
        body: JSON.stringify(payload)
      })

      if (data.proposal_id) {
        onNavigate("proposal", {
          ...data,
          title: form.solicitation_title,
          agency: form.agency,
          solicitation_number: form.solicitation_number,
        })
      } else {
        setError("Failed to start generation. Check your API connection.")
      }
    } catch (e) {
      const msg = e.message || "Something went wrong."
      const connIssue = /failed to fetch|networkerror|load failed/i.test(msg)
      setError(connIssue
        ? `${msg}. Make sure the FinesseWins backend is running on port 8000.`
        : msg)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: "100%", background: "rgba(255,255,255,.05)",
    border: "2px solid rgba(255,255,255,.12)", color: "#fff",
    padding: ".75rem 1rem", fontFamily: "'Space Grotesk', sans-serif",
    fontSize: ".9rem", outline: "none", borderRadius: 6, boxSizing: "border-box",
    transition: "border-color .15s"
  }
  const labelStyle = {
    display: "block", fontFamily: "'DM Mono', monospace",
    fontSize: ".62rem", letterSpacing: ".1em", textTransform: "uppercase",
    color: "rgba(255,255,255,.5)", marginBottom: ".4rem"
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }}>
          AI Proposal Generator
        </div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>
          New Proposal
        </h1>
      </div>

      {/* Step indicators */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
        {[1, 2, 3].map(s => (
          <div key={s} onClick={() => s < step && setStep(s)}
            style={{
              display: "flex", alignItems: "center", gap: ".5rem",
              cursor: s < step ? "pointer" : "default"
            }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: step === s ? "#EC1C7B" : step > s ? "rgba(29,185,84,.3)" : "rgba(255,255,255,.1)",
              border: `2px solid ${step === s ? "#EC1C7B" : step > s ? "#1DB954" : "rgba(255,255,255,.2)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'DM Mono', monospace", fontSize: ".7rem", fontWeight: 600,
              color: step > s ? "#1DB954" : "#fff"
            }}>
              {step > s ? "✓" : s}
            </div>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".82rem", color: step >= s ? "#fff" : "rgba(255,255,255,.3)" }}>
              {s === 1 ? "Solicitation" : s === 2 ? "Company" : "Generate"}
            </span>
            {s < 3 && <span style={{ color: "rgba(255,255,255,.2)", marginLeft: ".25rem" }}>→</span>}
          </div>
        ))}
      </div>

      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "2rem" }}>

        {/* STEP 1: Solicitation */}
        {step === 1 && (
          <div>
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 1.5rem" }}>Solicitation Details</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label style={labelStyle}>Solicitation Number</label>
                <input style={inputStyle} value={form.solicitation_number}
                  onChange={e => update("solicitation_number", e.target.value)}
                  placeholder="e.g. BPM007574 or 90MC0026R0004" />
              </div>
              <div>
                <label style={labelStyle}>Agency</label>
                <input style={inputStyle} value={form.agency}
                  onChange={e => update("agency", e.target.value)}
                  placeholder="e.g. AZ Dept of Child Safety" />
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>Solicitation Title</label>
              <input style={inputStyle} value={form.solicitation_title}
                onChange={e => update("solicitation_title", e.target.value)}
                placeholder="Full title of the solicitation" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label style={labelStyle}>NAICS Code</label>
                <input style={inputStyle} value={form.naics_code}
                  onChange={e => update("naics_code", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Set-Aside</label>
                <select style={{ ...inputStyle }}
                  value={form.set_aside} onChange={e => update("set_aside", e.target.value)}>
                  <option value="">None / Full & Open</option>
                  <option value="WOSB">WOSB</option>
                  <option value="SBA">Small Business</option>
                  <option value="8A">8(a)</option>
                  <option value="HUBZone">HUBZone</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Deadline</label>
                <input style={inputStyle} type="date" value={form.deadline}
                  onChange={e => update("deadline", e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>Requirements / Statement of Work</label>
              <textarea style={{ ...inputStyle, minHeight: 160, resize: "vertical" }}
                value={form.requirements}
                onChange={e => update("requirements", e.target.value)}
                placeholder="Paste the full requirements, SOW, or description from the solicitation..." />
            </div>

            {/* Volume selection */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ ...labelStyle, display: "block", marginBottom: ".75rem" }}>Volumes to Generate</label>
              <div style={{ display: "flex", gap: ".75rem" }}>
                {VOLUMES.map(v => (
                  <div key={v.id} onClick={() => toggleVolume(v.id)}
                    style={{
                      flex: 1, padding: "1rem", borderRadius: 8, cursor: "pointer",
                      border: `2px solid ${form.volumes.includes(v.id) ? "#EC1C7B" : "rgba(255,255,255,.12)"}`,
                      background: form.volumes.includes(v.id) ? "rgba(236,28,123,.08)" : "none",
                      transition: "all .15s"
                    }}>
                    <div style={{ fontWeight: 600, fontSize: ".85rem", marginBottom: ".25rem" }}>{v.label}</div>
                    <div style={{ fontSize: ".75rem", color: "rgba(255,255,255,.5)" }}>{v.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setStep(2)}
              disabled={!form.solicitation_number || !form.requirements}
              style={{
                background: "#EC1C7B", color: "#fff", border: "none",
                padding: ".75rem 2rem", fontFamily: "'DM Mono', monospace",
                fontSize: ".72rem", letterSpacing: ".12em", textTransform: "uppercase",
                cursor: "pointer", borderRadius: 6, fontWeight: 600,
                opacity: (!form.solicitation_number || !form.requirements) ? .5 : 1
              }}>
              Next: Company Info →
            </button>
          </div>
        )}

        {/* STEP 2: Company */}
        {step === 2 && (
          <div>
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 1.5rem" }}>Company Profile</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label style={labelStyle}>Company Name</label>
                <input style={inputStyle} value={form.company_name} onChange={e => update("company_name", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>UEI</label>
                <input style={inputStyle} value={form.uei} onChange={e => update("uei", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>CAGE Code</label>
                <input style={inputStyle} value={form.cage} onChange={e => update("cage", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>EIN</label>
                <input style={inputStyle} value={form.ein} onChange={e => update("ein", e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ ...labelStyle, display: "block", marginBottom: ".5rem" }}>Certifications</label>
              <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                {CERTIFICATIONS.map(c => (
                  <button key={c} onClick={() => toggleCert(c)}
                    style={{
                      padding: ".35rem .9rem", border: `2px solid ${form.certifications.includes(c) ? "#1FB6EE" : "rgba(255,255,255,.15)"}`,
                      background: form.certifications.includes(c) ? "rgba(31,182,238,.1)" : "none",
                      color: form.certifications.includes(c) ? "#1FB6EE" : "rgba(255,255,255,.5)",
                      fontFamily: "'DM Mono', monospace", fontSize: ".62rem",
                      letterSpacing: ".1em", cursor: "pointer", borderRadius: 4
                    }}>{c}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>Core Capabilities</label>
              <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
                value={form.capabilities}
                onChange={e => update("capabilities", e.target.value)} />
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              <button onClick={() => setStep(1)}
                style={{ background: "none", color: "rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.2)", padding: ".75rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".7rem", letterSpacing: ".1em", cursor: "pointer", borderRadius: 6 }}>
                ← Back
              </button>
              <button onClick={() => setStep(3)}
                style={{ background: "#EC1C7B", color: "#fff", border: "none", padding: ".75rem 2rem", fontFamily: "'DM Mono', monospace", fontSize: ".72rem", letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, fontWeight: 600 }}>
                Next: Review & Generate →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Generate */}
        {step === 3 && (
          <div>
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 1.5rem" }}>Ready to Generate</h3>

            {/* Summary */}
            <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "1.25rem", marginBottom: "1.5rem" }}>
              {[
                ["Solicitation", form.solicitation_number],
                ["Title", form.solicitation_title],
                ["Agency", form.agency],
                ["NAICS", form.naics_code],
                ["Set-Aside", form.set_aside || "None / Full & Open"],
                ["Deadline", form.deadline],
                ["Volumes", form.volumes.join(", ")],
                ["Company", form.company_name],
                ["Certifications", form.certifications.join(", ")],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: "1rem", padding: ".3rem 0", borderBottom: "1px solid rgba(255,255,255,.04)", fontSize: ".85rem" }}>
                  <span style={{ color: "rgba(255,255,255,.4)", minWidth: 120, fontFamily: "'DM Mono', monospace", fontSize: ".62rem", letterSpacing: ".06em", alignSelf: "center" }}>{k}</span>
                  <span style={{ color: "rgba(255,255,255,.85)" }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(31,182,238,.06)", border: "1px solid rgba(31,182,238,.2)", borderRadius: 8, padding: "1rem", marginBottom: "1.5rem", fontSize: ".83rem", color: "rgba(255,255,255,.7)", lineHeight: 1.6 }}>
              <strong style={{ color: "#1FB6EE" }}>What happens next:</strong> Claude will analyze the solicitation, identify your win themes, and write all {form.volumes.length} volume{form.volumes.length > 1 ? "s" : ""} of your proposal. This takes 60–120 seconds. You can edit every section after generation.
            </div>

            {error && (
              <div style={{ background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, padding: "1rem", marginBottom: "1rem", fontSize: ".83rem", color: "#FF8870" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "1rem" }}>
              <button onClick={() => setStep(2)}
                style={{ background: "none", color: "rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.2)", padding: ".75rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".7rem", letterSpacing: ".1em", cursor: "pointer", borderRadius: 6 }}>
                ← Back
              </button>
              <button onClick={generate} disabled={loading}
                style={{
                  background: loading ? "rgba(236,28,123,.5)" : "#EC1C7B", color: "#fff", border: "none",
                  padding: ".75rem 2.5rem", fontFamily: "'DM Mono', monospace",
                  fontSize: ".75rem", letterSpacing: ".12em", textTransform: "uppercase",
                  cursor: loading ? "not-allowed" : "pointer", borderRadius: 6, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: ".75rem"
                }}>
                {loading ? (
                  <>
                    <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                    Generating Proposal...
                  </>
                ) : "Generate Proposal with AI →"}
              </button>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}
      </div>
    </div>
  )
}
