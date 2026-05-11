import { useEffect, useState } from 'react'
import { getDeviceAttitude, stopDeviceAttitude } from '../services/sensors/deviceMotionService'
import type { DeviceAttitudeReading } from '../types'

const DEVICE_ATTITUDE_INTERVAL_MS = 750

const initialAttitude: DeviceAttitudeReading = {
  status: 'idle',
  error: null,
  heelDegrees: null,
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

    void updateAttitude()
    const intervalId = window.setInterval(() => {
      void updateAttitude()
    }, DEVICE_ATTITUDE_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      void stopDeviceAttitude()
    }
  }, [enabled])

  return enabled ? attitude : initialAttitude
}
