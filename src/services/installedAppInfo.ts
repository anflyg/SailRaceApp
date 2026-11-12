import { Capacitor, registerPlugin } from '@capacitor/core'

interface NativeAppInfoPlugin {
  getInfo(): Promise<{
    version?: string | null
    build?: string | null
  }>
}

export interface InstalledAppInfo {
  version: string
  build: string
}

const nativeAppInfo = registerPlugin<NativeAppInfoPlugin>('TackWiseAppInfo')

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function normalizeInstalledAppInfo(info: {
  version?: unknown
  build?: unknown
} | null | undefined): InstalledAppInfo | null {
  const version = nonEmptyString(info?.version)
  const build = nonEmptyString(info?.build)
  return version && build ? { version, build } : null
}

export async function getInstalledAppInfo(): Promise<InstalledAppInfo | null> {
  if (Capacitor.getPlatform() !== 'ios' || !Capacitor.isPluginAvailable('TackWiseAppInfo')) {
    return null
  }

  try {
    return normalizeInstalledAppInfo(await nativeAppInfo.getInfo())
  } catch {
    return null
  }
}

export function formatInstalledAppVersion(info: InstalledAppInfo | null): string | null {
  return info ? `${info.version} (${info.build})` : null
}
