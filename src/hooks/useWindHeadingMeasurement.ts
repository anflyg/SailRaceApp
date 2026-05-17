import { useCallback, useState } from 'react'
import {
  WindHeadingMeasurementError,
  measureWindHeading as measureWindHeadingService,
  type WindHeadingMeasurementResult,
} from '../services/sensors/windHeadingService'

export type WindHeadingMeasurementStatus =
  | 'idle'
  | 'measuring'
  | 'success'
  | 'error'
  | 'unavailable'
  | 'unstable'

interface WindHeadingMeasurementState {
  status: WindHeadingMeasurementStatus
  error: string | null
  lastMeasurement: WindHeadingMeasurementResult | null
  measureWindHeading: () => Promise<WindHeadingMeasurementResult | null>
  resetWindHeadingMeasurement: () => void
}

export function useWindHeadingMeasurement(): WindHeadingMeasurementState {
  const [status, setStatus] = useState<WindHeadingMeasurementStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastMeasurement, setLastMeasurement] = useState<WindHeadingMeasurementResult | null>(null)

  const resetWindHeadingMeasurement = useCallback(() => {
    setStatus('idle')
    setError(null)
    setLastMeasurement(null)
  }, [])

  const measureWindHeading = useCallback(async () => {
    setStatus('measuring')
    setError(null)
    setLastMeasurement(null)

    try {
      const result = await measureWindHeadingService()

      if (!result) {
        setStatus('unavailable')
        setError('Kunde inte mäta vind')
        return null
      }

      setStatus('success')
      setLastMeasurement(result)
      return result
    } catch (measurementError) {
      if (measurementError instanceof WindHeadingMeasurementError) {
        if (measurementError.reason === 'unstable') {
          setStatus('unstable')
          setError(measurementError.message)
          setLastMeasurement(measurementError.result)
          return null
        }

        setStatus('error')
        setError(measurementError.message)
        return null
      }

      setStatus('error')
      setError(measurementError instanceof Error ? measurementError.message : 'Kunde inte mäta vind')
      return null
    }
  }, [])

  return {
    status,
    error,
    lastMeasurement,
    measureWindHeading,
    resetWindHeadingMeasurement,
  }
}
