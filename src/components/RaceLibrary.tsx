import type { Race, SailingDay } from '../types'

type RaceLibraryGroup = {
  day: SailingDay
  races: Race[]
}

interface RaceLibraryProps {
  groups: RaceLibraryGroup[]
  selectedRaceId: string | null
  onSelectRace: (race: Race) => void
  onDeleteRace: (race: Race) => void
  onRenameRace: (race: Race) => void
  onToggleFavorite: (race: Race) => void
}

export function RaceLibrary({
  groups,
  selectedRaceId,
  onSelectRace,
  onDeleteRace,
  onRenameRace,
  onToggleFavorite,
}: RaceLibraryProps) {
  const raceCount = groups.reduce((count, group) => count + group.races.length, 0)

  if (raceCount === 0) {
    return (
      <div className="race-library-empty">
        <h3>Inga race sparade ännu</h3>
        <p>
          När race recording kopplas till startklockan kommer avslutade race att sparas automatiskt
          och dyka upp här för analys.
        </p>
      </div>
    )
  }

  return (
    <div className="race-library" aria-label="Racebibliotek">
      {groups.map((group) => (
        <section key={group.day.id} className="race-day-group" aria-labelledby={`race-day-${group.day.id}`}>
          <div className="race-day-heading">
            <h3 id={`race-day-${group.day.id}`}>{formatDateHeading(group.day.date)}</h3>
            <span>{group.races.length} race</span>
          </div>

          <div className="race-card-list">
            {group.races.map((race) => (
              <article
                key={race.id}
                className={`race-library-card ${selectedRaceId === race.id ? 'selected' : ''}`}
              >
                <button
                  type="button"
                  className="race-card-main"
                  onClick={() => onSelectRace(race)}
                  aria-pressed={selectedRaceId === race.id}
                >
                  <span className="race-card-title-row">
                    <span className="race-card-name">{race.name}</span>
                    {race.isFavorite ? <span className="favorite-badge" aria-label="Favorit">Favorit</span> : null}
                  </span>
                  <span className="race-card-time">{formatRaceDateTime(race.createdAt)}</span>

                  <span className="race-card-stats" aria-label="Racevärden">
                    <span>
                      <strong>{formatDuration(race.summary?.durationSeconds)}</strong>
                      <small>Tid</small>
                    </span>
                    <span>
                      <strong>{formatDistance(race.summary?.distanceMeters)}</strong>
                      <small>Distans</small>
                    </span>
                    <span>
                      <strong>{formatSpeed(race.summary?.maxSpeedKnots)}</strong>
                      <small>Max</small>
                    </span>
                    <span>
                      <strong>{race.summary?.sampleCount ?? race.samples.length}</strong>
                      <small>Samples</small>
                    </span>
                  </span>
                </button>

                <div className="race-card-actions" aria-label={`Åtgärder för ${race.name}`}>
                  <button type="button" onClick={() => onToggleFavorite(race)}>
                    {race.isFavorite ? 'Avfavorit' : 'Favorit'}
                  </button>
                  <button type="button" onClick={() => onRenameRace(race)}>
                    Döp om
                  </button>
                  <button type="button" className="danger-action" onClick={() => onDeleteRace(race)}>
                    Radera
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function formatDateHeading(date: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
}

function formatRaceDateTime(value: string): string {
  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return 'Okänd tid'
  }

  return new Intl.DateTimeFormat('sv-SE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDuration(durationSeconds: number | undefined): string {
  if (durationSeconds === undefined) {
    return '--'
  }

  const totalSeconds = Math.max(0, Math.round(durationSeconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatDistance(distanceMeters: number | undefined): string {
  if (distanceMeters === undefined) {
    return '--'
  }

  if (distanceMeters >= 1852) {
    return `${(distanceMeters / 1852).toFixed(1).replace('.', ',')} NM`
  }

  return `${Math.round(distanceMeters)} m`
}

function formatSpeed(speedKnots: number | undefined): string {
  if (speedKnots === undefined) {
    return '--'
  }

  return `${speedKnots.toFixed(1).replace('.', ',')} kn`
}
