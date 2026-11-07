import { useTranslation } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'

export function RecordingControl({
  active,
  messageKey,
  onStop,
  compact = false,
  showStatus = true,
}: {
  active: boolean
  messageKey?: TranslationKey | null
  onStop: () => void
  compact?: boolean
  showStatus?: boolean
}) {
  const { t } = useTranslation()

  if (!active && !messageKey) return null

  const activeLabel = t('recording.active')
  const status = active ? activeLabel : messageKey ? t(messageKey) : null

  return (
    <div className={`recording-control${compact ? ' recording-control-compact' : ''}`}>
      {showStatus && status ? <p role="status" aria-live="polite">{status}</p> : null}
      {active ? (
        <button
          type="button"
          className="recording-stop-button"
          onClick={onStop}
        >
          {t('recording.stop')}
        </button>
      ) : null}
    </div>
  )
}
