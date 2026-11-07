import { useEffect, useId, useRef } from 'react'
import { useTranslation } from '../i18n/LanguageContext'

export function EndRaceDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    cancelRef.current?.focus()
    return () => { if (dialog.open) dialog.close() }
  }, [])

  return (
    <dialog ref={dialogRef} className="end-race-dialog" aria-label={t('recording.stop')} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onCancel() }}>
      <p id={descriptionId}>{t('recording.confirmStop')}</p>
      <div className="end-race-dialog-actions">
        <button ref={cancelRef} type="button" onClick={onCancel}>{t('recording.cancel')}</button>
        <button type="button" className="recording-stop-button" onClick={onConfirm}>{t('recording.stop')}</button>
      </div>
    </dialog>
  )
}
