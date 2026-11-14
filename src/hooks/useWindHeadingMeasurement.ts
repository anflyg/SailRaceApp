import { useCallback, useState } from 'react'
import {
  WindHeadingMeasurementError,
  measureWindHeading as measureWindHeadingService,
  type WindHeadingMeasurementResult,
  type WindHeadingDiagnostics,
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
  diagnostics: WindHeadingDiagnostics | null
  measureWindHeading: () => Promise<WindHeadingMeasurementResult | null>
  resetWindHeadingMeasurement: () => void
}

export function useWindHeadingMeasurement(): WindHeadingMeasurementState {
  const [status, setStatus] = useState<WindHeadingMeasurementStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastMeasurement, setLastMeasurement] = useState<WindHeadingMeasurementResult | null>(null)
  const [diagnostics, setDiagnostics] = useState<WindHeadingDiagnostics | null>(null)

  const resetWindHeadingMeasurement = useCallback(() => {
    setStatus('idle')
    setError(null)
    setLastMeasurement(null)
    setDiagnostics(null)
  }, [])

  const measureWindHeading = useCallback(async () => {
    setStatus('measuring')
    setError(null)
    setLastMeasurement(null)
    setDiagnostics(null)

    try {
      const result = await measureWindHeadingService(setDiagnostics)

      if (!result) {
        setStatus('unavailable')
        setError('wind_measurement_failed')
        return null
      }

      setStatus('success')
      setLastMeasurement(result)
      return result
    } catch (measurementError) {
      if (measurementError instanceof WindHeadingMeasurementError) {
        setDiagnostics(measurementError.diagnostics)
        if (measurementError.reason === 'unstable') {
          setStatus('unstable')
          setError(measurementError.message)
          setLastMeasurement(measurementError.result)
          return measurementError.result
        }

        setStatus('error')
        setError(measurementError.message)
        return null
      }

      setStatus('error')
      setError(measurementError instanceof Error ? measurementError.message : 'wind_measurement_failed')
      return null
    }
  }, [])

  return {
    status,
    error,
    lastMeasurement,
    diagnostics,
    measureWindHeading,
    resetWindHeadingMeasurement,
  }
}
