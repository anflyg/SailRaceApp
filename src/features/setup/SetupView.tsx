import { formatDegrees, formatKnots, formatSignedDegrees } from '../../domain/format'
import { getGpsStatusDisplay } from '../../domain/gps'
import { clampLaylineAlphaDegrees } from '../../services/appSettingsStorage'
import {
  MAX_LAYLINE_ALPHA_DEGREES,
  MIN_LAYLINE_ALPHA_DEGREES,
} from '../../types'
import type {
  DeviceAttitudeReading,
  FilteredGpsReading,
  LiveGpsReading,
  RollPitchValues,
} from '../../types'

interface SetupViewProps {
  gps: LiveGpsReading
  filteredGps: FilteredGpsReading
  attitude: DeviceAttitudeReading
  rollPitch: RollPitchValues | null
  isCalibrated: boolean
  onCalibrate: () => void
  laylineEnabled: boolean
  laylineAlphaDegrees: number
  onLaylineEnabledChange: (enabled: boolean) => void
  onLaylineAlphaDegreesChange: (alphaDegrees: number) => void
}

function sensorStatusLabel(isAvailable: boolean): string {
  return isAvailable ? 'OK' : 'SAKNAS'
}

export function SetupView({
  gps,
  filteredGps,
  attitude,
  rollPitch,
  isCalibrated,
  onCalibrate,
  laylineEnabled,
  laylineAlphaDegrees,
  onLaylineEnabledChange,
  onLaylineAlphaDegreesChange,
}: SetupViewProps) {
  const gpsStatus = getGpsStatusDisplay(gps)
  const gpsStatusText = gpsStatus.statusText ?? 'OK'
  const speedLabel = filteredGps.speedKnots !== null ? `${formatKnots(filteredGps.speedKnots)} kn` : '—'
  const courseLabel = filteredGps.courseReliable && filteredGps.courseDegrees !== null
    ? formatDegrees(filteredGps.courseDegrees)
    : '—'
  const canCalibrate = attitude.rollDegrees !== null && attitude.pitchDegrees !== null

  return (
    <section className="view-section setup-view">
      <h1 className="setup-title">SETUP</h1>

      <div className="setup-status-grid">
        <span>GPS</span>
        <span>{gpsStatus.label.replace('GPS ', '')}</span>
        <span>{gpsStatusText}</span>

        <span>Fart</span>
        <span>{speedLabel}</span>
        <span />

        <span>COG</span>
        <span>{courseLabel}</span>
        <span />

        <span>Motion</span>
        <span />
        <span>{sensorStatusLabel(attitude.motionAvailable)}</span>

        <span>Heading</span>
        <span />
        <span>{sensorStatusLabel(attitude.headingAvailable)}</span>
      </div>

      <div className="setup-calibration-panel">
        <div className="setup-roll-pitch">
          <span>R {rollPitch ? formatSignedDegrees(rollPitch.rollDegrees) : '—'}</span>
          <span>S {rollPitch ? formatSignedDegrees(rollPitch.pitchDegrees) : '—'}</span>
        </div>
        <p className={`setup-calibration-status ${isCalibrated ? 'calibrated' : ''}`}>
          {isCalibrated ? 'Kalibrerad' : 'Ej kalibrerad'}
        </p>
      </div>

      <button
        type="button"
        className="primary-button setup-calibrate-button"
        onClick={onCalibrate}
        disabled={!canCalibrate}
      >
        Kalibrera nolläge
      </button>

      <div className="setup-layline-panel" aria-label="Layline-inställningar">
        <div className="setup-layline-header">
          <h2>Layline</h2>
          <button
            type="button"
            className={`setup-layline-toggle ${laylineEnabled ? 'enabled' : 'disabled'}`}
            onClick={() => onLaylineEnabledChange(!laylineEnabled)}
            aria-pressed={laylineEnabled}
          >
            {laylineEnabled ? 'På' : 'Av'}
          </button>
        </div>

        <div className="setup-layline-alpha-row">
          <span>Alpha</span>
          <div className="setup-layline-alpha-control">
            <button
              type="button"
              aria-label="Minska alpha"
              onClick={() => onLaylineAlphaDegreesChange(
                clampLaylineAlphaDegrees(laylineAlphaDegrees - 1),
              )}
              disabled={laylineAlphaDegrees <= MIN_LAYLINE_ALPHA_DEGREES}
            >
              −
            </button>
            <strong>{laylineAlphaDegrees}°</strong>
            <button
              type="button"
              aria-label="Öka alpha"
              onClick={() => onLaylineAlphaDegreesChange(
                clampLaylineAlphaDegrees(laylineAlphaDegrees + 1),
              )}
              disabled={laylineAlphaDegrees >= MAX_LAYLINE_ALPHA_DEGREES}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
