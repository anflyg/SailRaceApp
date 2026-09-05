import { useCallback, useEffect, useMemo, useState } from 'react'
import { RaceLibrary } from '../../components/RaceLibrary'
import { RaceTrackMap } from '../../components/RaceTrackMap'
import { DEFAULT_RACE_MAP_PAN_OFFSET, type RaceMapPanOffset } from '../../components/raceTrackMapPan'
import { useRaceReplay, type ReplaySpeed } from '../../hooks/useRaceReplay'
import { exportRaceDownloads } from '../../services/raceExport'
import { buildReplayTimeline, getReplayFrame } from '../../services/raceReplay'
import { analyzeRaceStart, type StartAnalysisResult } from '../../services/startAnalysis'
import { calculateRaceLegMetrics, type RaceLegMetricsResult } from '../../services/raceLegMetrics'
import {
  deleteRace as deleteStoredRace,
  createDateKey,
  listRacesByDay,
  listRaces,
  listSailingDays,
  renameRace,
  toggleFavorite,
} from '../../services/raceStorage'
import type { Race, SailingDay } from '../../types'
import { useTranslation } from '../../i18n/LanguageContext'
import type { Translate } from '../../i18n/LanguageContext'

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

const analysisSections: Array<{ id: AnalysisSection; label: 'analysis.library' | 'analysis.overview' | 'navigation.start' | 'analysis.graphs' | 'analysis.data' }> = [
  { id: 'library', label: 'analysis.library' }, { id: 'overview', label: 'analysis.overview' }, { id: 'start', label: 'navigation.start' }, { id: 'graphs', label: 'analysis.graphs' }, { id: 'data', label: 'analysis.data' },
]

export function RaceAnalysisView({ initialRaceId, initialRace }: { initialRaceId?: string; initialRace?: Race } = {}) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState(() => loadRaceGroups(initialRaceId, initialRace))
  const [exportingRaceId, setExportingRaceId] = useState<string | null>(null)
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    activeSection: initialRaceId ? 'overview' : 'library',
    selectedRaceId: initialRaceId ?? null,
    ghostRaceId: null,
    currentReplayTime: 0,
  })
  useEffect(() => {
    if (!initialRaceId) return
    setGroups(loadRaceGroups(initialRaceId, initialRace))
  }, [initialRace, initialRaceId])
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
    const shouldDelete = window.confirm(t('dialog.deleteRace', { name: race.name }))

    if (!shouldDelete) {
      return
    }

    deleteStoredRace(race.id)
    refreshRaceGroups()
  }

  const handleRenameRace = (race: Race) => {
    const nextName = window.prompt(t('dialog.renameRace'), race.name)

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
      await exportRaceDownloads(race, { text: t('export.shareText'), dialogTitle: t('export.dialogTitle') })
    } catch {
      window.alert(t('dialog.exportFailed'))
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
      <div className="analysis-segmented-control" role="tablist" aria-label={t('analysis.tabs')}>
        {analysisSections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={analysisState.activeSection === section.id}
            className={analysisState.activeSection === section.id ? 'active' : ''}
            onClick={() => handleSectionChange(section.id)}
          >
            {t(section.label)}
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
  const { language, t } = useTranslation()
  const startAnalysis = useMemo(() => (
    race ? analyzeRaceStart(race) : null
  ), [race])

  if (!race || !startAnalysis) {
    return (
      <div className="analysis-placeholder-panel">
        <h3>{t('analysis.selectRace')}</h3>
        <p>{t('analysis.startRequiresRace')}</p>
      </div>
    )
  }

  const resultText = getStartResultText(startAnalysis, t)
  const statusMessage = getStartStatusMessage(startAnalysis.status, t)
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
        <p className="analysis-kicker">{t('analysis.result')}</p>
        <h3>{resultText}</h3>
        <p>{statusMessage}</p>
      </div>

      <dl className="start-analysis-grid">
        <div>
          <dt>{t('analysis.startGun')}</dt>
          <dd>{formatRaceDateTime(startAnalysis.startGunTime, language)}</dd>
        </div>
        <div>
          <dt>{t('analysis.lineCrossed')}</dt>
          <dd>{formatRaceDateTime(startAnalysis.crossingTime, language)}</dd>
        </div>
        <div>
          <dt>{t('analysis.timeToStart')}</dt>
          <dd>{formatStartDelta(startAnalysis.deltaSeconds, t)}</dd>
        </div>
        <div>
          <dt>{t('analysis.speedAtLine')}</dt>
          <dd>{formatSpeed(startAnalysis.crossingSpeedKnots)}</dd>
        </div>
        <div>
          <dt>{t('analysis.courseAtLine')}</dt>
          <dd>{formatDegrees(startAnalysis.crossingCogDegrees)}</dd>
        </div>
        <div>
          <dt>{t('analysis.gpsAccuracy')}</dt>
          <dd>{formatAccuracy(startAnalysis.crossingAccuracyMeters)}</dd>
        </div>
        <div>
          <dt>{t('analysis.timeUncertainty')}</dt>
          <dd>{formatUncertaintySeconds(startAnalysis.uncertaintySeconds)}</dd>
        </div>
        <div>
          <dt>{t('analysis.distanceUncertainty')}</dt>
          <dd>{formatUncertaintyMeters(startAnalysis.uncertaintyMeters)}</dd>
        </div>
      </dl>
    </div>
  )
}

