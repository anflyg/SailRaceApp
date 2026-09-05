import { formatSignedDegrees } from '../../domain/format'
import { getGpsStatusDisplay } from '../../domain/gps'
import {
  clampLaylineAlphaDegrees,
} from '../../services/appSettingsStorage'
import {
  MAX_LAYLINE_ALPHA_DEGREES,
  MIN_LAYLINE_ALPHA_DEGREES,
} from '../../types'
import { useTranslation } from '../../i18n/LanguageContext'
import type {
  DeviceAttitudeReading,
  LiveGpsReading,
  RollPitchValues,
} from '../../types'

interface SetupViewProps {
  gps: LiveGpsReading
  attitude: DeviceAttitudeReading
  rollPitch: RollPitchValues | null
  isCalibrated: boolean
  onCalibrate: () => void
  laylineEnabled: boolean
  laylineAlphaDegrees: number
  onLaylineEnabledChange: (enabled: boolean) => void
  onLaylineAlphaDegreesChange: (alphaDegrees: number) => void
}

export function SetupView({
  gps,
  attitude,
  rollPitch,
  isCalibrated,
  onCalibrate,
  laylineEnabled,
  laylineAlphaDegrees,
  onLaylineEnabledChange,
  onLaylineAlphaDegreesChange,
}: SetupViewProps) {
  const { language, setLanguage, t } = useTranslation()
  const gpsStatus = getGpsStatusDisplay(gps)
  const canCalibrate = attitude.rollDegrees !== null && attitude.pitchDegrees !== null
  const systemStatusIssues = [
    !gpsStatus.isGood ? t(gpsStatus.status === 'missing' ? 'status.gpsUnavailable' : 'status.gpsUnreliable') : null,
    !attitude.motionAvailable ? t('status.motionUnavailable') : null,
    !attitude.headingAvailable ? t('status.headingUnavailable') : null,
  ].filter((issue): issue is string => issue !== null)
  const systemStatusLabel = systemStatusIssues.length === 0
    ? t('status.allSensorsOk')
    : systemStatusIssues.join(' · ')

  return (
    <section className="view-section setup-view">
      <h2 className="setup-section-heading">{t('setup.calibration')}</h2>
      <div className="setup-calibration-panel">
        <div className="setup-roll-pitch">
          <span>R {rollPitch ? formatSignedDegrees(rollPitch.rollDegrees) : '—'}</span>
          <span>S {rollPitch ? formatSignedDegrees(rollPitch.pitchDegrees) : '—'}</span>
        </div>
        <p className={`setup-calibration-status ${isCalibrated ? 'calibrated' : ''}`}>
          {isCalibrated ? t('setup.calibrated') : t('setup.notCalibrated')}
        </p>
      </div>

      <button
        type="button"
        className="primary-button setup-calibrate-button"
        onClick={onCalibrate}
        disabled={!canCalibrate}
      >
        {t('setup.calibrate')}
      </button>

      <h2 className="setup-section-heading">{t('setup.layline')}</h2>
      <div className="setup-layline-panel" aria-label={t('setup.laylineSettings')}>
        <div className="setup-layline-header">
          <button
            type="button"
            className={`setup-layline-toggle ${laylineEnabled ? 'enabled' : 'disabled'}`}
            onClick={() => onLaylineEnabledChange(!laylineEnabled)}
            aria-pressed={laylineEnabled}
          >
            {laylineEnabled ? t('setup.on') : t('setup.off')}
          </button>
        </div>

        <div className="setup-layline-alpha-row">
          <span>{t('setup.alpha')}</span>
          <div className="setup-layline-alpha-control">
            <button
              type="button"
              aria-label={t('setup.decreaseAlpha')}
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
              aria-label={t('setup.increaseAlpha')}
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

      <div className="setup-language">
        <h2 className="setup-section-heading">{t('setup.language')}</h2>
        <div className="analysis-segmented-control" role="group" aria-label={t('setup.language')}>
          <button type="button" className={language === 'sv' ? 'active' : ''} aria-pressed={language === 'sv'} onClick={() => setLanguage('sv')}>{t('language.swedish')}</button>
          <button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>{t('language.english')}</button>
        </div>
      </div>

      <div className="setup-system-status" aria-live="polite">
        <h2 className="setup-section-heading">{t('setup.status')}</h2>
        <div className="setup-system-status-panel">
          <strong className={systemStatusIssues.length === 0 ? 'ready' : ''}>
            {systemStatusLabel}
          </strong>
        </div>
      </div>
    </section>
  )
}
