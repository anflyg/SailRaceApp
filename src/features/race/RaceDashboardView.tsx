// Format knots value: clamp to 19.9 and use one decimal with comma
function formatKnots(value: number): string {
  const clamped = Math.max(0, Math.min(value, 19.9))
  return clamped.toFixed(1).replace('.', ',')
}

export function RaceDashboardView() {
  // Demo values for now
  const fart = 6.3
  const riktning = 97
  const vmg = 6.7

  return (
    <section className="view-section race-view">
      <div className="race-grid">
        <div className="metric-box" aria-label="Fart">
          <span className="metric-value">{formatKnots(fart)}</span>
          <span className="metric-label">Fart</span>
        </div>

        <div className="metric-box" aria-label="Riktning">
          <span className="metric-value">{riktning.toString().padStart(3, '0')}°</span>
          <span className="metric-label">Riktning</span>
        </div>

        <div className="metric-box" aria-label="VMG">
          <span className="metric-value">{formatKnots(vmg)}</span>
          <span className="metric-label">VMG</span>
        </div>
      </div>
    </section>
  )
}
