import { useCallback, useState } from 'react'
import { measureWindHeading as measureWindHeadingService } from '../services/sensors/windHeadingService'

export type WindHeadingMeasurementStatus = 'idle' | 'measuring' | 'success' | 'error' | 'unavailable'

interface WindHeadingMeasurementState {
  status: WindHeadingMeasurementStatus
  error: string | null
  measureWindHeading: () => Promise<number | null>
  resetWindHeadingMeasurement: () => void
}

export function useWindHeadingMeasurement(): WindHeadingMeasurementState {
  const [status, setStatus] = useState<WindHeadingMeasurementStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const resetWindHeadingMeasurement = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  const measureWindHeading = useCallback(async () => {
    setStatus('measuring')
    setError(null)

    try {
      const result = await measureWindHeadingService()

      if (!result) {
        setStatus('unavailable')
        setError('Vindmätning saknas')
        return null
      }

      setStatus('success')
      return result.headingDegrees
    } catch (measurementError) {
      setStatus('error')
      setError(measurementError instanceof Error ? measurementError.message : 'Kunde inte mäta vind')
      return null
    }
  }, [])

  return {
    status,
    error,
    measureWindHeading,
    resetWindHeadingMeasurement,
  }
}
