import { useEffect, useRef, useState } from 'react'
import { formatDegrees } from '../../domain/format'
import {
  createWindInstrumentState,
  stepWindInstrument,
  type WindInstrumentOutput,
} from '../../domain/windShiftInstrument'
import type { CourseState, FilteredGpsReading } from '../../types'
import { useTranslation } from '../../i18n/LanguageContext'

interface WindShiftInstrumentsProps {
  course: CourseState
  gps: FilteredGpsReading
  alphaDegrees: number
}

const emptyOutput: WindInstrumentOutput = {
  state: createWindInstrumentState(),
  liftDots: 0,
  headerDots: 0,
  isReferenced: false,
  estimatedWindHeadingDegrees: null,
  estimatedWindShiftDegrees: null,
  scalePositionDegrees: null,
  courseHeadingDegrees: null,
}

export function WindShiftInstruments({
  course,
  gps,
  alphaDegrees,
}: WindShiftInstrumentsProps) {
  const { t } = useTranslation()
  const stateRef = useRef(emptyOutput.state)
  const [output, setOutput] = useState(emptyOutput)
  const windHeading = course.windHeadingDegrees
  const referenceFrame = course.windMeasurement?.referenceFrame
  const isTrueNorthWind = windHeading !== null && referenceFrame === 'true-north'
  const gpsHeading = gps.displayCourseDegrees

  useEffect(() => {
    const update = () => {
      const next = stepWindInstrument(stateRef.current, {
        nowMs: Date.now(),
        timestamp: gps.presentationTimestamp ?? gps.timestamp,
        courseDegrees: gpsHeading,
        courseReliable: gps.courseReliable,
        windHeadingDegrees: windHeading,
        windReferenceFrame: referenceFrame,
        alphaDegrees,
      })
      stateRef.current = next.state
      setOutput((current) => sameOutput(current, next) ? current : next)
    }

    update()
    if (!gps.courseReliable || gpsHeading === null) return
    const interval = window.setInterval(update, 1_000)
    return () => window.clearInterval(interval)
  }, [
    alphaDegrees,
    gps.courseReliable,
    gps.presentationTimestamp,
    gps.timestamp,
    gpsHeading,
    isTrueNorthWind,
    referenceFrame,
    windHeading,
  ])

  if (!isTrueNorthWind) return null

  return (
    <div className="wind-shift-instruments" aria-label={t('sailing.windShiftInstruments')}>
      <div className="wind-tack-cues">
        <div className="wind-cue-dots lift" aria-label={t('sailing.lift')}>
          {renderDots(output.liftDots)}
        </div>
        <div className="wind-cue-dots header" aria-label={t('sailing.header')}>
          {renderDots(output.headerDots)}
        </div>
      </div>
      <div className="wind-shift-scale" aria-label={t('sailing.windShiftScale')}>
        <span className="wind-shift-origin">{formatDegrees(windHeading)}</span>
        <div className="wind-shift-track" aria-hidden="true">
          <span className="wind-shift-center-tick" />
          {output.scalePositionDegrees !== null ? (
            <span
              className="wind-shift-marker"
              style={{ left: `${((output.scalePositionDegrees + 30) / 60) * 100}%` }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function renderDots(activeCount: number) {
  return [0, 1, 2].map((index) => (
    <span key={index} className={`wind-cue-dot ${index < activeCount ? 'active' : ''}`} />
  ))
}

function sameOutput(first: WindInstrumentOutput, second: WindInstrumentOutput): boolean {
  return first.state === second.state && first.liftDots === second.liftDots &&
    first.headerDots === second.headerDots && first.scalePositionDegrees === second.scalePositionDegrees &&
    first.isReferenced === second.isReferenced
}
