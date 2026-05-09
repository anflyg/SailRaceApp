export function RaceDashboardView() {
  return (
    <section className="view-section">
      <div className="dashboard-grid">
        <div className="metric-card">
          <span className="metric-label">Speed</span>
          <span className="metric-value">12.3 kn</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Heading</span>
          <span className="metric-value">075°</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">VMG</span>
          <span className="metric-value">7.8 kn</span>
        </div>
      </div>
      <p className="placeholder-note">
        Speed, heading and VMG are placeholder values for later live sensor integration.
      </p>
    </section>
  )
}
