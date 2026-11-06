import { useEffect, useRef, useState } from 'react'
import { formatDegrees } from '../../domain/format'
import {
  createWindInstrumentState,
  stepWindInstrument,
  type WindInstrumentOutput,
} from '../../domain/windShiftInstrument'
import type { CourseState, FilteredGpsReading } from '../../types'
import { useTranslation } from '../../i18n/LanguageContext'

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

export function useWindShiftInstrumentOutput(
  course: CourseState,
  gps: FilteredGpsReading,
  alphaDegrees: number,
): WindInstrumentOutput {
  const stateRef = useRef(emptyOutput.state)
  const [output, setOutput] = useState(emptyOutput)
  const windHeading = course.windHeadingDegrees
  const referenceFrame = course.windMeasurement?.referenceFrame
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
      setOutput((current) => sameVisibleOutput(current, next) ? current : next)
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
    referenceFrame,
    windHeading,
  ])

  return output
}

interface InstrumentProps {
  validReference: boolean
  output: WindInstrumentOutput
}

export function WindShiftDots({ validReference, output }: InstrumentProps) {
  const { t } = useTranslation()

  return (
    <div className="wind-tack-cues">
      <div className="wind-cue-dots header" aria-label={t('sailing.header')}>
        {renderDots(validReference ? output.headerDots : 0)}
      </div>
      <div className="wind-cue-dots lift" aria-label={t('sailing.lift')}>
        {renderDots(validReference ? output.liftDots : 0)}
      </div>
    </div>
  )
}

interface WindShiftScaleProps extends InstrumentProps {
  windHeadingDegrees: number | null
}

export function WindShiftScale({ validReference, output, windHeadingDegrees }: WindShiftScaleProps) {
  const { t } = useTranslation()

  return (
    <div className="wind-shift-scale" aria-label={t('sailing.windShiftScale')}>
      <span className="wind-shift-origin">{windHeadingDegrees === null ? '—°' : formatDegrees(windHeadingDegrees)}</span>
      <span className="wind-shift-endpoint start">−30°</span>
      <span className="wind-shift-endpoint end">+30°</span>
      <div className="wind-shift-track" aria-hidden="true">
        {[1, 2, 4, 5].map((position) => (
          <span key={position} className="wind-shift-tick" style={{ left: `${position * 100 / 6}%` }} />
        ))}
        <span className="wind-shift-center-tick" />
        {validReference && output.scalePositionDegrees !== null ? (
          <span
            className="wind-shift-marker"
            style={{ left: `${((output.scalePositionDegrees + 30) / 60) * 100}%` }}
          />
        ) : null}
      </div>
    </div>
  )
}

function renderDots(activeCount: number) {
  return [0, 1, 2].map((index) => (
    <span key={index} className={`wind-cue-dot ${index < activeCount ? 'active' : ''}`} />
  ))
}

function sameVisibleOutput(first: WindInstrumentOutput, second: WindInstrumentOutput): boolean {
  return first.liftDots === second.liftDots && first.headerDots === second.headerDots &&
    first.scalePositionDegrees === second.scalePositionDegrees && first.isReferenced === second.isReferenced
}
