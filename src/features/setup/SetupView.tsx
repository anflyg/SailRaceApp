import { formatDegrees, formatKnots, formatSignedDegrees } from '../../domain/format'
import { getGpsStatusDisplay } from '../../domain/gps'
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
    </section>
  )
}
