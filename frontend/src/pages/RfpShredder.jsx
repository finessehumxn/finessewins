import { useState, useEffect, useRef } from "react"
import { apiUpload, apiJson, apiDownloadPost } from "../lib/api"

const STATUS = {
  addressed: { label: "Addressed", color: "#1DB954", bg: "rgba(29,185,84,.12)", bd: "rgba(29,185,84,.35)" },
  partial:   { label: "Partial",   color: "#F8C81C", bg: "rgba(248,200,28,.12)", bd: "rgba(248,200,28,.35)" },
  missing:   { label: "Missing",   color: "#FF6432", bg: "rgba(255,100,50,.12)", bd: "rgba(255,100,50,.35)" },
}
const SECTION_TINT = { L: "#1FB6EE", M: "#EC1C7B", SOW: "#F8C81C", submission: "#1FB6EE", eligibility: "#B98BFF", other: "rgba(255,255,255,.4)" }

const card = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.25rem" }
const eyebrow = { fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }
const btn = (bg, fg, bd) => ({ background: bg, color: fg, border: `1px solid ${bd || bg}`, padding: ".6rem 1.2rem", fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap" })

function Drop({ label, hint, multiple, accept, onFiles, disabled }) {
  const ref = useRef()
  const [over, setOver] = useState(false)
  return (
    <div
      onClick={() => !disabled && ref.current?.click()}
      onDragOver={e => { e.preventDefault(); !disabled && setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (!disabled) onFiles([...e.dataTransfer.files]) }}
      style={{ border: `2px dashed ${over ? "#EC1C7B" : "rgba(255,255,255,.18)"}`, background: over ? "rgba(236,28,123,.06)" : "rgba(255,255,255,.02)", borderRadius: 12, padding: "1.6rem", textAlign: "center", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, transition: ".15s" }}>
      <input ref={ref} type="file" hidden multiple={multiple} accept={accept}
        onChange={e => { onFiles([...e.target.files]); e.target.value = "" }} />
      <div style={{ fontSize: ".92rem", fontWeight: 600, marginBottom: ".25rem" }}>{label}</div>
      <div style={{ fontSize: ".78rem", color: "rgba(255,255,255,.4)" }}>{hint}</div>
    </div>
  )
}

export default function RfpShredder() {
  const [profile, setProfile] = useState(null)
  // step 1: shred
  const [rfp, setRfp] = useState(null)          // {filename, words, pages}
  const [shredData, setShredData] = useState(null)  // {summary, key_dates, submission, requirements}
  const [shredding, setShredding] = useState(false)
  // step 2: analyze
  const [docs, setDocs] = useState([])          // [{name, text, words}]
  const [analysis, setAnalysis] = useState(null) // {matrix, coverage_pct, counts}
  const [analyzing, setAnalyzing] = useState(false)
  // step 3: strengthen
  const [strong, setStrong] = useState({})       // reqId -> {rewritten, rationale, warnings}
  const [busyReq, setBusyReq] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { apiJson("/api/profile").then(({ profile: p }) => setProfile(p || null)).catch(() => {}) }, [])

  const requirements = shredData?.requirements || []
  const matrixById = Object.fromEntries((analysis?.matrix || []).map(m => [m.id, m]))
  const allDocText = docs.map(d => `### ${d.name}\n${d.text}`).join("\n\n")

  async function doShred(files) {
    const f = files[0]; if (!f) return
    setError(null); setShredding(true); setShredData(null); setAnalysis(null); setStrong({})
    try {
      const fd = new FormData()
      fd.append("file", f)
      fd.append("title", f.name.replace(/\.[^.]+$/, ""))
      const res = await apiUpload("/api/rfp/shred", fd)
      setRfp(res.rfp)
      setShredData(res)
    } catch (e) { setError(e.message) } finally { setShredding(false) }
  }

  async function doAnalyze(files) {
    if (!files.length) return
    if (!requirements.length) { setError("Shred the RFP first."); return }
    setError(null); setAnalyzing(true)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append("files", f))
      fd.append("requirements", JSON.stringify(requirements))
      const res = await apiUpload("/api/rfp/analyze", fd)
      setDocs(res.docs || [])
      setAnalysis({ matrix: res.matrix, coverage_pct: res.coverage_pct, counts: res.counts })
    } catch (e) { setError(e.message) } finally { setAnalyzing(false) }
  }

  async function doStrengthen(req) {
    setError(null); setBusyReq(req.id)
    try {
      const m = matrixById[req.id]
      // prefer the doc the matrix pointed to; else all docs
      const focused = m?.doc ? (docs.find(d => d.name === m.doc)?.text || allDocText) : allDocText
      const res = await apiJson("/api/rfp/strengthen", {
        method: "POST",
        body: JSON.stringify({
          requirement: req,
          user_content: focused,
          company_profile: profile || null,
          solicitation_vocab: req.source || "",
        }),
      })
      setStrong(s => ({ ...s, [req.id]: res }))
    } catch (e) { setError(e.message) } finally { setBusyReq(null) }
  }

  async function exportMatrix() {
    try {
      await apiDownloadPost("/api/rfp/export/matrix", {
        title: rfp?.filename || "Solicitation",
        requirements, matrix: analysis?.matrix || [], coverage_pct: analysis?.coverage_pct || 0,
      }, `${(rfp?.filename || "solicitation").replace(/\.[^.]+$/, "")}_Compliance_Matrix.docx`)
    } catch (e) { setError(e.message) }
  }

  const cov = analysis?.coverage_pct ?? 0
  const covColor = cov >= 80 ? "#1DB954" : cov >= 50 ? "#F8C81C" : "#FF6432"

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={eyebrow}>RFP Shredder · Compliance-first</div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>Shred the RFP. Beat the checklist.</h1>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".92rem", lineHeight: 1.6, marginTop: ".6rem", maxWidth: 680 }}>
          Upload the actual solicitation and FinesseWins extracts every requirement, submission instruction, and evaluation
          factor into a <strong style={{ color: "#fff" }}>compliance matrix</strong>. Then drop in your own documents and watch
          your coverage score — so you fix the gaps <em>before</em> the evaluator finds them.
        </p>
      </div>

      {error && <div style={{ background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, padding: ".8rem 1rem", marginBottom: "1rem", fontSize: ".85rem", color: "#FF8870" }}>{error}</div>}

      {/* STEP 1 — SHRED */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: 0 }}>1 · Shred the solicitation</h3>
          {rfp && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", color: "rgba(255,255,255,.4)" }}>{rfp.filename} · {rfp.words.toLocaleString()} words{rfp.pages ? ` · ${rfp.pages}p` : ""}</span>}
        </div>
        <Drop label={shredding ? "Reading the RFP…" : "Drop the solicitation (PDF, DOCX, or TXT)"} hint="The actual RFP / RFQ / RFP document from the agency" accept=".pdf,.docx,.txt" onFiles={doShred} disabled={shredding} />

        {shredData && (
          <div style={{ marginTop: "1.25rem" }}>
            {shredData.summary && <p style={{ fontSize: ".9rem", color: "rgba(255,255,255,.8)", lineHeight: 1.6, marginBottom: "1rem" }}>{shredData.summary}</p>}
            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {(shredData.key_dates || []).map((d, i) => (
                <span key={i} style={{ fontFamily: "'DM Mono', monospace", fontSize: ".62rem", background: "rgba(31,182,238,.1)", border: "1px solid rgba(31,182,238,.25)", color: "#1FB6EE", padding: ".3rem .7rem", borderRadius: 20 }}>{d.label}: {d.date}</span>
              ))}
              {shredData.submission?.page_limit && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".62rem", background: "rgba(248,200,28,.1)", border: "1px solid rgba(248,200,28,.25)", color: "#F8C81C", padding: ".3rem .7rem", borderRadius: 20 }}>Page limit: {shredData.submission.page_limit}</span>}
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.45)", marginBottom: ".6rem" }}>
              {requirements.length} requirements extracted
            </div>
          </div>
        )}
      </div>

      {/* STEP 2 — SCORE */}
      {requirements.length > 0 && (
        <div style={card}>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem" }}>2 · Score your documents against it</h3>
          <Drop label={analyzing ? "Scoring your documents…" : "Drop your documents — capability statement, past draft, project write-ups"} hint="Whatever you already have. We score each against every requirement." multiple accept=".pdf,.docx,.txt" onFiles={doAnalyze} disabled={analyzing} />

          {analysis && (
            <div style={{ marginTop: "1.25rem" }}>
              {/* the moment */}
              <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", padding: "1.25rem", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, marginBottom: "1rem", flexWrap: "wrap" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "2.6rem", fontWeight: 900, color: covColor, lineHeight: 1 }}>{cov}%</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginTop: ".3rem" }}>Coverage</div>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,.08)", overflow: "hidden", marginBottom: ".7rem" }}>
                    <div style={{ height: "100%", width: `${cov}%`, background: covColor, transition: "width .6s ease" }} />
                  </div>
                  <div style={{ display: "flex", gap: "1rem", fontFamily: "'DM Mono', monospace", fontSize: ".68rem" }}>
                    <span style={{ color: "#1DB954" }}>● {analysis.counts.addressed} addressed</span>
                    <span style={{ color: "#F8C81C" }}>● {analysis.counts.partial} partial</span>
                    <span style={{ color: "#FF6432" }}>● {analysis.counts.missing} missing</span>
                  </div>
                </div>
                <button onClick={exportMatrix} style={btn("rgba(31,182,238,.12)", "#1FB6EE", "rgba(31,182,238,.35)")}>⬇ Matrix .docx</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3 — MATRIX + STRENGTHEN */}
      {requirements.length > 0 && (
        <div style={card}>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem" }}>
            {analysis ? "3 · Compliance matrix — close the gaps" : "Requirements checklist"}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
            {requirements.map(req => {
              const m = matrixById[req.id]
              const st = m ? STATUS[m.status] : null
              const s = strong[req.id]
              const canStrengthen = analysis && m && m.status !== "addressed"
              return (
                <div key={req.id} style={{ border: `1px solid ${st ? st.bd : "rgba(255,255,255,.08)"}`, borderRadius: 10, padding: "1rem 1.1rem", background: st ? st.bg : "rgba(255,255,255,.02)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: ".5rem", alignItems: "center", marginBottom: ".3rem", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".62rem", color: "rgba(255,255,255,.45)" }}>{req.id}</span>
                        {req.section && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".08em", textTransform: "uppercase", color: SECTION_TINT[req.section] || "rgba(255,255,255,.4)", border: `1px solid ${SECTION_TINT[req.section] || "rgba(255,255,255,.25)"}55`, padding: ".1rem .45rem", borderRadius: 20 }}>{req.section}</span>}
                        {req.category && <span style={{ fontSize: ".62rem", color: "rgba(255,255,255,.5)" }}>{req.category}</span>}
                      </div>
                      <div style={{ fontSize: ".9rem", color: "#fff", lineHeight: 1.5 }}>{req.text}</div>
                      {m?.note && <div style={{ fontSize: ".78rem", color: "rgba(255,255,255,.55)", marginTop: ".35rem" }}>{m.doc ? `[${m.doc}] ` : ""}{m.note}</div>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: ".4rem", alignItems: "flex-end" }}>
                      {st && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, color: st.color }}>{st.label}{typeof m.coverage === "number" ? ` ${m.coverage}` : ""}</span>}
                      {canStrengthen && (
                        <button onClick={() => doStrengthen(req)} disabled={busyReq === req.id}
                          style={btn(busyReq === req.id ? "rgba(236,28,123,.2)" : "#EC1C7B", "#fff")}>
                          {busyReq === req.id ? "Writing…" : s ? "↻ Redo" : "✎ Strengthen"}
                        </button>
                      )}
                    </div>
                  </div>

                  {s && (
                    <div style={{ marginTop: ".9rem", padding: "1rem", background: "rgba(0,0,0,.25)", border: "1px solid rgba(29,185,84,.25)", borderRadius: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".5rem" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".12em", textTransform: "uppercase", color: "#1DB954" }}>Strengthened — grounded in your content</span>
                        <button onClick={() => { navigator.clipboard?.writeText(s.rewritten) }} style={{ ...btn("none", "rgba(255,255,255,.6)", "rgba(255,255,255,.2)"), padding: ".3rem .7rem" }}>Copy</button>
                      </div>
                      <div style={{ fontSize: ".86rem", color: "#fff", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{s.rewritten}</div>
                      {s.rationale && <div style={{ fontSize: ".76rem", color: "#1FB6EE", marginTop: ".6rem" }}>Why it wins: {s.rationale}</div>}
                      {s.warnings?.length > 0 && (
                        <div style={{ marginTop: ".6rem", padding: ".6rem .8rem", background: "rgba(248,200,28,.08)", border: "1px solid rgba(248,200,28,.3)", borderRadius: 6 }}>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".1em", textTransform: "uppercase", color: "#F8C81C", marginBottom: ".3rem" }}>⚠ You must add / verify</div>
                          {s.warnings.map((w, i) => <div key={i} style={{ fontSize: ".8rem", color: "rgba(255,255,255,.75)" }}>• {w}</div>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
