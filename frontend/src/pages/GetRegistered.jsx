import { useState, useEffect } from "react"
import { apiJson } from "../lib/api"

/* Get Registered — the wall every first-time bidder hits BEFORE they can bid.
   You cannot win (or even submit) a federal contract without an active SAM.gov
   registration. This walks a total beginner through it in plain English, warns
   them it's free (predatory "registration services" charge hundreds), and saves
   their UEI/CAGE straight into their FinesseWins profile when they get them. */

const KEY = "finessewins.samreg.v1"

const PREP = [
  { id: "p1", label: "Your legal business name", hint: "Must match your IRS records exactly — not your DBA or brand name." },
  { id: "p2", label: "EIN (Employer Identification Number)", hint: "Your federal tax ID from the IRS. Sole proprietors may use an SSN, but an EIN is safer." },
  { id: "p3", label: "Physical street address", hint: "A real street address — PO boxes are not accepted." },
  { id: "p4", label: "Bank account + routing number", hint: "The government pays by electronic transfer, so they need where to send money." },
  { id: "p5", label: "Your NAICS codes", hint: "The industry codes for the work you do. Not sure? Use Bid Radar to search by trade." },
  { id: "p6", label: "An authorized representative", hint: "A real person who can legally bind your company to a contract — usually you." },
]

const STEPS = [
  {
    id: "s1",
    title: "Create your SAM.gov login",
    time: "~10 minutes",
    body: [
      "Go to SAM.gov and create an account. You'll sign in through Login.gov, which is the government's shared sign-in system — it needs your email, a password, and two-factor authentication (a code sent to your phone or an authenticator app).",
      "Use an email address you'll keep long-term and that's tied to the business. If you lose access to it later, recovering the account is painful.",
    ],
    link: { label: "SAM.gov", url: "https://sam.gov" },
  },
  {
    id: "s2",
    title: "Get your UEI (Unique Entity ID)",
    time: "usually same day",
    body: [
      "The UEI is your company's 12-character government ID. It replaced the old DUNS number in April 2022, so ignore any guide that tells you to get a DUNS — that's outdated.",
      "You request it inside SAM.gov as part of registering your entity. You'll confirm your legal name and address, and the system validates them against public records.",
      "If validation fails, it's almost always because your name or address doesn't exactly match your IRS or state filing. Fix the mismatch rather than guessing — SAM has an entity-validation help ticket for exactly this.",
    ],
  },
  {
    id: "s3",
    title: "Complete your entity registration",
    time: "1–2 hours of forms",
    body: [
      "This is the long part. You'll enter your business details, the bank account for payment (EFT), your NAICS codes, and size/ownership information used to determine your small-business and set-aside status.",
      "You'll also answer the Representations & Certifications — a long questionnaire of yes/no legal statements (things like non-discrimination compliance and whether you have any debarments). Answer honestly; these are legally binding certifications you're signing under penalty.",
      "Save as you go. You can leave and come back — nothing is submitted until you certify at the end.",
    ],
  },
  {
    id: "s4",
    title: "Get your CAGE code",
    time: "days to a few weeks",
    body: [
      "The CAGE (Commercial and Government Entity) code is a 5-character code assigned to you automatically during registration — you don't apply for it separately.",
      "It's assigned by the Defense Logistics Agency, and this is usually the step that takes the longest. Your registration isn't active until it's issued.",
      "You'll get an email when your registration goes active. Until then you can't be awarded a federal contract, though you can absolutely start researching and preparing bids.",
    ],
  },
  {
    id: "s5",
    title: "Stay active — renew every year",
    time: "annual, ~30 minutes",
    body: [
      "SAM registrations expire after 12 months. An expired registration makes you ineligible for award, and agencies will pass you over without telling you why.",
      "Set a calendar reminder for 60 days before your expiration date. Renewing early costs nothing and avoids a gap.",
      "Any time your address, bank account, ownership, or size status changes, update SAM right away — a mismatch between your proposal and your SAM record is a common reason bids get rejected.",
    ],
  },
]

const GLOSSARY = [
  ["UEI", "Unique Entity ID — your 12-character government ID. Replaced the DUNS number."],
  ["CAGE", "A 5-character code identifying your business to the government. Auto-assigned during SAM registration."],
  ["EIN", "Employer Identification Number — your federal tax ID from the IRS."],
  ["NAICS", "Industry codes classifying what your business does. Used to match you to contracts."],
  ["Reps & Certs", "Representations and Certifications — legally binding yes/no statements you sign in SAM."],
  ["Set-aside", "A contract reserved for a certain kind of business (e.g. WOSB, 8(a), HUBZone)."],
  ["Solicitation", "The government's formal request for bids — the RFP/RFQ document itself."],
]

