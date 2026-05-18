import { KeepAwake } from '@capacitor-community/keep-awake'
import { Capacitor } from '@capacitor/core'

export async function enableWakeLock(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false
  }

  try {
    await KeepAwake.keepAwake()
    return true
  } catch (wakeLockError) {
    console.warn('Could not enable wake lock', wakeLockError)
    return false
  }
}

export async function disableWakeLock(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false
  }

  try {
    await KeepAwake.allowSleep()
    return true
  } catch (wakeLockError) {
    console.warn('Could not disable wake lock', wakeLockError)
    return false
  }
}
