export function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360
}

export function shortestAngleDeltaDegrees(a: number, b: number): number {
  const delta = normalizeDegrees(a) - normalizeDegrees(b)

  if (delta > 180) {
    return delta - 360
  }

  if (delta < -180) {
    return delta + 360
  }

  return delta
}

export function averageAnglesDegrees(angles: number[]): number | null {
  if (angles.length === 0) {
    return null
  }

  let sumSin = 0
  let sumCos = 0

  for (const angle of angles) {
    const radians = (normalizeDegrees(angle) * Math.PI) / 180
    sumSin += Math.sin(radians)
    sumCos += Math.cos(radians)
  }

  if (Math.abs(sumSin) < Number.EPSILON && Math.abs(sumCos) < Number.EPSILON) {
    return null
  }

  const meanRadians = Math.atan2(sumSin / angles.length, sumCos / angles.length)
  const meanDegrees = (meanRadians * 180) / Math.PI
  return normalizeDegrees(meanDegrees)
}

export function getCircularSpreadDegrees(angles: number[], meanAngle: number): number | null {
  if (angles.length === 0 || !Number.isFinite(meanAngle)) {
    return null
  }

  const squaredDeltaSum = angles.reduce((sum, angle) => {
    const delta = shortestAngleDeltaDegrees(angle, meanAngle)

    return sum + delta * delta
  }, 0)

  return Math.sqrt(squaredDeltaSum / angles.length)
}
