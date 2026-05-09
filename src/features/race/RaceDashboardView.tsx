export function RaceDashboardView() {
  return (
    <section className="view-section race-view">
      <div className="race-dashboard-grid">
        <div className="metric-card" aria-label="Fart">
          <span className="metric-label">Fart</span>
          <span className="metric-value">6,3 kn</span>
        </div>
        <div className="metric-card" aria-label="Riktning">
          <span className="metric-label">Riktning</span>
          <span className="metric-value">097°</span>
        </div>
        <div className="metric-card" aria-label="VMG">
          <span className="metric-label">VMG</span>
          <span className="metric-value">6,7 kn</span>
        </div>
      </div>
      <p className="placeholder-note">
        Instrumentlayout med fart, riktning och VMG. Sann sensorlogik kommer i nästa version.
      </p>
    </section>
  )
}
