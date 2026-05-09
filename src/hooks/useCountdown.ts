import { useCallback, useEffect, useState } from 'react'

type CountdownStatus = 'stopped' | 'running' | 'paused'

export function useCountdown(initialSeconds = 300) {
  const [seconds, setSeconds] = useState(initialSeconds)
  const [status, setStatus] = useState<CountdownStatus>('stopped')

  useEffect(() => {
    if (status !== 'running') {
      return
    }

    const interval = window.setInterval(() => {
      setSeconds((current) => current - 1)
    }, 1000)

    return () => window.clearInterval(interval)
  }, [status])

  const start = useCallback(() => setStatus('running'), [])
  const pause = useCallback(() => setStatus('paused'), [])
  const toggle = useCallback(
    () => setStatus((current) => (current === 'running' ? 'paused' : 'running')),
    [],
  )

  const reset = useCallback(
    (value = initialSeconds) => {
      setSeconds(value)
      setStatus('stopped')
    },
    [initialSeconds],
  )

  return {
    seconds,
    status,
    start,
    pause,
    toggle,
    reset,
    setSeconds,
  }
}
