import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildReplayTimeline,
  clampReplayTime,
  getReplayFrame,
} from '../services/raceReplay'
import type { Race } from '../types'

export type ReplaySpeed = 1 | 2 | 4

export function useRaceReplay({
  race,
  currentReplayTime,
  onCurrentReplayTimeChange,
}: {
  race: Race | null
  currentReplayTime: number
  onCurrentReplayTimeChange: (currentReplayTime: number) => void
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1)
  const timeline = useMemo(() => buildReplayTimeline(race), [race])
  const replayFrame = useMemo(() => (
    getReplayFrame(timeline, currentReplayTime)
  ), [currentReplayTime, timeline])
  const canPlay = timeline.durationSeconds > 0
  const isReplayPlaying = isPlaying && canPlay
  const timelineRef = useRef(timeline)
  const currentReplayTimeRef = useRef(currentReplayTime)
  const replaySpeedRef = useRef(replaySpeed)
  const onCurrentReplayTimeChangeRef = useRef(onCurrentReplayTimeChange)

  useEffect(() => {
    timelineRef.current = timeline
  }, [timeline])

  useEffect(() => {
    currentReplayTimeRef.current = currentReplayTime
  }, [currentReplayTime])

  useEffect(() => {
    replaySpeedRef.current = replaySpeed
  }, [replaySpeed])

  useEffect(() => {
    onCurrentReplayTimeChangeRef.current = onCurrentReplayTimeChange
  }, [onCurrentReplayTimeChange])

  useEffect(() => {
    const clampedReplayTime = clampReplayTime(timeline, currentReplayTime)

    if (clampedReplayTime !== currentReplayTime) {
      onCurrentReplayTimeChange(clampedReplayTime)
    }
  }, [currentReplayTime, onCurrentReplayTimeChange, timeline])

  useEffect(() => {
    if (!isReplayPlaying) {
      return
    }

    let animationFrameId: number | null = null
    let previousTimestamp: number | null = null

    const step = (timestamp: number) => {
      if (previousTimestamp === null) {
        previousTimestamp = timestamp
        animationFrameId = window.requestAnimationFrame(step)
        return
      }

      const deltaSeconds = ((timestamp - previousTimestamp) / 1000) * replaySpeedRef.current
      previousTimestamp = timestamp
      const nextReplayTime = clampReplayTime(
        timelineRef.current,
        currentReplayTimeRef.current + deltaSeconds,
      )

      onCurrentReplayTimeChangeRef.current(nextReplayTime)

      if (nextReplayTime >= timelineRef.current.durationSeconds) {
        setIsPlaying(false)
        return
      }

      animationFrameId = window.requestAnimationFrame(step)
    }

    animationFrameId = window.requestAnimationFrame(step)

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isReplayPlaying])

  const play = useCallback(() => {
    if (!canPlay) {
      return
    }

    if (currentReplayTime >= timeline.durationSeconds) {
      onCurrentReplayTimeChange(0)
    }

    setIsPlaying(true)
  }, [canPlay, currentReplayTime, onCurrentReplayTimeChange, timeline.durationSeconds])

  const pause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const togglePlay = useCallback(() => {
    if (isReplayPlaying) {
      pause()
      return
    }

    play()
  }, [isReplayPlaying, pause, play])

  const reset = useCallback(() => {
    setIsPlaying(false)
    onCurrentReplayTimeChange(0)
  }, [onCurrentReplayTimeChange])

  const seek = useCallback((nextReplayTime: number) => {
    onCurrentReplayTimeChange(clampReplayTime(timelineRef.current, nextReplayTime))
  }, [onCurrentReplayTimeChange])

  return {
    currentReplayTime: clampReplayTime(timeline, currentReplayTime),
    totalDurationSeconds: timeline.durationSeconds,
    samples: timeline.samples,
    replayFrame,
    isPlaying: isReplayPlaying,
    replaySpeed,
    setReplaySpeed,
    play,
    pause,
    togglePlay,
    reset,
    seek,
  }
}
