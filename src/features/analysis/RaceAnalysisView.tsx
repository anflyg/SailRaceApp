import { useMemo, useState } from 'react'

export function RaceAnalysisView() {
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const speedOptions = useMemo(() => [1, 2, 4], [])

  return (
    <section className="view-section analysis-view">
      <div className="analysis-header">
        <h2>Analys kommer senare</h2>
        <p className="placeholder-note">
          Framtida replay kommer att visa båtens rörelse, fart och vinklar under loppet.
        </p>
      </div>

      <div className="analysis-panel">
        <button type="button" className="primary-button">
          Spela / pausa
        </button>
        <div className="playback-controls">
          {speedOptions.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`secondary-button playback-speed ${playbackSpeed === speed ? 'active' : ''}`}
              onClick={() => setPlaybackSpeed(speed)}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
