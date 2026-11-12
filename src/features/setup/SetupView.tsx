import { useEffect, useState } from 'react'
import { AccountPanel } from '../../components/AccountPanel'
import { formatSignedDegrees } from '../../domain/format'
import { getGpsStatusDisplay } from '../../domain/gps'
import { formatInstalledAppVersion, getInstalledAppInfo } from '../../services/installedAppInfo'
import {
  clampLaylineAlphaDegrees,
  type CompassDisplayMode,
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
  laylineAlphaDegrees: number
  onLaylineAlphaDegreesChange: (alphaDegrees: number) => void
  compassDisplayMode: CompassDisplayMode
  onCompassDisplayModeChange: (mode: CompassDisplayMode) => void
}

export function SetupView({
  gps,
  attitude,
  rollPitch,
  isCalibrated,
  onCalibrate,
  laylineAlphaDegrees,
  onLaylineAlphaDegreesChange,
  compassDisplayMode,
  onCompassDisplayModeChange,
}: SetupViewProps) {
  const { language, setLanguage, t } = useTranslation()
  const [installedAppVersion, setInstalledAppVersion] = useState<string | null>(null)
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

  useEffect(() => {
    let active = true
    void getInstalledAppInfo().then(info => {
      if (active) setInstalledAppVersion(formatInstalledAppVersion(info))
    })
    return () => { active = false }
  }, [])

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

      <h2 className="setup-section-heading">{t('sailing.windShiftInstruments')}</h2>
      <div className="setup-layline-panel" aria-label={t('setup.alpha')}>
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

      <div className="setup-compass">
        <h2 className="setup-section-heading">{t('setup.compass')}</h2>
        <div className="analysis-segmented-control" role="group" aria-label={t('setup.compass')}>
          <button type="button" className={compassDisplayMode === 'normal' ? 'active' : ''} aria-pressed={compassDisplayMode === 'normal'} onClick={() => onCompassDisplayModeChange('normal')}>{t('setup.compassNormal')}</button>
          <button type="button" className={compassDisplayMode === 'wind-relative' ? 'active' : ''} aria-pressed={compassDisplayMode === 'wind-relative'} onClick={() => onCompassDisplayModeChange('wind-relative')}>{t('setup.compassWindRelative')}</button>
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
      <AccountPanel />
      <section className="setup-about" aria-labelledby="setup-about-heading">
        <h2 className="setup-section-heading" id="setup-about-heading">{t('setup.aboutTitle')}</h2>
        <dl className="setup-about-details">
          <div><dt>{t('setup.aboutProduct')}</dt><dd>TackWise Race</dd></div>
          <div><dt>{t('setup.aboutVersion')}</dt><dd>{installedAppVersion ?? t('setup.aboutVersionUnavailable')}</dd></div>
          <div><dt>{t('setup.aboutTagline')}</dt><dd>Race smarter.</dd></div>
        </dl>
      </section>
    </section>
  )
}
