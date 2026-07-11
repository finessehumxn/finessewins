import { useState } from "react"
import { supabase } from "../lib/supabase"
import { LogoMark } from "../components/Logo"

export default function Login() {
  const [mode, setMode] = useState("signin") // signin | signup
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [company, setCompany] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { company_name: company } },
        })
        if (error) throw error
        if (!data.session) {
          setNotice("Check your email to confirm your account, then sign in.")
          setMode("signin")
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
      // On success, App's onAuthStateChange listener swaps to the app.
    } catch (err) {
      setError(err.message || "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  const input = {
    width: "100%", background: "rgba(255,255,255,.05)",
    border: "2px solid rgba(255,255,255,.12)", color: "#fff",
    padding: ".8rem 1rem", fontFamily: "'Space Grotesk', sans-serif",
    fontSize: ".92rem", outline: "none", borderRadius: 8, boxSizing: "border-box",
    marginBottom: "1rem",
  }
  const label = {
    display: "block", fontFamily: "'DM Mono', monospace", fontSize: ".6rem",
    letterSpacing: ".12em", textTransform: "uppercase",
    color: "rgba(255,255,255,.5)", marginBottom: ".4rem",
  }

  return (
    <div style={{
      minHeight: "100vh", width: "100%", background: "#0D0B1A", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: ".6rem" }}>
            <LogoMark size={40} />
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.8rem", fontWeight: 900, letterSpacing: "-.03em", color: "#fff" }}>Finesse<span style={{ color: "#EC1C7B" }}>Wins</span></div>
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: ".6rem", letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(255,255,255,.35)", marginTop: ".6rem" }}>
            AI · Government Contracting
          </div>
          <div style={{ marginTop: ".9rem", display: "flex", gap: ".4rem", justifyContent: "center", flexWrap: "wrap" }}>
            {["WOSB", "MBE", "Black-Owned"].map(c => (
              <span key={c} style={{ fontFamily: "'DM Mono', monospace", fontSize: ".52rem", letterSpacing: ".08em", background: "rgba(31,182,238,.1)", color: "#1FB6EE", border: "1px solid rgba(31,182,238,.2)", padding: ".15rem .5rem", borderRadius: 3 }}>{c}</span>
            ))}
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: "2rem" }}>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.25rem", fontWeight: 700, margin: "0 0 1.5rem" }}>
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>

          <form onSubmit={submit}>
            {mode === "signup" && (
              <>
                <label style={label}>Company Name</label>
                <input style={input} value={company} onChange={e => setCompany(e.target.value)}
                  placeholder="Millennials Creatives LLC" />
              </>
            )}
            <label style={label}>Email</label>
            <input style={input} type="email" required value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />

            <label style={label}>Password</label>
            <input style={input} type="password" required minLength={6} value={password}
              onChange={e => setPassword(e.target.value)} placeholder="••••••••" />

            {error && (
              <div style={{ background: "rgba(255,100,80,.1)", border: "1px solid rgba(255,100,80,.3)", borderRadius: 8, padding: ".7rem .9rem", marginBottom: "1rem", fontSize: ".82rem", color: "#FF8870" }}>
                {error}
              </div>
            )}
            {notice && (
              <div style={{ background: "rgba(31,182,238,.08)", border: "1px solid rgba(31,182,238,.25)", borderRadius: 8, padding: ".7rem .9rem", marginBottom: "1rem", fontSize: ".82rem", color: "#1FB6EE" }}>
                {notice}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{
                width: "100%", background: loading ? "rgba(236,28,123,.5)" : "#EC1C7B",
                color: "#fff", border: "none", padding: ".85rem",
                fontFamily: "'DM Mono', monospace", fontSize: ".72rem", letterSpacing: ".12em",
                textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer",
                borderRadius: 8, fontWeight: 700,
              }}>
              {loading ? "Please wait…" : mode === "signin" ? "Sign in →" : "Create account →"}
            </button>
          </form>

          <div style={{ marginTop: "1.25rem", textAlign: "center", fontSize: ".82rem", color: "rgba(255,255,255,.5)" }}>
            {mode === "signin" ? "New to FinesseWins? " : "Already have an account? "}
            <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null) }}
              style={{ background: "none", border: "none", color: "#EC1C7B", cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", fontSize: ".82rem", fontWeight: 600 }}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "1.5rem", fontFamily: "'DM Mono', monospace", fontSize: ".55rem", letterSpacing: ".1em", color: "rgba(255,255,255,.25)", textTransform: "uppercase", lineHeight: 1.8 }}>
          Millennials Creatives LLC · CAGE 18ZQ0<br />SAM.gov Registered · Phoenix AZ
        </div>
      </div>
    </div>
  )
}
