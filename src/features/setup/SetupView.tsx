import { formatDegrees, formatKnots, formatSignedDegrees } from '../../domain/format'
import { getGpsStatusDisplay } from '../../domain/gps'
import type {
  DeviceAttitudeReading,
  FilteredGpsReading,
  HeelPitchValues,
  LiveGpsReading,
} from '../../types'

interface SetupViewProps {
  gps: LiveGpsReading
  filteredGps: FilteredGpsReading
  attitude: DeviceAttitudeReading
  heelPitch: HeelPitchValues | null
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
  heelPitch,
  isCalibrated,
  onCalibrate,
}: SetupViewProps) {
  const gpsStatus = getGpsStatusDisplay(gps)
  const gpsStatusText = gpsStatus.statusText ?? 'OK'
  const speedLabel = filteredGps.speedKnots !== null ? `${formatKnots(filteredGps.speedKnots)} kn` : '—'
  const courseLabel = filteredGps.courseReliable && filteredGps.courseDegrees !== null
    ? formatDegrees(filteredGps.courseDegrees)
    : '—'
  const canCalibrate = attitude.heelDegrees !== null && attitude.pitchDegrees !== null

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
        <div className="setup-heel-pitch">
          <span>H {heelPitch ? formatSignedDegrees(heelPitch.heelDegrees) : '—'}</span>
          <span>P {heelPitch ? formatSignedDegrees(heelPitch.pitchDegrees) : '—'}</span>
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
