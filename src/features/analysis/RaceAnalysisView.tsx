import { useCallback, useMemo, useState } from 'react'
import { RaceLibrary } from '../../components/RaceLibrary'
import { useRaceReplay, type ReplaySpeed } from '../../hooks/useRaceReplay'
import {
  deleteRace as deleteStoredRace,
  listRacesByDay,
  listSailingDays,
  renameRace,
  toggleFavorite,
} from '../../services/raceStorage'
import type { Race, SailingDay } from '../../types'

type AnalysisSection = 'library' | 'overview' | 'start' | 'graphs' | 'data'

type RaceLibraryGroup = {
  day: SailingDay
  races: Race[]
}

type RaceReplayState = ReturnType<typeof useRaceReplay>

type AnalysisState = {
  activeSection: AnalysisSection
  selectedRaceId: string | null
  currentReplayTime: number
}

const analysisSections: Array<{ id: AnalysisSection; label: string }> = [
  { id: 'library', label: 'Bibliotek' },
  { id: 'overview', label: 'Översikt' },
  { id: 'start', label: 'Start' },
  { id: 'graphs', label: 'Grafer' },
  { id: 'data', label: 'Data' },
]

export function RaceAnalysisView() {
  const [groups, setGroups] = useState(loadRaceGroups)
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    activeSection: 'library',
    selectedRaceId: null,
    currentReplayTime: 0,
  })

  const selectedRace = useMemo(() => {
    for (const group of groups) {
      const race = group.races.find((candidate) => candidate.id === analysisState.selectedRaceId)

      if (race) {
        return race
      }
    }

    return null
  }, [analysisState.selectedRaceId, groups])
  const handleReplayTimeChange = useCallback((currentReplayTime: number) => {
    setAnalysisState((current) => ({
      ...current,
      currentReplayTime,
    }))
  }, [])
  const replay = useRaceReplay({
    race: selectedRace,
    currentReplayTime: analysisState.currentReplayTime,
    onCurrentReplayTimeChange: handleReplayTimeChange,
  })

  const refreshRaceGroups = useCallback((nextSelectedRaceId = analysisState.selectedRaceId) => {
    const nextGroups = loadRaceGroups()
    const selectedRaceStillExists = nextGroups.some((group) => (
      group.races.some((race) => race.id === nextSelectedRaceId)
    ))

    setGroups(nextGroups)

    if (nextSelectedRaceId && !selectedRaceStillExists) {
      setAnalysisState((current) => ({
        ...current,
        activeSection: 'library',
        selectedRaceId: null,
        currentReplayTime: 0,
      }))
    }
  }, [analysisState.selectedRaceId])

  const handleSelectRace = (race: Race) => {
    setAnalysisState({
      activeSection: 'overview',
      selectedRaceId: race.id,
      currentReplayTime: 0,
    })
  }

  const handleDeleteRace = (race: Race) => {
    const shouldDelete = window.confirm(`Radera "${race.name}"? Detta kan inte ångras.`)

    if (!shouldDelete) {
      return
    }

    deleteStoredRace(race.id)
    refreshRaceGroups()
  }

  const handleRenameRace = (race: Race) => {
    const nextName = window.prompt('Nytt namn på race', race.name)

    if (nextName === null || nextName.trim() === '') {
      return
    }

    renameRace(race.id, nextName)

    refreshRaceGroups()
  }

  const handleToggleFavorite = (race: Race) => {
    toggleFavorite(race.id)

    refreshRaceGroups()
  }

  const handleSectionChange = (section: AnalysisSection) => {
    setAnalysisState((current) => ({
      ...current,
      activeSection: section,
    }))
  }

  const isLibraryActive = analysisState.activeSection === 'library'
  const isOverviewActive = analysisState.activeSection === 'overview'

  return (
    <section className="view-section analysis-view">
      <div className="analysis-header">
        <div>
          <p className="analysis-kicker">After action</p>
          <h2>{isLibraryActive ? 'Racebibliotek' : selectedRace?.name ?? 'Raceanalys'}</h2>
        </div>
        <p className="placeholder-note">
          Sparade race kommer senare att skapas automatiskt från startklockan. Välj ett race för
          kommande replay, startanalys, grafer och rådata.
        </p>
      </div>

      <div className="analysis-segmented-control" role="tablist" aria-label="Analysundersidor">
        {analysisSections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={analysisState.activeSection === section.id}
            className={analysisState.activeSection === section.id ? 'active' : ''}
            onClick={() => handleSectionChange(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>

      {isLibraryActive ? (
        <RaceLibrary
          groups={groups}
          selectedRaceId={analysisState.selectedRaceId}
          onSelectRace={handleSelectRace}
          onDeleteRace={handleDeleteRace}
          onRenameRace={handleRenameRace}
          onToggleFavorite={handleToggleFavorite}
        />
      ) : isOverviewActive ? (
        <RaceOverview race={selectedRace} replay={replay} />
      ) : (
        <AnalysisPlaceholder
          section={analysisState.activeSection}
          race={selectedRace}
        />
      )}
    </section>
  )
}

function loadRaceGroups(): RaceLibraryGroup[] {
  return listSailingDays()
    .map((day) => ({
      day,
      races: listRacesByDay(day.date),
    }))
    .filter((group) => group.races.length > 0)
}

function AnalysisPlaceholder({
  section,
  race,
}: {
  section: AnalysisSection
  race: Race | null
}) {
  if (!race) {
    return (
      <div className="analysis-placeholder-panel">
        <h3>Välj race i biblioteket</h3>
        <p>Biblioteket är startpunkten för analys. Övriga undersidor fylls på när replay-systemet kopplas in.</p>
      </div>
    )
  }

  return (
    <div className="analysis-placeholder-panel">
      <div className="analysis-placeholder-heading">
        <div>
          <p className="analysis-kicker">{getSectionLabel(section)}</p>
          <h3>Replay kommer här</h3>
        </div>
        {race.isFavorite ? <span className="favorite-badge">Favorit</span> : null}
      </div>

      <dl className="selected-race-basics">
        <div>
          <dt>Race</dt>
          <dd>{race.name}</dd>
        </div>
        <div>
          <dt>Start</dt>
          <dd>{formatRaceDateTime(race.startGunTime ?? race.createdAt)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{formatDuration(race.summary?.durationSeconds)}</dd>
        </div>
        <div>
          <dt>Distans</dt>
          <dd>{formatDistance(race.summary?.distanceMeters)}</dd>
        </div>
        <div>
          <dt>Maxfart</dt>
          <dd>{formatSpeed(race.summary?.maxSpeedKnots)}</dd>
        </div>
        <div>
          <dt>Samples</dt>
          <dd>{race.summary?.sampleCount ?? race.samples.length}</dd>
        </div>
      </dl>
    </div>
  )
}

function RaceOverview({
  race,
  replay,
}: {
  race: Race | null
  replay: RaceReplayState
}) {
  if (!race) {
    return (
      <div className="analysis-placeholder-panel">
        <h3>Välj race i biblioteket</h3>
        <p>Översikt kräver ett valt race. Gå till Bibliotek och öppna ett sparat race.</p>
      </div>
    )
  }

  if (race.samples.length === 0) {
    return (
      <div className="analysis-placeholder-panel">
        <div className="analysis-placeholder-heading">
          <div>
            <p className="analysis-kicker">Översikt</p>
            <h3>{race.name}</h3>
          </div>
          {race.isFavorite ? <span className="favorite-badge">Favorit</span> : null}
        </div>
        <p>Inga datapunkter finns för detta race ännu.</p>
      </div>
    )
  }

  const currentSample = replay.replayFrame?.sample ?? null

  return (
    <div className="race-overview-panel">
      <div className="replay-control-bar">
        <button type="button" className="primary-button replay-play-button" onClick={replay.togglePlay}>
          {replay.isPlaying ? 'Paus' : 'Spela'}
        </button>

        <button type="button" className="secondary-button replay-reset-button" onClick={replay.reset}>
          Reset
        </button>

        <div className="replay-speed-control" aria-label="Replayhastighet">
          {[1, 2, 4].map((speed) => (
            <button
              key={speed}
              type="button"
              className={replay.replaySpeed === speed ? 'active' : ''}
              onClick={() => replay.setReplaySpeed(speed as ReplaySpeed)}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      <div className="replay-timeline">
        <div className="replay-time-row">
          <span>{formatDuration(replay.currentReplayTime)}</span>
          <span>{formatDuration(replay.totalDurationSeconds)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, replay.totalDurationSeconds)}
          step={0.1}
          value={replay.currentReplayTime}
          onChange={(event) => replay.seek(event.currentTarget.valueAsNumber)}
          aria-label="Replaytid"
        />
      </div>

      <dl className="replay-data-panel">
        <div>
          <dt>Tid</dt>
          <dd>{formatDuration(replay.currentReplayTime)}</dd>
        </div>
        <div>
          <dt>Fart</dt>
          <dd>{formatSpeed(currentSample?.speedKnots)}</dd>
        </div>
        <div>
          <dt>Kurs/COG</dt>
          <dd>{formatDegrees(currentSample?.cogDegrees)}</dd>
        </div>
        <div>
          <dt>VMG bana</dt>
          <dd>{formatSignedSpeed(currentSample?.vmgCourseKnots)}</dd>
        </div>
        <div>
          <dt>VMG vind</dt>
          <dd>{formatSignedSpeed(currentSample?.vmgWindKnots)}</dd>
        </div>
        <div>
          <dt>Lat</dt>
          <dd>{formatCoordinate(currentSample?.latitude)}</dd>
        </div>
        <div>
          <dt>Lon</dt>
          <dd>{formatCoordinate(currentSample?.longitude)}</dd>
        </div>
        <div>
          <dt>GPS</dt>
          <dd>{formatAccuracy(currentSample?.accuracy)}</dd>
        </div>
      </dl>

      <p className="replay-sample-status">
        {replay.replayFrame?.interpolationMode === 'interpolated'
          ? 'Interpolerad datapunkt'
          : replay.replayFrame?.interpolationMode === 'nearest'
            ? 'Närmaste datapunkt'
            : 'Exakt datapunkt'}
      </p>
    </div>
  )
}

function getSectionLabel(section: AnalysisSection): string {
  return analysisSections.find((candidate) => candidate.id === section)?.label ?? 'Översikt'
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

function formatSignedSpeed(speedKnots: number | undefined): string {
  if (speedKnots === undefined) {
    return '--'
  }

  const sign = speedKnots > 0 ? '+' : ''

  return `${sign}${speedKnots.toFixed(1).replace('.', ',')} kn`
}

function formatDegrees(degrees: number | undefined): string {
  if (degrees === undefined) {
    return '--'
  }

  const normalizedDegrees = Math.round(((degrees % 360) + 360) % 360)

  return `${normalizedDegrees.toString().padStart(3, '0')}°`
}

function formatCoordinate(value: number | undefined): string {
  if (value === undefined) {
    return '--'
  }

  return value.toFixed(6)
}

function formatAccuracy(value: number | undefined): string {
  if (value === undefined) {
    return '--'
  }

  return `±${value.toFixed(1).replace('.', ',')} m`
}
