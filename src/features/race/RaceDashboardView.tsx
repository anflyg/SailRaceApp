export function RaceDashboardView() {
  return (
    <section className="view-section race-view">
      <div className="race-grid">
        <div className="metric-box" aria-label="Fart">
          <span className="metric-value">6,3 kn</span>
          <span className="metric-label">Fart</span>
        </div>

        <div className="metric-box" aria-label="Riktning">
          <span className="metric-value">097°</span>
          <span className="metric-label">Riktning</span>
        </div>

        <div className="metric-box" aria-label="VMG">
          <span className="metric-value">6,7 kn</span>
          <span className="metric-label">VMG</span>
        </div>
      </div>
    </section>
  )
}
