import { useState } from "react"
import { apiJson } from "../lib/api"

const PLANS = [
  {
    key: "solo",
    name: "Solo",
    price: 47,
    period: "/mo",
    tagline: "For first-time bidders just getting started",
    color: "var(--cyan)",
    features: [
      "5 proposals per month",
      "SAM.gov opportunity search",
      "Plain-English RFP explainer",
      "WOSB/MBE/Black-owned certification leverage",
      "Zero past performance mode",
      "State portal coverage (AZ APP)",
      "Email support",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: 97,
    period: "/mo",
    tagline: "For growing businesses bidding regularly",
    color: "#EC1C7B",
    featured: true,
    features: [
      "20 proposals per month",
      "SAM.gov + AZ APP Portal + 50-state search",
      "All Solo features",
      "Amendment tracking & email alerts",
      "Capability statement generator (PDF)",
      "Deadline reminders",
      "Bid win/loss tracker",
      "Priority support",
    ],
  },
  {
    key: "agency",
    name: "Agency",
    price: 297,
    period: "/mo",
    tagline: "For consultants submitting bids for clients",
    color: "#F8C81C",
    features: [
      "Unlimited proposals",
      "All Pro features",
      "Multiple company profiles",
      "White-label capability statements",
      "API access",
      "Done-with-you onboarding call",
      "Dedicated support",
    ],
  },
]

const FAQS = [
  { q: "What makes FinesseWins different from GovDash or Sweetspot?", a: "Those tools start at $299–$600/month and are built for established GovCon firms with BD teams. FinesseWins is built for businesses that have never won a contract yet — WOSB, MBE, Black-owned, and minority small businesses who need the on-ramp, not an enterprise platform." },
  { q: "What if I have no past performance?", a: "That's exactly what FinesseWins's Zero Past Performance Mode is built for. Instead of leaving you with a blank section, it writes compelling narratives using your private sector work, nonprofit experience, and professional background — citing FAR 15.305 which allows agencies to consider 'similar' work." },
  { q: "Does it cover state contracts, not just federal?", a: "Yes. Every competitor focuses only on SAM.gov federal contracts. FinesseWins covers state portals including the Arizona APP Portal (where MC bids every week), and we're adding more states monthly." },
  { q: "How does the certification leverage work?", a: "You enter your certifications (WOSB, MBE, Black-Owned, 8a, HUBZone, DBE) and FinesseWins automatically finds set-aside opportunities you qualify for, then writes those advantages into your proposal language as win themes — not as an afterthought." },
  { q: "Can I cancel anytime?", a: "Yes. No contracts, no cancellation fees. Cancel from your account dashboard anytime." },
]

export default function Pricing({ onNavigate }) {
  const [faq, setFaq] = useState(null)

  const selectPlan = async (plan) => {
    try {
      const data = await apiJson("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({
          plan_key: plan.key,
          success_url: window.location.origin + "/success",
          cancel_url: window.location.origin + "/pricing",
        }),
      })
      if (data.checkout_url) {
        window.location.href = data.checkout_url
      } else {
        onNavigate("new-proposal")
      }
    } catch {
      onNavigate("new-proposal")
    }
  }

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#EC1C7B", marginBottom: ".75rem" }}>
          Pricing — Built for First-Timers
        </div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 900, margin: "0 0 1rem", letterSpacing: "-.02em", lineHeight: 1 }}>
          3–6× cheaper than<br />every competitor.
        </h1>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".95rem", maxWidth: 520, margin: "0 auto" }}>
          GovDash starts at $299/mo. Sweetspot won't show you pricing without a sales call. FinesseWins starts at $47 because winning your first contract matters more than our ARR.
        </p>
      </div>

      {/* Plans */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1.25rem", marginBottom: "3rem" }}>
        {PLANS.map(plan => (
          <div key={plan.key} style={{
            background: plan.featured ? "rgba(236,28,123,.06)" : "rgba(255,255,255,.03)",
            border: `2px solid ${plan.featured ? plan.color : "rgba(255,255,255,.1)"}`,
            borderRadius: 12, padding: "2rem", position: "relative",
            display: "flex", flexDirection: "column"
          }}>
            {plan.featured && (
              <div style={{ position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)", background: "#EC1C7B", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".12em", padding: ".3rem 1rem", whiteSpace: "nowrap" }}>
                MOST POPULAR
              </div>
            )}
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.1rem", fontWeight: 900, color: plan.color, marginBottom: ".25rem" }}>{plan.name}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", color: "rgba(255,255,255,.4)", marginBottom: "1.25rem" }}>{plan.tagline}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: ".25rem", marginBottom: "1.5rem" }}>
              <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "2.5rem", fontWeight: 900, color: "#F8C81C" }}>${plan.price}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".75rem", color: "rgba(255,255,255,.4)" }}>{plan.period}</span>
            </div>
            <ul style={{ listStyle: "none", margin: "0 0 2rem", padding: 0, flex: 1 }}>
              {plan.features.map(f => (
                <li key={f} style={{ display: "flex", gap: ".6rem", padding: ".35rem 0", fontSize: ".84rem", color: "rgba(255,255,255,.75)", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span style={{ color: "#1DB954", flexShrink: 0 }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <button onClick={() => selectPlan(plan)} style={{
              background: plan.featured ? "#EC1C7B" : "rgba(255,255,255,.06)",
              color: plan.featured ? "#fff" : "rgba(255,255,255,.8)",
              border: `2px solid ${plan.featured ? "#EC1C7B" : "rgba(255,255,255,.15)"}`,
              padding: ".85rem", fontFamily: "'DM Mono', monospace",
              fontSize: ".72rem", letterSpacing: ".12em", textTransform: "uppercase",
              cursor: "pointer", borderRadius: 6, fontWeight: 600, width: "100%",
              transition: "all .15s"
            }}>
              Start {plan.name} — ${plan.price}/mo →
            </button>
          </div>
        ))}
      </div>

      {/* Organization tier — accelerators / SBDCs / supplier diversity */}
      <div style={{ background: "linear-gradient(120deg, rgba(31,182,238,.08), rgba(236,28,123,.06))", border: "2px solid rgba(31,182,238,.35)", borderRadius: 14, padding: "2rem", marginBottom: "3rem", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "2rem", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".62rem", letterSpacing: ".12em", textTransform: "uppercase", color: "#1FB6EE", marginBottom: ".5rem" }}>
            Organization · Accelerators · SBDCs · MBDA · Supplier Diversity
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.4rem", fontWeight: 900, letterSpacing: "-.02em", marginBottom: ".5rem" }}>
            Run a program? Serve your whole cohort.
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".25rem .9rem" }}>
            {["Advisor Console — unlimited clients", "Per-client bid matching (all sites)", "Program impact reporting + CSV", "Bid IQ for your whole cohort", "Cohort onboarding & training", "Dedicated success manager"].map(f => (
              <li key={f} style={{ display: "flex", gap: ".5rem", padding: ".3rem 0", fontSize: ".82rem", color: "rgba(255,255,255,.78)" }}>
                <span style={{ color: "#1FB6EE", flexShrink: 0 }}>✓</span> {f}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: ".25rem", justifyContent: "center", marginBottom: ".25rem" }}>
            <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "2.5rem", fontWeight: 900, color: "#F8C81C" }}>$499</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".75rem", color: "rgba(255,255,255,.4)" }}>/mo</span>
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", color: "rgba(255,255,255,.4)", marginBottom: "1.25rem" }}>or annual — talk to us</div>
          <button onClick={() => selectPlan({ key: "org", name: "Organization", price: 499 })}
            style={{ background: "#1FB6EE", color: "#04121a", border: "none", padding: ".85rem 1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".72rem", letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer", borderRadius: 8, fontWeight: 700, width: "100%" }}>
            Get the Org plan →
          </button>
        </div>
      </div>

      {/* vs competitors */}
      <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: "2rem", marginBottom: "3rem" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: "1.25rem" }}>
          How FinesseWins compares
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".83rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
                {["Feature", "FinesseWins Solo $47", "FinesseWins Pro $97", "GovDash $299+", "Sweetspot $???"].map(h => (
                  <th key={h} style={{ padding: ".6rem .75rem", textAlign: "left", fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".1em", textTransform: "uppercase", color: h.includes("FinesseWins") ? "#F8C81C" : "rgba(255,255,255,.4)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["First-time bidder mode", "✓", "✓", "✗", "✗"],
                ["Zero past performance mode", "✓", "✓", "✗", "✗"],
                ["WOSB/MBE/Black-owned leverage", "✓", "✓", "Partial", "Partial"],
                ["State portal coverage (AZ, etc.)", "✓", "✓", "✗", "✗"],
                ["Plain-English RFP explainer", "✓", "✓", "✗", "✗"],
                ["Starting price", "$47/mo", "$97/mo", "$299/mo", "Hidden"],
                ["No sales call required", "✓", "✓", "✗", "✗"],
              ].map(row => (
                <tr key={row[0]} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  {row.map((cell, i) => (
                    <td key={i} style={{
                      padding: ".6rem .75rem",
                      color: cell === "✓" ? "#1DB954" : cell === "✗" ? "rgba(255,100,80,.7)" : i <= 2 ? "#F8C81C" : "rgba(255,255,255,.55)"
                    }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQs */}
      <div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: "1.25rem" }}>
          Frequently Asked Questions
        </div>
        {FAQS.map((item, i) => (
          <div key={i} style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, marginBottom: ".5rem", overflow: "hidden" }}>
            <button onClick={() => setFaq(faq === i ? null : i)}
              style={{ width: "100%", textAlign: "left", background: faq === i ? "rgba(255,255,255,.04)" : "none", border: "none", padding: "1rem 1.25rem", color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".9rem", fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {item.q}
              <span style={{ color: "rgba(255,255,255,.4)", fontSize: "1.1rem", flexShrink: 0 }}>{faq === i ? "−" : "+"}</span>
            </button>
            {faq === i && (
              <div style={{ padding: "0 1.25rem 1rem", fontSize: ".86rem", color: "rgba(255,255,255,.65)", lineHeight: 1.7 }}>
                {item.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
