import { useState, useEffect } from "react"
import { apiFetch, apiDownload } from "../lib/api"

export default function ProposalView({ proposal, onNavigate }) {
  const [data, setData] = useState(proposal)
  const [activeVolume, setActiveVolume] = useState("technical")
  const [polling, setPolling] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  useEffect(() => {
    if (data?.status === "generating") {
      setPolling(true)
      const interval = setInterval(async () => {
        try {
          const res = await apiFetch(`/api/proposal/${data.proposal_id || data.id}`)
          const updated = await res.json()
          setData(prev => ({ ...prev, ...updated }))
          if (updated.status !== "generating") {
            clearInterval(interval)
            setPolling(false)
            if (updated.volumes) {
              const firstVol = Object.keys(updated.volumes)[0]
              if (firstVol) setActiveVolume(firstVol)
            }
          }
        } catch (e) {
          console.error(e)
        }
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [data?.status])

  if (!data) return (
    <div style={{ textAlign: "center", padding: "4rem", color: "rgba(255,255,255,.4)" }}>
      No proposal selected. <button onClick={() => onNavigate("dashboard")} style={{ color: "#EC1C7B", background: "none", border: "none", cursor: "pointer" }}>Back to Dashboard</button>
    </div>
  )

  const volumes = data.volumes || {}
  const volKeys = Object.keys(volumes)
  const currentContent = editMode ? editContent : (volumes[activeVolume] || "")

  const startEdit = () => {
    setEditContent(volumes[activeVolume] || "")
    setEditMode(true)
  }

  const saveEdit = () => {
    setData(d => ({ ...d, volumes: { ...d.volumes, [activeVolume]: editContent } }))
    setEditMode(false)
  }

  const exportDocx = async () => {
    const id = data.proposal_id || data.id
    if (!id) return
    setExporting(true)
    setExportError(null)
    try {
      const name = (data.solicitation_number || data.title || "proposal")
        .replace(/[^A-Za-z0-9._-]+/g, "_")
      await apiDownload(`/api/proposal/${id}/export`, `${name}.docx`)
    } catch (e) {
      setExportError(e.message)
    } finally {
      setExporting(false)
    }
  }

  const VOLUME_LABELS = {
    technical: "Technical Approach",
    past_performance: "Past Performance",
    pricing: "Pricing / Cost"
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <button onClick={() => onNavigate("dashboard")}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: ".62rem", letterSpacing: ".1em", marginBottom: ".75rem", padding: 0 }}>
            ← Back to Dashboard
          </button>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.5rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>
            {data.title || data.solicitation_title || "Proposal"}
          </h1>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", color: "rgba(255,255,255,.4)", marginTop: ".4rem", letterSpacing: ".08em" }}>
            {data.agency} · {data.solicitation_number}
          </div>
        </div>
        <div style={{ display: "flex", gap: ".75rem" }}>
          {volKeys.length > 0 && !editMode && (
            <>
              <button onClick={startEdit}
                style={{ background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.7)", border: "1px solid rgba(255,255,255,.15)", padding: ".55rem 1.1rem", fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", cursor: "pointer", borderRadius: 6 }}>
                Edit Volume
              </button>
              <button onClick={exportDocx} disabled={exporting || data.status !== "complete"}
                style={{ background: "#EC1C7B", color: "#fff", border: "none", padding: ".55rem 1.1rem", fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", cursor: exporting ? "wait" : "pointer", borderRadius: 6, fontWeight: 600, opacity: (exporting || data.status !== "complete") ? .6 : 1 }}>
                {exporting ? "Exporting…" : "Export DOCX →"}
              </button>
            </>
          )}
          {editMode && (
            <>
              <button onClick={() => setEditMode(false)}
                style={{ background: "none", color: "rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.2)", padding: ".55rem 1.1rem", fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", cursor: "pointer", borderRadius: 6 }}>
                Cancel
              </button>
              <button onClick={saveEdit}
                style={{ background: "#1DB954", color: "#fff", border: "none", padding: ".55rem 1.1rem", fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", cursor: "pointer", borderRadius: 6, fontWeight: 600 }}>
                Save Changes
              </button>
            </>
          )}
        </div>
      </div>

      {/* Generating state */}
      {data.status === "generating" && (
        <div style={{ background: "rgba(31,182,238,.06)", border: "1px solid rgba(31,182,238,.2)", borderRadius: 12, padding: "3rem", textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ display: "inline-block", width: 40, height: 40, border: "3px solid rgba(31,182,238,.2)", borderTopColor: "#1FB6EE", borderRadius: "50%", animation: "spin .8s linear infinite", marginBottom: "1rem" }} />
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.1rem", fontWeight: 700, marginBottom: ".5rem" }}>Generating Your Proposal</div>
          <div style={{ color: "rgba(255,255,255,.5)", fontSize: ".88rem" }}>Claude is analyzing the solicitation and writing your volumes. This takes 60–120 seconds...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Error state */}
      {data.status === "error" && (
        <div style={{ background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.5rem", color: "#FF8870" }}>
          <strong>Generation failed:</strong> {data.error}
        </div>
      )}


      {/* Plain English Summary */}
      {data.plain_english_summary && (
        <div style={{ background: "rgba(31,182,238,.06)", border: "1px solid rgba(31,182,238,.2)", borderRadius: 10, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "#1FB6EE", marginBottom: ".6rem" }}>
            📋 Plain English — What This Solicitation Actually Wants
          </div>
          <div style={{ fontSize: ".88rem", color: "rgba(255,255,255,.75)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {data.plain_english_summary}
          </div>
        </div>
      )}

      {/* Volume tabs + content */}
      {volKeys.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "1.5rem" }}>
          {/* Volume sidebar */}
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.3)", marginBottom: ".75rem" }}>Volumes</div>
            {volKeys.map(v => (
              <button key={v} onClick={() => { setActiveVolume(v); setEditMode(false) }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: ".65rem .9rem", border: "none", borderRadius: 8,
                  background: activeVolume === v ? "rgba(236,28,123,.12)" : "none",
                  borderLeft: `3px solid ${activeVolume === v ? "#EC1C7B" : "transparent"}`,
                  color: activeVolume === v ? "#fff" : "rgba(255,255,255,.5)",
                  fontFamily: "'Space Grotesk', sans-serif", fontSize: ".82rem",
                  fontWeight: activeVolume === v ? 600 : 400, cursor: "pointer",
                  marginBottom: ".25rem", transition: "all .15s"
                }}>
                {VOLUME_LABELS[v] || v}
                {data.word_counts?.[v] && (
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".58rem", color: "rgba(255,255,255,.3)", marginTop: ".2rem" }}>
                    {data.word_counts[v].toLocaleString()} words
                  </div>
                )}
              </button>
            ))}

            {/* Review notes */}
            {(data.review || data.review_notes) && (() => {
              const raw = data.review ?? data.review_notes
              let r = raw
              if (typeof raw === "string") { try { r = JSON.parse(raw) } catch { r = null } }
              const line = r && typeof r === "object"
                ? `Score: ${r.overall_score ?? "—"}/10 — ${r.strengths?.[0] || "Review complete"}`
                : (typeof raw === "string" ? raw.slice(0, 150) : "Review complete")
              return (
                <div style={{ marginTop: "1.5rem", padding: ".9rem", background: "rgba(29,185,84,.06)", border: "1px solid rgba(29,185,84,.2)", borderRadius: 8 }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".1em", color: "#1DB954", marginBottom: ".5rem" }}>AI REVIEW</div>
                  <div style={{ fontSize: ".78rem", color: "rgba(255,255,255,.6)", lineHeight: 1.5 }}>{line}</div>
                </div>
              )
            })()}

            {exportError && (
              <div style={{ marginTop: "1rem", padding: ".7rem .9rem", background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, fontSize: ".75rem", color: "#FF8870" }}>
                Export failed: {exportError}
              </div>
            )}
          </div>

          {/* Content area */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem" }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700 }}>
                {VOLUME_LABELS[activeVolume] || activeVolume}
              </div>
            </div>

            {editMode ? (
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                style={{
                  width: "100%", minHeight: 600, background: "rgba(255,255,255,.04)",
                  border: "2px solid #EC1C7B", color: "#fff", padding: "1.5rem",
                  fontFamily: "'Space Grotesk', sans-serif", fontSize: ".9rem",
                  lineHeight: 1.8, borderRadius: 8, outline: "none", resize: "vertical",
                  boxSizing: "border-box"
                }}
              />
            ) : (
              <div style={{
                background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 8, padding: "2rem",
                fontFamily: "'Space Grotesk', sans-serif", fontSize: ".9rem",
                lineHeight: 1.9, color: "rgba(255,255,255,.85)",
                whiteSpace: "pre-wrap", minHeight: 400
              }}>
                {currentContent || (
                  <span style={{ color: "rgba(255,255,255,.25)", fontStyle: "italic" }}>
                    This volume was not requested or is still generating...
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state for no volumes yet */}
      {volKeys.length === 0 && data.status !== "generating" && data.status !== "error" && (
        <div style={{ textAlign: "center", padding: "3rem", color: "rgba(255,255,255,.3)", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12 }}>
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>📋</div>
          <div style={{ fontSize: ".9rem" }}>No volumes generated yet.</div>
          <button onClick={() => onNavigate("new-proposal")}
            style={{ marginTop: "1rem", background: "#EC1C7B", color: "#fff", border: "none", padding: ".6rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".68rem", letterSpacing: ".1em", cursor: "pointer", borderRadius: 6 }}>
            Generate New Proposal →
          </button>
        </div>
      )}
    </div>
  )
}
