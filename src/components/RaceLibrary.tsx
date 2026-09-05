import type { Race, SailingDay } from '../types'
import { useTranslation } from '../i18n/LanguageContext'

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
  onExportRace: (race: Race) => Promise<void> | void
  exportingRaceId?: string | null
}

export function RaceLibrary({
  groups,
  selectedRaceId,
  onSelectRace,
  onDeleteRace,
  onRenameRace,
  onToggleFavorite,
  onExportRace,
  exportingRaceId = null,
}: RaceLibraryProps) {
  const { language, t } = useTranslation()
  const raceCount = groups.reduce((count, group) => count + group.races.length, 0)

  if (raceCount === 0) {
    return (
      <div className="race-library-empty">
        <h3>{t('library.emptyTitle')}</h3>
        <p>{t('library.emptyText')}</p>
      </div>
    )
  }

  return (
    <div className="race-library" aria-label={t('analysis.library')}>
      {groups.map((group) => (
        <section key={group.day.id} className="race-day-group" aria-labelledby={`race-day-${group.day.id}`}>
          <div className="race-day-heading">
            <h3 id={`race-day-${group.day.id}`}>{formatDateHeading(group.day.date, language)}</h3>
            <span>{group.races.length} {t('library.races')}</span>
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
                    {race.isFavorite ? <span className="favorite-badge" aria-label={t('library.favorite')}>{t('library.favorite')}</span> : null}
                  </span>
                  <span className="race-card-time">{formatRaceDateTime(race.createdAt, language)}</span>

                  <span className="race-card-stats" aria-label={t('library.values')}>
                    <span>
                      <strong>{formatDuration(race.summary?.durationSeconds)}</strong>
                      <small>{t('common.time')}</small>
                    </span>
                    <span>
                      <strong>{formatDistance(race.summary?.distanceMeters)}</strong>
                      <small>{t('common.distance')}</small>
                    </span>
                    <span>
                      <strong>{formatSpeed(race.summary?.maxSpeedKnots)}</strong>
                      <small>{t('library.max')}</small>
                    </span>
                    <span>
                      <strong>{race.summary?.sampleCount ?? race.samples.length}</strong>
                      <small>{t('common.samples')}</small>
                    </span>
                  </span>
                </button>

                <div className="race-card-actions" aria-label={t('library.actionsFor', { name: race.name })}>
                  <button type="button" onClick={() => onToggleFavorite(race)}>
                    {race.isFavorite ? t('library.unfavorite') : t('library.favorite')}
                  </button>
                  <button type="button" onClick={() => onRenameRace(race)}>
                    {t('library.rename')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onExportRace(race)}
                    disabled={exportingRaceId !== null}
                  >
                    {exportingRaceId === race.id ? t('library.exporting') : t('library.export')}
                  </button>
                  <button type="button" className="danger-action" onClick={() => onDeleteRace(race)}>
                    {t('library.delete')}
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

function formatDateHeading(date: string, language: 'sv' | 'en'): string {
  return new Intl.DateTimeFormat(language === 'sv' ? 'sv-SE' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
}

function formatRaceDateTime(value: string, language: 'sv' | 'en'): string {
  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat(language === 'sv' ? 'sv-SE' : 'en-GB', {
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