function loadRaceGroups(initialRaceId?: string, initialRace?: Race): RaceLibraryGroup[] {
  const groups = listSailingDays()
    .map((day) => ({
      day,
      races: listRacesByDay(day.date),
    }))
    .filter((group) => group.races.length > 0)

  if (initialRaceId && groups.some((group) => group.races.some((race) => race.id === initialRaceId))) {
    return groups
  }

  const storedInitialRace = initialRace ?? (initialRaceId ? listRaces().find((race) => race.id === initialRaceId) : null)

  return storedInitialRace
    ? [...groups, {
      day: { id: storedInitialRace.dayId, date: createDateKey(storedInitialRace.createdAt), raceIds: [storedInitialRace.id] },
      races: [storedInitialRace],
    }]
    : groups
}

function AnalysisPlaceholder({
  section,
  race,
}: {
  section: AnalysisSection
  race: Race | null
}) {
  const { language, t } = useTranslation()
  if (!race) {
    return (
      <div className="analysis-placeholder-panel">
        <h3>{t('analysis.selectRace')}</h3>
        <p>{t('analysis.libraryStartingPoint')}</p>
      </div>
    )
  }

  return (
    <div className="analysis-placeholder-panel">
      <div className="analysis-placeholder-heading">
        <div>
          <p className="analysis-kicker">{t(analysisSections.find((candidate) => candidate.id === section)?.label ?? 'analysis.overview')}</p>
          <h3>{t('analysis.replayComingSoon')}</h3>
        </div>
        {race.isFavorite ? <span className="favorite-badge">{t('common.favorite')}</span> : null}
      </div>

      <dl className="selected-race-basics">
        <div>
          <dt>{t('analysis.race')}</dt>
          <dd>{race.name}</dd>
        </div>
        <div>
          <dt>{t('navigation.start')}</dt>
          <dd>{formatRaceDateTime(race.startGunTime ?? race.createdAt, language)}</dd>
        </div>
        <div>
          <dt>{t('analysis.duration')}</dt>
          <dd>{formatDuration(race.summary?.durationSeconds)}</dd>
        </div>
        <div>
          <dt>{t('common.distance')}</dt>
          <dd>{formatDistance(race.summary?.distanceMeters)}</dd>
        </div>
        <div>
          <dt>{t('analysis.maxSpeed')}</dt>
          <dd>{formatSpeed(race.summary?.maxSpeedKnots)}</dd>
        </div>
        <div>
          <dt>{t('common.samples')}</dt>
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
  const { language, t } = useTranslation()
  const [isMapExpanded, setIsMapExpanded] = useState(false)
  const [expandedMapZoomScale, setExpandedMapZoomScale] = useState(MAP_MIN_ZOOM)
  const [expandedMapPanOffset, setExpandedMapPanOffset] = useState<RaceMapPanOffset>(DEFAULT_RACE_MAP_PAN_OFFSET)
  const currentSample = replay.replayFrame?.sample ?? null
  const legMetrics = useMemo(() => (
    race ? calculateRaceLegMetrics(race) : null
  ), [race])
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
      label: `${t('analysis.ghost')}: ${ghostRace.name}`,
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
        <h3>{t('analysis.selectRace')}</h3>
        <p>{t('analysis.overviewRequiresRace')}</p>
      </div>
    )
  }

  if (race.samples.length === 0) {
    return (
      <div className="analysis-placeholder-panel">
        <div className="analysis-placeholder-heading">
          <div>
            <p className="analysis-kicker">{t('analysis.overview')}</p>
            <h3>{race.name}</h3>
          </div>
          {race.isFavorite ? <span className="favorite-badge">{t('common.favorite')}</span> : null}
        </div>
        <p>{t('analysis.noSamples')}</p>
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
        activationLabel={t('analysis.openMap')}
      />

      {isMapExpanded ? (
        <div className="race-map-modal" role="dialog" aria-modal="true" aria-label={t('analysis.expandedMap')}>
          <div className="race-map-modal-content">
            <div className="race-map-modal-controls">
              <button type="button" onClick={zoomOut} disabled={expandedMapZoomScale <= MAP_MIN_ZOOM}>−</button>
              <button type="button" onClick={zoomIn} disabled={expandedMapZoomScale >= MAP_MAX_ZOOM}>+</button>
              <button type="button" onClick={resetMapView}>{t('common.reset')}</button>
              <button type="button" className="race-map-modal-close" onClick={closeMap}>{t('common.close')}</button>
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
          <span>{t('analysis.primary')}: {race.name}</span>
          <span>{t('analysis.ghost')}: {ghostRace ? ghostRace.name : t('analysis.noGhost')}</span>
        </div>
        <label>
          <span>{t('analysis.ghostRace')}</span>
          <select
            value={ghostRace?.id ?? ''}
            onChange={(event) => onGhostRaceChange(event.currentTarget.value || null)}
            disabled={ghostOptions.length === 0}
          >
            <option value="">{t('analysis.noGhost')}</option>
            {ghostOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {formatGhostRaceOption(candidate, language)}
              </option>
            ))}
          </select>
        </label>
        {selectedGhostRaceId && !ghostRace ? (
          <p>{t('analysis.ghostMissing')}</p>
        ) : null}
      </div>

      <div className="replay-control-bar">
        <button type="button" className="primary-button replay-play-button" onClick={replay.togglePlay}>
          {replay.isPlaying ? t('analysis.pause') : t('analysis.play')}
        </button>

        <button type="button" className="secondary-button replay-reset-button" onClick={replay.reset}>
          {t('analysis.resetReplay')}
        </button>

        <div className="replay-speed-control" aria-label={t('analysis.replaySpeed')}>
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
          aria-label={t('analysis.replayTime')}
        />
      </div>

      <dl className="replay-data-panel">
        <div>
          <dt>{t('common.time')}</dt>
          <dd>{formatDuration(replay.currentReplayTime)}</dd>
        </div>
        <div>
          <dt>{t('common.speed')}</dt>
          <dd>{formatSpeed(currentSample?.speedKnots)}</dd>
        </div>
        <div>
          <dt>{t('analysis.courseCog')}</dt>
          <dd>{formatDegrees(currentSample?.cogDegrees)}</dd>
        </div>
        <div>
          <dt>{t('sailing.vmgCourse')}</dt>
          <dd>{formatSignedSpeed(currentSample?.vmgCourseKnots)}</dd>
        </div>
        <div>
          <dt>{t('sailing.vmgWind')}</dt>
          <dd>{formatSignedSpeed(currentSample?.vmgWindKnots)}</dd>
        </div>
        <div>
          <dt>{t('analysis.latitude')}</dt>
          <dd>{formatCoordinate(currentSample?.latitude)}</dd>
        </div>
        <div>
          <dt>{t('analysis.longitude')}</dt>
          <dd>{formatCoordinate(currentSample?.longitude)}</dd>
        </div>
        <div>
          <dt>GPS</dt>
          <dd>{formatAccuracy(currentSample?.accuracy)}</dd>
        </div>
      </dl>

      <p className="replay-sample-status">
        {replay.replayFrame?.interpolationMode === 'interpolated'
          ? t('analysis.interpolatedPoint')
          : replay.replayFrame?.interpolationMode === 'nearest'
            ? t('analysis.nearestPoint')
            : t('analysis.exactPoint')}
      </p>

      <RaceLegMetricsSection metrics={legMetrics} />
    </div>
  )
}

