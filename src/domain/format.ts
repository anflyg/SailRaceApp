import { normalizeDegrees } from './angles'

export function formatKnots(value: number): string {
  const clamped = Math.max(0, Math.min(value, 99.9))
  return clamped.toFixed(1).replace('.', ',')
}

export function formatSignedKnots(value: number): string {
  const clamped = Math.max(-99.9, Math.min(value, 99.9))
  return clamped.toFixed(1).replace('.', ',')
}

export function formatDegrees(value: number): string {
  const rounded = Math.round(normalizeDegrees(value)) % 360
  return `${rounded.toString().padStart(3, '0')}°`
}

export function formatSignedDegrees(value: number): string {
  const rounded = Math.round(value)
  return `${rounded >= 0 ? '+' : ''}${rounded}°`
}

export function formatMeters(value: number): string {
  return value.toFixed(1).replace('.', ',')
}
