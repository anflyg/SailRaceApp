import { useEffect, useId, useRef } from 'react'
import { useTranslation } from '../i18n/LanguageContext'

export function RaceRecoveryDialog({ onContinue, onEnd }: { onContinue: () => void; onEnd: () => void }) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const descriptionId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [])
  return (
    <dialog ref={dialogRef} className="end-race-dialog" aria-label={t('recording.recoveryTitle')}
      aria-describedby={descriptionId} onCancel={(event) => event.preventDefault()}>
      <p id={descriptionId}>{t('recording.recoveryMessage')}</p>
      <div className="end-race-dialog-actions">
        <button type="button" onClick={onContinue}>{t('recording.continue')}</button>
        <button type="button" onClick={onEnd}>{t('recording.endAndSave')}</button>
      </div>
    </dialog>
  )
}
