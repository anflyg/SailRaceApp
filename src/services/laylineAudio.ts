let audioContext: AudioContext | null = null

export function playLaylineSignal(): void {
  playTone(980, 0.12, 0.12, 'square')
}

export function playLaylineTick(): void {
  playTone(620, 0.045, 0.08, 'square')
}

function playTone(
  frequencyHz: number,
  durationSeconds: number,
  gainValue: number,
  oscillatorType: OscillatorType,
): void {
  const context = getAudioContext()

  if (!context) {
    return
  }

  const now = context.currentTime
  const oscillator = context.createOscillator()
  const gainNode = context.createGain()

  oscillator.type = oscillatorType
  oscillator.frequency.setValueAtTime(frequencyHz, now)

  gainNode.gain.setValueAtTime(0.0001, now)
  gainNode.gain.exponentialRampToValueAtTime(gainValue, now + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds)

  oscillator.connect(gainNode)
  gainNode.connect(context.destination)

  oscillator.start(now)
  oscillator.stop(now + durationSeconds + 0.02)
}

function getAudioContext(): AudioContext | null {
  if (audioContext) {
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => undefined)
    }

    return audioContext
  }

  const AudioContextConstructor = globalThis.AudioContext ?? (
    globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext

  if (!AudioContextConstructor) {
    return null
  }

  try {
    audioContext = new AudioContextConstructor()
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => undefined)
    }

    return audioContext
  } catch {
    return null
  }
}
