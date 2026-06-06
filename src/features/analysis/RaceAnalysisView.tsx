import { useCallback, useEffect, useMemo, useState } from 'react'
import { RaceLibrary } from '../../components/RaceLibrary'
import { RaceTrackMap } from '../../components/RaceTrackMap'
import { DEFAULT_RACE_MAP_PAN_OFFSET, type RaceMapPanOffset } from '../../components/raceTrackMapPan'
import { useRaceReplay, type ReplaySpeed } from '../../hooks/useRaceReplay'
import { exportRaceDownloads } from '../../services/raceExport'
import { buildReplayTimeline, getReplayFrame } from '../../services/raceReplay'
import { analyzeRaceStart, type StartAnalysisResult } from '../../services/startAnalysis'
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
  ghostRaceId: string | null
  currentReplayTime: number
}

const MAP_MIN_ZOOM = 1
const MAP_MAX_ZOOM = 4
const MAP_ZOOM_STEP = 0.5

const analysisSections: Array<{ id: AnalysisSection; label: string }> = [
  { id: 'library', label: 'Bibliotek' },
  { id: 'overview', label: 'Översikt' },
  { id: 'start', label: 'Start' },
  { id: 'graphs', label: 'Grafer' },
  { id: 'data', label: 'Data' },
]

export function RaceAnalysisView() {
  const [groups, setGroups] = useState(loadRaceGroups)
  const [exportingRaceId, setExportingRaceId] = useState<string | null>(null)
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    activeSection: 'library',
    selectedRaceId: null,
    ghostRaceId: null,
    currentReplayTime: 0,
  })
  const allRaces = useMemo(() => (
    groups.flatMap((group) => group.races)
  ), [groups])

  const selectedRace = useMemo(() => {
    for (const group of groups) {
      const race = group.races.find((candidate) => candidate.id === analysisState.selectedRaceId)

      if (race) {
        return race
      }
    }

    return null
  }, [analysisState.selectedRaceId, groups])
  const ghostRace = useMemo(() => (
    allRaces.find((race) => race.id === analysisState.ghostRaceId) ?? null
  ), [allRaces, analysisState.ghostRaceId])
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
    const ghostRaceStillExists = nextGroups.some((group) => (
      group.races.some((race) => race.id === analysisState.ghostRaceId)
    ))

    setGroups(nextGroups)

    if (nextSelectedRaceId && !selectedRaceStillExists) {
      setAnalysisState((current) => ({
        ...current,
        activeSection: 'library',
        selectedRaceId: null,
        ghostRaceId: null,
        currentReplayTime: 0,
      }))
      return
    }

    if (analysisState.ghostRaceId && !ghostRaceStillExists) {
      setAnalysisState((current) => ({
        ...current,
        ghostRaceId: null,
      }))
    }
  }, [analysisState.ghostRaceId, analysisState.selectedRaceId])

  const handleSelectRace = (race: Race) => {
    setAnalysisState({
      activeSection: 'overview',
      selectedRaceId: race.id,
      ghostRaceId: analysisState.ghostRaceId === race.id ? null : analysisState.ghostRaceId,
      currentReplayTime: 0,
    })
  }

  const handleGhostRaceChange = (ghostRaceId: string | null) => {
    setAnalysisState((current) => ({
      ...current,
      ghostRaceId: ghostRaceId === current.selectedRaceId ? null : ghostRaceId,
    }))
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

  const handleExportRace = async (race: Race) => {
    setExportingRaceId(race.id)

    try {
      await exportRaceDownloads(race)
    } catch {
      window.alert('Kunde inte exportera race')
    } finally {
      setExportingRaceId(null)
    }
  }

  const handleSectionChange = (section: AnalysisSection) => {
    setAnalysisState((current) => ({
      ...current,
      activeSection: section,
    }))
  }

  const isLibraryActive = analysisState.activeSection === 'library'
  const isOverviewActive = analysisState.activeSection === 'overview'
  const isStartActive = analysisState.activeSection === 'start'

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
          onExportRace={handleExportRace}
          exportingRaceId={exportingRaceId}
        />
      ) : isOverviewActive ? (
        <RaceOverview
          race={selectedRace}
          replay={replay}
          allRaces={allRaces}
          ghostRace={ghostRace?.id === selectedRace?.id ? null : ghostRace}
          selectedGhostRaceId={analysisState.ghostRaceId}
          onGhostRaceChange={handleGhostRaceChange}
        />
      ) : isStartActive ? (
        <StartAnalysisView race={selectedRace} />
      ) : (
        <AnalysisPlaceholder
          section={analysisState.activeSection}
          race={selectedRace}
        />
      )}
    </section>
  )
}

