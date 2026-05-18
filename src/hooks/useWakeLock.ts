import { useEffect } from 'react'
import { disableWakeLock, enableWakeLock } from '../services/sensors/wakeLockService'

export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return
    }

    void enableWakeLock()

    return () => {
      void disableWakeLock()
    }
  }, [enabled])
}
