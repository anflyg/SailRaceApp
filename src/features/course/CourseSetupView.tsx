export function CourseSetupView() {
  return (
    <section className="view-section">
      <div className="card-grid">
        <div className="card">
          <h2>Start line</h2>
          <button type="button">Set point A</button>
          <button type="button">Set point B</button>
        </div>

        <div className="card">
          <h2>Marks / gate</h2>
          <button type="button">Set windward mark</button>
          <button type="button">Set leeward mark</button>
        </div>

        <div className="card">
          <h2>Wind</h2>
          <button type="button">Choose wind direction</button>
        </div>
      </div>
      <p className="placeholder-note">
        Placeholder controls for start line, gate and wind direction. GPS and compass input will come later.
      </p>
    </section>
  )
}