function StartAnalysisView({ race }: { race: Race | null }) {
  const startAnalysis = useMemo(() => (
    race ? analyzeRaceStart(race) : null
  ), [race])

  if (!race || !startAnalysis) {
    return (
      <div className="analysis-placeholder-panel">
        <h3>Välj race i biblioteket</h3>
        <p>Startanalys kräver ett valt race med startlinje, startskott och GPS-spår.</p>
      </div>
    )
  }

  const resultText = getStartResultText(startAnalysis)
  const statusMessage = getStartStatusMessage(startAnalysis.status)
  const canShowMap = race.samples.length > 0

  return (
    <div className="start-analysis-panel">
      {canShowMap ? (
        <RaceTrackMap
          race={race}
          currentPoint={startAnalysis.crossingPoint ?? null}
          highlightPoint={startAnalysis.crossingPoint}
          highlightSegment={startAnalysis.beforeSample && startAnalysis.afterSample
            ? {
              before: startAnalysis.beforeSample,
              after: startAnalysis.afterSample,
            }
            : undefined}
          emphasizeStartLine
        />
      ) : null}

      <div className={`start-analysis-result ${startAnalysis.status}`}>
        <p className="analysis-kicker">Resultat</p>
        <h3>{resultText}</h3>
        <p>{statusMessage}</p>
      </div>

      <dl className="start-analysis-grid">
        <div>
          <dt>Startskott</dt>
          <dd>{formatRaceDateTime(startAnalysis.startGunTime)}</dd>
        </div>
        <div>
          <dt>Linje passerad</dt>
          <dd>{formatRaceDateTime(startAnalysis.crossingTime)}</dd>
        </div>
        <div>
          <dt>Tid mot start</dt>
          <dd>{formatStartDelta(startAnalysis.deltaSeconds)}</dd>
        </div>
        <div>
          <dt>Fart vid linje</dt>
          <dd>{formatSpeed(startAnalysis.crossingSpeedKnots)}</dd>
        </div>
        <div>
          <dt>Kurs vid linje</dt>
          <dd>{formatDegrees(startAnalysis.crossingCogDegrees)}</dd>
        </div>
        <div>
          <dt>GPS accuracy</dt>
          <dd>{formatAccuracy(startAnalysis.crossingAccuracyMeters)}</dd>
        </div>
        <div>
          <dt>Osäkerhet tid</dt>
          <dd>{formatUncertaintySeconds(startAnalysis.uncertaintySeconds)}</dd>
        </div>
        <div>
          <dt>Osäkerhet distans</dt>
          <dd>{formatUncertaintyMeters(startAnalysis.uncertaintyMeters)}</dd>
        </div>
      </dl>
    </div>
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
  allRaces,
  ghostRace,
  selectedGhostRaceId,
  onGhostRaceChange,
}: {
  race: Race | null
  replay: RaceReplayState
  allRaces: Race[]
  ghostRace: Race | null
  selectedGhostRaceId: string | null
  onGhostRaceChange: (ghostRaceId: string | null) => void
}) {
  const [isMapExpanded, setIsMapExpanded] = useState(false)
  const [expandedMapZoomScale, setExpandedMapZoomScale] = useState(MAP_MIN_ZOOM)
  const [expandedMapPanOffset, setExpandedMapPanOffset] = useState<RaceMapPanOffset>(DEFAULT_RACE_MAP_PAN_OFFSET)
  const currentSample = replay.replayFrame?.sample ?? null
  const ghostOptions = useMemo(() => (
    race ? allRaces.filter((candidate) => candidate.id !== race.id) : []
  ), [allRaces, race])
  const ghostTimeline = useMemo(() => (
    buildReplayTimeline(ghostRace)
  ), [ghostRace])
  const ghostFrame = useMemo(() => (
    getReplayFrame(ghostTimeline, replay.currentReplayTime)
  ), [ghostTimeline, replay.currentReplayTime])
  const ghostSample = ghostFrame?.sample ?? null
  const mapTracks = useMemo(() => {
    if (!race) {
      return []
    }

    return [
      {
        id: race.id,
        label: race.name,
        samples: race.samples,
        className: 'primary-track',
      },
      ...(ghostRace ? [{
        id: ghostRace.id,
        label: ghostRace.name,
        samples: ghostRace.samples,
        className: 'ghost-track',
      }] : []),
    ]
  }, [ghostRace, race])
  const ghostMarkers = ghostRace && ghostSample
    ? [{
      id: ghostRace.id,
      point: ghostSample,
      className: 'ghost-boat',
      label: `Ghost: ${ghostRace.name}`,
    }]
    : []
  const openMap = () => {
    setIsMapExpanded(true)
  }
  const closeMap = () => {
    setIsMapExpanded(false)
    resetMapView()
  }
  const zoomIn = () => {
    setExpandedMapZoomScale((currentZoomScale) => (
      Math.min(MAP_MAX_ZOOM, currentZoomScale + MAP_ZOOM_STEP)
    ))
  }
  const zoomOut = () => {
    setExpandedMapZoomScale((currentZoomScale) => (
      Math.max(MAP_MIN_ZOOM, currentZoomScale - MAP_ZOOM_STEP)
    ))
  }
  const resetMapView = () => {
    setExpandedMapZoomScale(MAP_MIN_ZOOM)
    setExpandedMapPanOffset(DEFAULT_RACE_MAP_PAN_OFFSET)
  }

  useEffect(() => {
    if (!isMapExpanded) {
      return
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      closeMap()
    }

    window.addEventListener('keydown', handleEscapeKey)
    return () => window.removeEventListener('keydown', handleEscapeKey)
  }, [isMapExpanded])

  useEffect(() => {
    setIsMapExpanded(false)
    resetMapView()
  }, [race?.id])

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

  return (
    <div className="race-overview-panel">
      <RaceTrackMap
        race={race}
        currentPoint={currentSample}
        currentMarkers={ghostMarkers}
        tracks={mapTracks}
        onActivate={openMap}
        activationLabel="Racekarta, tryck för att förstora"
      />

      {isMapExpanded ? (
        <div className="race-map-modal" role="dialog" aria-modal="true" aria-label="Förstorad racekarta">
          <div className="race-map-modal-content">
            <div className="race-map-modal-controls">
              <button type="button" onClick={zoomOut} disabled={expandedMapZoomScale <= MAP_MIN_ZOOM}>−</button>
              <button type="button" onClick={zoomIn} disabled={expandedMapZoomScale >= MAP_MAX_ZOOM}>+</button>
              <button type="button" onClick={resetMapView}>Återställ vy</button>
              <button type="button" className="race-map-modal-close" onClick={closeMap}>Stäng</button>
            </div>

            <div className="race-map-modal-track">
              <RaceTrackMap
                race={race}
                currentPoint={currentSample}
                currentMarkers={ghostMarkers}
                tracks={mapTracks}
                zoomScale={expandedMapZoomScale}
                panEnabled
                panOffset={expandedMapPanOffset}
                onPanOffsetChange={setExpandedMapPanOffset}
                className="race-track-map-expanded-svg"
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="ghost-replay-panel">
        <div className="ghost-race-labels">
          <span>Huvud: {race.name}</span>
          <span>Ghost: {ghostRace ? ghostRace.name : 'Ingen ghost'}</span>
        </div>
        <label>
          <span>Ghost-race</span>
          <select
            value={ghostRace?.id ?? ''}
            onChange={(event) => onGhostRaceChange(event.currentTarget.value || null)}
            disabled={ghostOptions.length === 0}
          >
            <option value="">Ingen ghost</option>
            {ghostOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {formatGhostRaceOption(candidate)}
              </option>
            ))}
          </select>
        </label>
        {selectedGhostRaceId && !ghostRace ? (
          <p>Valt ghost-race kunde inte hittas.</p>
        ) : null}
      </div>

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

function formatRaceDateTime(value: string | undefined): string {
  if (value === undefined) {
    return '--'
  }

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

function formatGhostRaceOption(race: Race): string {
  return `${race.name} · ${formatRaceDateTime(race.createdAt)}`
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

function formatStartDelta(deltaSeconds: number | undefined): string {
  if (deltaSeconds === undefined) {
    return '--'
  }

  if (deltaSeconds < 0) {
    return `${formatSignedSeconds(deltaSeconds)} tidig`
  }

  if (deltaSeconds > 0) {
    return `${formatSignedSeconds(deltaSeconds)} sen`
  }

  return '0 s perfekt'
}

function formatSignedSeconds(value: number): string {
  const sign = value > 0 ? '+' : ''
  const roundedValue = Math.abs(value % 1) === 0 ? value.toFixed(0) : value.toFixed(1).replace('.', ',')

  return `${sign}${roundedValue} s`
}

function formatUncertaintySeconds(value: number | undefined): string {
  if (value === undefined) {
    return '--'
  }

  return `±${Math.ceil(value)} s`
}

function formatUncertaintyMeters(value: number | undefined): string {
  if (value === undefined) {
    return '--'
  }

  return `±${Math.ceil(value)} m`
}

function getStartResultText(startAnalysis: StartAnalysisResult): string {
  if (startAnalysis.status !== 'ok' && startAnalysis.status !== 'uncertain') {
    return 'Ingen starttid beräknad'
  }

  if (startAnalysis.deltaSeconds === undefined) {
    return 'Ingen starttid beräknad'
  }

  if (startAnalysis.deltaSeconds < 0) {
    return `${formatSignedSeconds(startAnalysis.deltaSeconds)} tidig / risk för tjuvstart`
  }

  if (startAnalysis.deltaSeconds > 0) {
    return `${formatSignedSeconds(startAnalysis.deltaSeconds)} sen`
  }

  return '0 s på linjen'
}

function getStartStatusMessage(status: StartAnalysisResult['status']): string {
  return {
    ok: 'Tydlig linjepassage hittades i startfönstret.',
    uncertain: 'Passagen hittades, men sample-gap eller GPS accuracy gör resultatet osäkert.',
    'missing-start-line': 'Startlinje saknas.',
    'missing-start-gun': 'Startskott saknas.',
    'not-enough-samples': 'För få datapunkter i startfönstret.',
    'no-crossing': 'Ingen tydlig linjepassage hittades.',
  }[status]
}