function RaceLegMetricsSection({ metrics }: { metrics: RaceLegMetricsResult | null }) {
  const { t } = useTranslation()
  if (!metrics || metrics.legs.length === 0) {
    return <p className="race-leg-analysis-fallback">{t('analysis.legsRequireMarks')}</p>
  }

  return (
    <section className="race-leg-analysis" aria-label={t('analysis.legStats')}>
      <div className="race-leg-analysis-heading">
        <div>
          <p className="analysis-kicker">{t('analysis.legs')}</p>
          <h3>{metrics.totalLegs} {t('analysis.legs').toLowerCase()} · {metrics.upwindCount} {t('analysis.upwind').toLowerCase()} · {metrics.downwindCount} {t('analysis.downwind').toLowerCase()}</h3>
        </div>
        <div className="race-leg-summary">
          {metrics.bestUpwind?.averageVmgWindKnots !== null && metrics.bestUpwind?.averageVmgWindKnots !== undefined ? <span>{t('analysis.bestUpwind')} {formatSpeed(metrics.bestUpwind.averageVmgWindKnots)} VMG</span> : null}
          {metrics.bestDownwind?.averageSpeedKnots !== null && metrics.bestDownwind?.averageSpeedKnots !== undefined ? <span>{t('analysis.bestDownwind')} {formatSpeed(metrics.bestDownwind.averageSpeedKnots)}</span> : null}
        </div>
      </div>
      <div className="race-leg-card-list">
        {metrics.legs.map((leg) => (
          <article key={leg.id} className="race-leg-card">
            <div className="race-leg-card-title">
              <h4>{t(leg.label.kind === 'upwind' ? 'analysis.upwind' : 'analysis.downwind')} {leg.label.number}</h4>
              {leg.isBest ? <span className="race-leg-best-badge">{t('analysis.best')}</span> : null}
            </div>
            <dl>
              <div><dt>{t('common.time')}</dt><dd>{formatDuration(leg.durationSeconds)}</dd></div>
              <div><dt>{t('common.distance')}</dt><dd>{formatDistance(leg.distanceMeters)}</dd></div>
              <div><dt>{t('analysis.averageSpeed')}</dt><dd>{formatNullableSpeed(leg.averageSpeedKnots)}</dd></div>
              {leg.averageVmgWindKnots !== null ? <div><dt>{t('sailing.vmgWind')}</dt><dd>{formatSpeed(leg.averageVmgWindKnots)}</dd></div> : null}
              <div><dt>{t('common.samples')}</dt><dd>{leg.sampleCount}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

function formatRaceDateTime(value: string | undefined, language: 'sv' | 'en'): string {
  if (value === undefined) {
    return '--'
  }

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

function formatGhostRaceOption(race: Race, language: 'sv' | 'en'): string {
  return `${race.name} · ${formatRaceDateTime(race.createdAt, language)}`
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

function formatNullableSpeed(speedKnots: number | null): string {
  return speedKnots === null ? '--' : formatSpeed(speedKnots)
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

function formatStartDelta(deltaSeconds: number | undefined, t: Translate): string {
  if (deltaSeconds === undefined) {
    return '--'
  }

  if (deltaSeconds < 0) {
    return `${formatSignedSeconds(deltaSeconds)} ${t('analysis.early')}`
  }

  if (deltaSeconds > 0) {
    return `${formatSignedSeconds(deltaSeconds)} ${t('analysis.late')}`
  }

  return t('analysis.perfect')
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

function getStartResultText(startAnalysis: StartAnalysisResult, t: Translate): string {
  if (startAnalysis.status !== 'ok' && startAnalysis.status !== 'uncertain') {
    return t('analysis.noStartTime')
  }

  if (startAnalysis.deltaSeconds === undefined) {
    return t('analysis.noStartTime')
  }

  if (startAnalysis.deltaSeconds < 0) {
    return `${formatSignedSeconds(startAnalysis.deltaSeconds)} ${t('analysis.earlyRisk')}`
  }

  if (startAnalysis.deltaSeconds > 0) {
    return `${formatSignedSeconds(startAnalysis.deltaSeconds)} ${t('analysis.late')}`
  }

  return t('analysis.onLine')
}

function getStartStatusMessage(status: StartAnalysisResult['status'], t: Translate): string {
  return {
    ok: t('analysis.startStatusOk'), uncertain: t('analysis.startStatusUncertain'), 'missing-start-line': t('analysis.startLineMissing'), 'missing-start-gun': t('analysis.startGunMissing'), 'not-enough-samples': t('analysis.notEnoughSamples'), 'no-crossing': t('analysis.noCrossing'),
  }[status]
}