export default function GetRegistered({ onNavigate }) {
  const [done, setDone] = useState({})
  const [open, setOpen] = useState("s1")
  const [uei, setUei] = useState("")
  const [cage, setCage] = useState("")
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(KEY) || "{}")) } catch {}
    apiJson("/api/profile").then(({ profile: p }) => {
      if (p?.uei) setUei(p.uei)
      if (p?.cage) setCage(p.cage)
    }).catch(() => {})
  }, [])

  const toggle = (id) => {
    const next = { ...done, [id]: !done[id] }
    setDone(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  }

  const stepIds = STEPS.map(s => s.id)
  const stepsDone = stepIds.filter(id => done[id]).length
  const pct = Math.round((stepsDone / stepIds.length) * 100)

  async function saveIds() {
    setSaving(true); setError(null)
    try {
      const { profile } = await apiJson("/api/profile").catch(() => ({ profile: {} }))
      await apiJson("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ ...(profile || {}), uei: uei.trim(), cage: cage.trim() }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const card = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.25rem" }
  const input = { width: "100%", background: "rgba(255,255,255,.05)", border: "2px solid rgba(255,255,255,.12)", color: "#fff", padding: ".7rem .9rem", fontFamily: "'DM Mono', monospace", fontSize: ".85rem", outline: "none", borderRadius: 8, boxSizing: "border-box" }
  const label = { display: "block", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: ".4rem" }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".5rem" }}>
          Step Zero · Before you can bid
        </div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, margin: 0, letterSpacing: "-.02em" }}>Get Registered on SAM.gov</h1>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".92rem", lineHeight: 1.6, marginTop: ".6rem", maxWidth: 660 }}>
          You cannot be awarded a federal contract without an active SAM.gov registration. It's the wall almost every
          first-time bidder hits. Here's the whole thing in plain English — no jargon, no consultant.
        </p>
      </div>

      {/* the money warning */}
      <div style={{ background: "rgba(248,200,28,.08)", border: "1px solid rgba(248,200,28,.35)", borderRadius: 12, padding: "1.1rem 1.25rem", marginBottom: "1.25rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".12em", textTransform: "uppercase", color: "#F8C81C", marginBottom: ".4rem" }}>⚠ Read this first</div>
        <div style={{ fontSize: ".9rem", color: "rgba(255,255,255,.85)", lineHeight: 1.6 }}>
          <strong style={{ color: "#fff" }}>Registering on SAM.gov is 100% free.</strong> There are companies that will charge you
          $500–$1,500 to "register you" or "renew" your account — they're reselling a free government service, and some
          are outright scams. You never have to pay anyone to register, get a UEI, or get a CAGE code. Only use{" "}
          <a href="https://sam.gov" target="_blank" rel="noreferrer" style={{ color: "#F8C81C" }}>sam.gov</a> (the real site ends in <strong style={{ color: "#fff" }}>.gov</strong>).
        </div>
      </div>

      {/* progress */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "2rem", fontWeight: 900, color: pct === 100 ? "#1DB954" : "#F8C81C", lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginTop: ".3rem" }}>Registered</div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#1DB954" : "#F8C81C", transition: "width .5s ease" }} />
          </div>
          <div style={{ fontSize: ".8rem", color: "rgba(255,255,255,.5)", marginTop: ".5rem" }}>
            {stepsDone} of {stepIds.length} steps complete{pct === 100 ? " — you're eligible to be awarded contracts 🎉" : ""}
          </div>
        </div>
      </div>

      {/* prep */}
      <div style={card}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 .3rem" }}>Before you start — gather these</h3>
        <p style={{ fontSize: ".82rem", color: "rgba(255,255,255,.45)", margin: "0 0 1rem" }}>Having these on hand turns a multi-day slog into one sitting.</p>
        {PREP.map(p => (
          <label key={p.id} style={{ display: "flex", gap: ".75rem", alignItems: "flex-start", padding: ".55rem 0", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
            <input type="checkbox" checked={!!done[p.id]} onChange={() => toggle(p.id)} style={{ marginTop: ".25rem", accentColor: "#EC1C7B", width: 16, height: 16, cursor: "pointer" }} />
            <span>
              <span style={{ fontSize: ".9rem", color: done[p.id] ? "rgba(255,255,255,.45)" : "#fff", textDecoration: done[p.id] ? "line-through" : "none" }}>{p.label}</span>
              <span style={{ display: "block", fontSize: ".78rem", color: "rgba(255,255,255,.45)", marginTop: ".15rem" }}>{p.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {/* steps */}
      <div style={card}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem" }}>The registration, step by step</h3>
        {STEPS.map((s, i) => {
          const isOpen = open === s.id
          const isDone = !!done[s.id]
          return (
            <div key={s.id} style={{ border: `1px solid ${isDone ? "rgba(29,185,84,.3)" : "rgba(255,255,255,.08)"}`, background: isDone ? "rgba(29,185,84,.05)" : "rgba(255,255,255,.02)", borderRadius: 10, marginBottom: ".6rem", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".8rem", padding: ".9rem 1rem", cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : s.id)}>
                <input type="checkbox" checked={isDone} onClick={e => e.stopPropagation()} onChange={() => toggle(s.id)}
                  style={{ accentColor: "#1DB954", width: 18, height: 18, cursor: "pointer", flex: "none" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: ".92rem", fontWeight: 600, color: isDone ? "rgba(255,255,255,.55)" : "#fff" }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", color: "#EC1C7B", marginRight: ".5rem" }}>{i + 1}</span>{s.title}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", color: "rgba(255,255,255,.35)", marginTop: ".15rem" }}>{s.time}</div>
                </div>
                <span style={{ color: "rgba(255,255,255,.3)", fontSize: ".8rem" }}>{isOpen ? "▲" : "▼"}</span>
              </div>
              {isOpen && (
                <div style={{ padding: "0 1rem 1rem 3.1rem" }}>
                  {s.body.map((p, j) => (
                    <p key={j} style={{ fontSize: ".87rem", color: "rgba(255,255,255,.72)", lineHeight: 1.65, marginBottom: ".7rem" }}>{p}</p>
                  ))}
                  {s.link && (
                    <a href={s.link.url} target="_blank" rel="noreferrer"
                      style={{ display: "inline-block", fontFamily: "'DM Mono', monospace", fontSize: ".62rem", letterSpacing: ".1em", textTransform: "uppercase", color: "#1FB6EE", border: "1px solid rgba(31,182,238,.35)", background: "rgba(31,182,238,.1)", padding: ".45rem .9rem", borderRadius: 6, textDecoration: "none" }}>
                      Open {s.link.label} ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* save UEI / CAGE into the profile */}
      <div style={card}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 .3rem" }}>Got your numbers? Save them here</h3>
        <p style={{ fontSize: ".82rem", color: "rgba(255,255,255,.45)", margin: "0 0 1rem" }}>
          These go straight into your Company Profile, so every proposal FinesseWins writes includes them automatically.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: ".8rem", alignItems: "end" }}>
          <div>
            <label style={label}>SAM.gov UEI</label>
            <input style={input} value={uei} onChange={e => setUei(e.target.value)} placeholder="12 characters" />
          </div>
          <div>
            <label style={label}>CAGE Code</label>
            <input style={input} value={cage} onChange={e => setCage(e.target.value)} placeholder="5 characters" />
          </div>
          <button onClick={saveIds} disabled={saving}
            style={{ background: saved ? "#1DB954" : "#EC1C7B", color: "#fff", border: "none", padding: ".72rem 1.3rem", fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: saving ? "wait" : "pointer", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
          </button>
        </div>
        {error && <div style={{ marginTop: ".7rem", fontSize: ".8rem", color: "#FF8870" }}>{error}</div>}
      </div>

      {/* glossary */}
      <div style={card}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem" }}>Decoder — what the acronyms mean</h3>
        <div style={{ display: "grid", gap: ".6rem" }}>
          {GLOSSARY.map(([term, def]) => (
            <div key={term} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: ".8rem", alignItems: "start" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".72rem", color: "#1FB6EE", fontWeight: 600 }}>{term}</span>
              <span style={{ fontSize: ".85rem", color: "rgba(255,255,255,.65)", lineHeight: 1.55 }}>{def}</span>
            </div>
          ))}
        </div>
      </div>

      {/* next step */}
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: ".92rem", color: "rgba(255,255,255,.75)", marginBottom: ".9rem" }}>
          Registered — or waiting on your CAGE code? You can start finding and preparing bids right now.
        </div>
        <button onClick={() => onNavigate("opportunities")}
          style={{ background: "#EC1C7B", color: "#fff", border: "none", padding: ".7rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".68rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 8, fontWeight: 600 }}>
          Find your first bid →
        </button>
      </div>
    </div>
  )
}
