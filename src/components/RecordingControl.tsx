import { useTranslation } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'

export function confirmRecordingStop(
  message: string,
  onConfirmed: () => void,
  confirm: (message: string) => boolean = window.confirm.bind(window),
): boolean {
  if (!confirm(message)) return false
  onConfirmed()
  return true
}

export function RecordingControl({
  active,
  messageKey,
  onStop,
  compact = false,
}: {
  active: boolean
  messageKey?: TranslationKey | null
  onStop: () => void
  compact?: boolean
}) {
  const { t } = useTranslation()

  if (!active && !messageKey) return null

  const activeLabel = t('recording.active')
  const status = active ? activeLabel : messageKey ? t(messageKey) : null

  return (
    <div className={`recording-control${compact ? ' recording-control-compact' : ''}`}>
      {status ? <p role="status" aria-live="polite">{status}</p> : null}
      {active ? (
        <button
          type="button"
          className="recording-stop-button"
          onClick={() => confirmRecordingStop(t('recording.confirmStop'), onStop)}
        >
          {t('recording.stop')}
        </button>
      ) : null}
    </div>
  )
}
