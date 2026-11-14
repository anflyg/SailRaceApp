import { useEffect, useState } from 'react'
import { getDeviceAttitude, stopDeviceAttitude } from '../services/sensors/deviceMotionService'
import type { DeviceAttitudeReading } from '../types'

const DEVICE_ATTITUDE_INTERVAL_MS = 750

const initialAttitude: DeviceAttitudeReading = {
  status: 'idle',
  error: null,
  rollDegrees: null,
  pitchDegrees: null,
  motionAvailable: false,
  headingAvailable: false,
  timestamp: null,
}

export function useDeviceAttitude(enabled = true): DeviceAttitudeReading {
  const [attitude, setAttitude] = useState<DeviceAttitudeReading>(initialAttitude)

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false

    const updateAttitude = async () => {
      const nextAttitude = await getDeviceAttitude()

      if (!cancelled) {
        setAttitude(nextAttitude)
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void updateAttitude()
      else void stopDeviceAttitude()
    }
    document.addEventListener('visibilitychange', onVisibility)
    onVisibility()
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void updateAttitude()
    }, DEVICE_ATTITUDE_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
      void stopDeviceAttitude()
    }
  }, [enabled])

  return enabled ? attitude : initialAttitude
}
