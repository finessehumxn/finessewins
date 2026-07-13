import { useState, useEffect } from "react"
import Dashboard from "./pages/Dashboard"
import NewProposal from "./pages/NewProposal"
import ProposalView from "./pages/ProposalView"
import Opportunities from "./pages/Opportunities"
import Alerts from "./pages/Alerts"
import Advisor from "./pages/Advisor"
import BidIQ from "./pages/BidIQ"
import Toolkit from "./pages/Toolkit"
import RfpShredder from "./pages/RfpShredder"
import Profile from "./pages/Profile"
import Pricing from "./pages/Pricing"
import Login from "./pages/Login"
import Sidebar from "./components/Sidebar"
import ErrorBoundary from "./components/ErrorBoundary"
import { supabase, authEnabled } from "./lib/supabase"

export default function App() {
  const [page, setPage] = useState("dashboard")
  const [selectedProposal, setSelectedProposal] = useState(null)
  const [intelSeed, setIntelSeed] = useState(null)

  // Auth session. When Supabase isn't configured (dev), we skip the gate.
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(!authEnabled)

  useEffect(() => {
    if (!authEnabled || !supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const navigate = (p, data = null) => {
    if (p === "proposal" && data) setSelectedProposal(data)
    if (p === "intel") setIntelSeed(data || null)
    setPage(p)
  }

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    setPage("dashboard")
  }

  if (!authReady) {
    return (
      <div style={{ minHeight: "100vh", background: "#0D0B1A", color: "rgba(255,255,255,.4)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace", fontSize: ".8rem", letterSpacing: ".1em" }}>
        Loading…
      </div>
    )
  }

  // Auth gate: if Supabase is configured and there's no session, show Login.
  if (authEnabled && !session) {
    return <Login />
  }

  const userEmail = session?.user?.email

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0D0B1A", color: "#fff" }}>
      <Sidebar currentPage={page} onNavigate={navigate} userEmail={userEmail} onSignOut={authEnabled ? signOut : null} />
      <main style={{ flex: 1, marginLeft: 240, padding: "2rem", maxWidth: "calc(100vw - 240px)", overflowX: "hidden" }}>
        <ErrorBoundary key={page}>
          {page === "dashboard"    && <Dashboard onNavigate={navigate} />}
          {page === "new-proposal" && <NewProposal onNavigate={navigate} />}
          {page === "proposal"     && <ProposalView proposal={selectedProposal} onNavigate={navigate} />}
          {page === "opportunities"&& <Opportunities onNavigate={navigate} />}
          {page === "alerts"       && <Alerts onNavigate={navigate} />}
          {page === "intel"        && <BidIQ onNavigate={navigate} seed={intelSeed} />}
          {page === "advisor"      && <Advisor onNavigate={navigate} />}
          {page === "toolkit"      && <Toolkit onNavigate={navigate} />}
          {page === "rfp-shredder" && <RfpShredder onNavigate={navigate} />}
          {page === "pricing"      && <Pricing onNavigate={navigate} />}
          {page === "profile"      && <Profile onNavigate={navigate} />}
        </ErrorBoundary>
      </main>
    </div>
  )
}
