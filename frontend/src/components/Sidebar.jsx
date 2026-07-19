import { useState, useEffect } from "react"
import { apiJson } from "../lib/api"
import { LogoMark } from "./Logo"

const NAV = [
  { id: "dashboard",     label: "Dashboard",       icon: "⊞" },
  { id: "get-registered", label: "Get Registered",   icon: "🪪" },
  { id: "opportunities", label: "Find Bids",        icon: "🔍" },
  { id: "intel",         label: "Bid IQ",           icon: "📊" },
  { id: "alerts",        label: "Bid Radar",        icon: "📡" },
  { id: "rfp-shredder",  label: "RFP Shredder",     icon: "📄" },
  { id: "new-proposal",  label: "New Proposal",     icon: "✦" },
  { id: "toolkit",       label: "Toolkit",          icon: "🧰" },
  { id: "advisor",       label: "Advisor Console",  icon: "🏛" },
  { id: "pricing",       label: "Pricing",          icon: "💳" },
  { id: "profile",       label: "Company Profile",  icon: "◎" },
]

const PLAN_LABELS = { free: "Free Trial", solo: "Solo", pro: "Pro", agency: "Agency" }

export default function Sidebar({ currentPage, onNavigate, userEmail, onSignOut }) {
  const [usage, setUsage] = useState(null)
  const [unseenAlerts, setUnseenAlerts] = useState(0)

  // Refetch usage + unseen alert count when the page changes.
  useEffect(() => {
    let alive = true
    apiJson("/api/usage").then(u => { if (alive) setUsage(u) }).catch(() => {})
    apiJson("/api/alerts/settings").then(s => { if (alive) setUnseenAlerts(s.unseen || 0) }).catch(() => {})
    return () => { alive = false }
  }, [currentPage])

  const planName = PLAN_LABELS[usage?.plan] || "Free Trial"
  const unlimited = usage ? usage.limit >= 999 : false
  const remaining = usage?.remaining ?? 2
  const usagePct = usage && usage.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0
  const isPaid = usage && usage.plan && usage.plan !== "free"

  return (
    <aside style={{
      position: "fixed", left: 0, top: 0, bottom: 0, width: 240,
      background: "#100D22", borderRight: "1px solid rgba(255,255,255,.08)",
      display: "flex", flexDirection: "column", padding: "1.5rem 0", zIndex: 100
    }}>
      {/* Logo */}
      <div style={{ padding: "0 1.5rem 2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
          <LogoMark size={30} />
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.2rem", fontWeight: 900, letterSpacing: "-.03em", color: "#fff" }}>Finesse<span style={{ color: "#EC1C7B" }}>Wins</span></div>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(255,255,255,.3)", marginTop: ".45rem" }}>AI · Gov Contracting</div>
        <div style={{ marginTop: ".6rem", display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
          {["WOSB", "MBE", "Black-Owned"].map(c => (
            <span key={c} style={{ fontFamily: "'DM Mono', monospace", fontSize: ".52rem", letterSpacing: ".08em", background: "rgba(31,182,238,.1)", color: "#1FB6EE", border: "1px solid rgba(31,182,238,.2)", padding: ".15rem .5rem", borderRadius: 3 }}>{c}</span>
          ))}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1 }}>
        {NAV.map(item => {
          const active = currentPage === item.id
          return (
            <button key={item.id} onClick={() => onNavigate(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: ".75rem",
                width: "100%", padding: ".75rem 1.5rem", border: "none",
                background: active ? "rgba(236,28,123,.12)" : "none",
                borderLeft: active ? "3px solid #EC1C7B" : "3px solid transparent",
                color: active ? "#fff" : "rgba(255,255,255,.5)",
                fontFamily: "'Space Grotesk', sans-serif", fontSize: ".88rem",
                fontWeight: active ? 600 : 400, cursor: "pointer",
                transition: "all .15s", textAlign: "left"
              }}>
              <span style={{ fontSize: "1rem" }}>{item.icon}</span>
              {item.label}
              {item.id === "alerts" && unseenAlerts > 0 && (
                <span style={{ marginLeft: "auto", background: "#EC1C7B", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: ".55rem", fontWeight: 700, minWidth: 18, height: 18, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 .35rem" }}>
                  {unseenAlerts > 99 ? "99+" : unseenAlerts}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Plan + usage meter */}
      <div style={{ margin: "0 1rem 1rem", padding: ".85rem 1rem", background: isPaid ? "rgba(31,182,238,.06)" : "rgba(248,200,28,.06)", border: `1px solid ${isPaid ? "rgba(31,182,238,.2)" : "rgba(248,200,28,.2)"}`, borderRadius: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".4rem" }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".1em", textTransform: "uppercase", color: isPaid ? "#1FB6EE" : "#F8C81C" }}>{planName}</span>
          {isPaid && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: ".5rem", color: "#1DB954", letterSpacing: ".08em" }}>ACTIVE</span>}
        </div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".78rem", color: "rgba(255,255,255,.7)", marginBottom: ".6rem", lineHeight: 1.4 }}>
          {unlimited
            ? "Unlimited proposals"
            : `${remaining} proposal${remaining === 1 ? "" : "s"} left this month`}
        </div>
        {!unlimited && (
          <div style={{ height: 4, background: "rgba(255,255,255,.1)", borderRadius: 2, overflow: "hidden", marginBottom: ".6rem" }}>
            <div style={{ width: `${usagePct}%`, height: "100%", background: usagePct >= 100 ? "#FF6432" : isPaid ? "#1FB6EE" : "#F8C81C", transition: "width .3s" }} />
          </div>
        )}
        {!isPaid && (
          <button onClick={() => onNavigate("pricing")}
            style={{ width: "100%", background: "#F8C81C", color: "#0D0B1A", border: "none", padding: ".5rem", fontFamily: "'DM Mono', monospace", fontSize: ".62rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", borderRadius: 4, fontWeight: 700 }}>
            Upgrade →
          </button>
        )}
      </div>

      {/* Account / sign out */}
      {onSignOut && (
        <div style={{ padding: ".6rem 1.5rem", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem" }}>
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".5rem", letterSpacing: ".1em", color: "rgba(255,255,255,.3)", textTransform: "uppercase" }}>Signed in</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: ".72rem", color: "rgba(255,255,255,.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={userEmail || ""}>
              {userEmail || "—"}
            </div>
          </div>
          <button onClick={onSignOut} title="Sign out"
            style={{ background: "none", border: "1px solid rgba(255,255,255,.15)", color: "rgba(255,255,255,.5)", borderRadius: 6, padding: ".3rem .55rem", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            Exit
          </button>
        </div>
      )}

      {/* MC Brand footer */}
      <div style={{ padding: ".75rem 1.5rem", borderTop: "1px solid rgba(255,255,255,.06)", fontFamily: "'DM Mono', monospace", fontSize: ".58rem", letterSpacing: ".1em", color: "rgba(255,255,255,.2)", textTransform: "uppercase", lineHeight: 1.7 }}>
        Millennials Creatives LLC<br />
        CAGE 18ZQ0 · SAM Registered
      </div>
    </aside>
  )
}
