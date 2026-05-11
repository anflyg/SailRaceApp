import { Capacitor, registerPlugin } from '@capacitor/core'
import type { DeviceAttitudeReading } from '../../types'

interface NativeDeviceAttitudeSample {
  valid?: boolean
  motionAvailable?: boolean
  headingAvailable?: boolean
  rollDegrees?: number | null
  pitchDegrees?: number | null
  timestamp?: number | null
}

interface DeviceMotionNativePlugin {
  getDeviceAttitude(): Promise<NativeDeviceAttitudeSample>
  stopBackVectorHeading(): Promise<void>
}

const DeviceMotionNative = registerPlugin<DeviceMotionNativePlugin>('WindHeading')

const unavailableReading: DeviceAttitudeReading = {
  status: 'unavailable',
  error: 'Motion saknas.',
  rollDegrees: null,
  pitchDegrees: null,
  motionAvailable: false,
  headingAvailable: false,
  timestamp: null,
}

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function getDeviceAttitude(): Promise<DeviceAttitudeReading> {
  if (!Capacitor.isNativePlatform()) {
    return unavailableReading
  }

  try {
    const sample = await DeviceMotionNative.getDeviceAttitude()
    const rollDegrees = finiteNumberOrNull(sample.rollDegrees)
    const pitchDegrees = finiteNumberOrNull(sample.pitchDegrees)
    const motionAvailable = sample.valid !== false && sample.motionAvailable === true

    if (!motionAvailable || rollDegrees === null || pitchDegrees === null) {
      return unavailableReading
    }

    return {
      status: 'watching',
      error: null,
      rollDegrees,
      pitchDegrees,
      motionAvailable: true,
      headingAvailable: sample.headingAvailable === true,
      timestamp: finiteNumberOrNull(sample.timestamp) ?? Date.now(),
    }
  } catch (error) {
    return {
      ...unavailableReading,
      status: 'error',
      error: error instanceof Error ? error.message : 'Motion saknas.',
    }
  }
}

export async function stopDeviceAttitude(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return
  }

  await DeviceMotionNative.stopBackVectorHeading().catch(() => undefined)
}
