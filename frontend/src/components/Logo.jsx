/**
 * FinesseWins logo.
 *
 * Mark = a rounded-square badge in the brand gradient (magenta → cyan) with two
 * stacked upward chevrons — "rising flow": bids flowing upward, winning momentum.
 * Reads cleanly from 16px (favicon) to hero size.
 *
 *   <LogoMark size={32} />           just the icon
 *   <Logo height={28} />             icon + "FinesseWins" wordmark lockup
 */

let _gid = 0
const nextId = () => `bfg${++_gid}`

export function LogoMark({ size = 32, radius, style }) {
  const id = nextId()
  const r = radius ?? size * 0.26
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none"
      xmlns="http://www.w3.org/2000/svg" style={style} role="img" aria-label="FinesseWins">
      <defs>
        <linearGradient id={id} x1="4" y1="44" x2="44" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EC1C7B" />
          <stop offset="1" stopColor="#1FB6EE" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx={r} fill={`url(#${id})`} />
      {/* rising chevrons */}
      <path d="M13 26.5 L24 15.5 L35 26.5" stroke="#fff" strokeWidth="5"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M13 34 L24 23 L35 34" stroke="#fff" strokeWidth="5"
        strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5" />
    </svg>
  )
}

export function Logo({ height = 26, color = "#fff", sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: height * 0.4 }}>
      <LogoMark size={height * 1.35} />
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, letterSpacing: "-.03em", fontSize: height, color }}>
          Finesse<span style={{ color: "#EC1C7B" }}>Wins</span>
        </div>
        {sub && (
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: height * 0.28, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.35)", marginTop: height * 0.14 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

export default Logo
