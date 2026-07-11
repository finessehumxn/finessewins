import { Component } from "react"

// Catches any render error in a page so the whole app never white-screens.
// Shows a friendly recovery card instead of a blank screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error("FinesseWins render error:", error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: "3rem", maxWidth: 520, margin: "3rem auto", textAlign: "center", color: "#fff" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🛟</div>
        <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: "1.3rem", fontWeight: 900, marginBottom: ".75rem" }}>
          Something hiccuped
        </h1>
        <p style={{ color: "rgba(255,255,255,.6)", fontSize: ".9rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          This page ran into an unexpected error — your data is safe. Try again, and if it keeps
          happening, email us at <span style={{ color: "#EC1C7B" }}>finessehumxn@gmail.com</span>.
        </p>
        <button onClick={() => { this.reset(); if (this.props.onReset) this.props.onReset() }}
          style={{ background: "#EC1C7B", color: "#fff", border: "none", padding: ".7rem 1.75rem", fontFamily: "'DM Mono', monospace", fontSize: ".7rem", letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer", borderRadius: 8, fontWeight: 700 }}>
          Reload this page
        </button>
      </div>
    )
  }
}
