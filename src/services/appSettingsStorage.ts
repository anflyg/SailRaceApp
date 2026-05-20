import {
  DEFAULT_LAYLINE_ALPHA_DEGREES,
  MAX_LAYLINE_ALPHA_DEGREES,
  MIN_LAYLINE_ALPHA_DEGREES,
  type LaylineSettings,
} from '../types'

const STORAGE_KEY = 'aster-race:app-settings:v1'

export const DEFAULT_LAYLINE_SETTINGS: LaylineSettings = {
  enabled: true,
  alphaDegrees: DEFAULT_LAYLINE_ALPHA_DEGREES,
}

interface AppSettingsState {
  layline: LaylineSettings
}

function createDefaultSettingsState(): AppSettingsState {
  return {
    layline: DEFAULT_LAYLINE_SETTINGS,
  }
}

export function clampLaylineAlphaDegrees(alphaDegrees: number): number {
  return Math.min(MAX_LAYLINE_ALPHA_DEGREES, Math.max(MIN_LAYLINE_ALPHA_DEGREES, Math.round(alphaDegrees)))
}

export function loadAppSettings(): AppSettingsState {
  const storage = getLocalStorage()

  if (!storage) {
    return createDefaultSettingsState()
  }

  const storedValue = storage.getItem(STORAGE_KEY)

  if (!storedValue) {
    return createDefaultSettingsState()
  }

  try {
    return normalizeSettingsState(JSON.parse(storedValue))
  } catch {
    return createDefaultSettingsState()
  }
}

export function saveAppSettings(state: AppSettingsState): void {
  const storage = getLocalStorage()

  if (!storage) {
    return
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettingsState(state)))
  } catch {
    // Ignore storage failures to keep runtime behavior stable.
  }
}

function normalizeSettingsState(value: unknown): AppSettingsState {
  if (!isRecord(value)) {
    return createDefaultSettingsState()
  }

  const laylineValue = isRecord(value.layline) ? value.layline : null

  return {
    layline: {
      enabled: typeof laylineValue?.enabled === 'boolean'
        ? laylineValue.enabled
        : DEFAULT_LAYLINE_SETTINGS.enabled,
      alphaDegrees: isFiniteNumber(laylineValue?.alphaDegrees)
        ? clampLaylineAlphaDegrees(laylineValue.alphaDegrees)
        : DEFAULT_LAYLINE_SETTINGS.alphaDegrees,
    },
  }
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
