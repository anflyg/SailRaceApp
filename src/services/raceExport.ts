import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { strToU8, zipSync } from 'fflate'
import type { Race, RaceEvent, RaceSample } from '../types'

const EXPORT_VERSION = 1
const FILE_PREFIX = 'aster-race'

type ExportedRaceFile = {
  fileName: string
  mimeType: string
  content: string
}

type ZippedRaceExport = {
  fileName: string
  mimeType: string
  data: Uint8Array
}

interface RaceExportPayload {
  exportVersion: number
  appVersion: string | null
  exportedAt: string
  race: {
    id: string
    dayId: string
    name: string
    createdAt: string
    date: string
    startGunTime: string | null
    endTime: string | null
  }
  course: {
    startLine: NonNullable<Race['course']>['startLine'] | null
    windwardMark: NonNullable<Race['course']>['windwardMark'] | null
    leewardMark: NonNullable<Race['course']>['leewardMark'] | null
    windDirectionDegrees: number | null
    courseAxisDegrees: number | null
    marksEstimated: boolean | null
  } | null
  summary: Race['summary'] | null
  windMeasurement: null
  events: RaceEvent[]
  samples: RaceSample[]
}

function getAppVersion(): string | null {
  const value = import.meta.env.VITE_APP_VERSION

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function toFileTimestamp(value: string): string {
  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return 'unknown-time'
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day}-${hour}${minute}`
}

function toExportBaseFileName(race: Race): string {
  return `${FILE_PREFIX}-${toFileTimestamp(race.createdAt)}`
}

function toJsonPayload(race: Race): RaceExportPayload {
  return {
    exportVersion: EXPORT_VERSION,
    appVersion: getAppVersion(),
    exportedAt: new Date().toISOString(),
    race: {
      id: race.id,
      dayId: race.dayId,
      name: race.name,
      createdAt: race.createdAt,
      date: race.dayId,
      startGunTime: race.startGunTime ?? null,
      endTime: race.endTime ?? null,
    },
    course: race.course
      ? {
        startLine: race.course.startLine ?? null,
        windwardMark: race.course.windwardMark ?? null,
        leewardMark: race.course.leewardMark ?? null,
        windDirectionDegrees: race.course.windDirectionDegrees ?? null,
        courseAxisDegrees: race.course.courseAxisDegrees ?? null,
        marksEstimated: race.course.marksEstimated ?? null,
      }
      : null,
    summary: race.summary ?? null,
    windMeasurement: null,
    events: race.events,
    samples: race.samples,
  }
}

function toCsvValue(value: number | string | undefined): string {
  if (value === undefined) {
    return ''
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : ''
  }

  return value
}

function toElapsedSeconds(sample: RaceSample, raceCreatedAt: string): number | undefined {
  if (sample.elapsedSeconds !== undefined) {
    return sample.elapsedSeconds
  }

  const sampleTime = Date.parse(sample.timestamp)
  const raceCreatedTime = Date.parse(raceCreatedAt)

  if (!Number.isFinite(sampleTime) || !Number.isFinite(raceCreatedTime)) {
    return undefined
  }

  return (sampleTime - raceCreatedTime) / 1000
}

function toCsvContent(race: Race): string {
  const headers = [
    'timestamp',
    'elapsedSeconds',
    'latitude',
    'longitude',
    'accuracy',
    'speedKnots',
    'cogDegrees',
    'headingDegrees',
    'windDirectionDegrees',
    'vmgCourseKnots',
    'vmgWindKnots',
  ]
  const rows = race.samples.map((sample) => [
    toCsvValue(sample.timestamp),
    toCsvValue(toElapsedSeconds(sample, race.createdAt)),
    toCsvValue(sample.latitude),
    toCsvValue(sample.longitude),
    toCsvValue(sample.accuracy),
    toCsvValue(sample.speedKnots),
    toCsvValue(sample.cogDegrees),
    toCsvValue(sample.headingDegrees),
    toCsvValue(sample.windDirectionDegrees),
    toCsvValue(sample.vmgCourseKnots),
    toCsvValue(sample.vmgWindKnots),
  ].join(','))

  return `${headers.join(',')}\n${rows.join('\n')}`
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function formatExtensionValue(tagName: string, value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return ''
  }

  return `<aster:${tagName}>${String(value)}</aster:${tagName}>`
}

function toGpxContent(race: Race): string {
  const trackPoints = race.samples
    .filter((sample) => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude))
    .map((sample) => {
      const sampleTime = Date.parse(sample.timestamp)
      const validSampleTime = Number.isFinite(sampleTime) ? new Date(sampleTime) : new Date(race.createdAt)
      const time = escapeXml(validSampleTime.toISOString())
      const extensions = [
        formatExtensionValue('accuracy', sample.accuracy),
        formatExtensionValue('speedKnots', sample.speedKnots),
        formatExtensionValue('cogDegrees', sample.cogDegrees),
        formatExtensionValue('headingDegrees', sample.headingDegrees),
        formatExtensionValue('windDirectionDegrees', sample.windDirectionDegrees),
        formatExtensionValue('vmgCourseKnots', sample.vmgCourseKnots),
        formatExtensionValue('vmgWindKnots', sample.vmgWindKnots),
      ]
        .filter((value) => value.length > 0)
        .join('')

      return extensions.length > 0
        ? `<trkpt lat="${sample.latitude}" lon="${sample.longitude}"><time>${time}</time><extensions>${extensions}</extensions></trkpt>`
        : `<trkpt lat="${sample.latitude}" lon="${sample.longitude}"><time>${time}</time></trkpt>`
    })
    .join('')
  const trackName = escapeXml(race.name)
  const createdTime = Date.parse(race.createdAt)
  const validCreatedTime = Number.isFinite(createdTime) ? new Date(createdTime).toISOString() : new Date().toISOString()

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Aster Race" xmlns="http://www.topografix.com/GPX/1/1" xmlns:aster="https://aster-race.app/gpx/extensions/1">
  <metadata>
    <name>${trackName}</name>
    <time>${validCreatedTime}</time>
  </metadata>
  <trk>
    <name>${trackName}</name>
    <trkseg>${trackPoints}</trkseg>
  </trk>
</gpx>`
}

function createBinaryFileDownload(fileName: string, mimeType: string, data: Uint8Array): void {
  const safeBytes = new Uint8Array(data.length)
  safeBytes.set(data)
  const blob = new Blob([safeBytes.buffer], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const linkElement = document.createElement('a')
  linkElement.href = url
  linkElement.download = fileName
  linkElement.style.display = 'none'
  document.body.append(linkElement)
  linkElement.click()
  linkElement.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function uint8ArrayToBase64(data: Uint8Array): string {
  let binaryString = ''
  const chunkSize = 0x8000

  for (let index = 0; index < data.length; index += chunkSize) {
    const chunk = data.subarray(index, index + chunkSize)
    binaryString += String.fromCharCode(...chunk)
  }

  return btoa(binaryString)
}

export function createRaceExportFiles(race: Race): ExportedRaceFile[] {
  const baseFileName = toExportBaseFileName(race)
  const jsonPayload = toJsonPayload(race)

  return [
    {
      fileName: `${baseFileName}.json`,
      mimeType: 'application/json;charset=utf-8',
      content: `${JSON.stringify(jsonPayload, null, 2)}\n`,
    },
    {
      fileName: `${baseFileName}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      content: `${toCsvContent(race)}\n`,
    },
    {
      fileName: `${baseFileName}.gpx`,
      mimeType: 'application/gpx+xml;charset=utf-8',
      content: toGpxContent(race),
    },
  ]
}

export function createRaceExportZip(race: Race): ZippedRaceExport {
  const files = createRaceExportFiles(race)
  const zipEntries = Object.fromEntries(files.map((file) => (
    [file.fileName, strToU8(file.content)]
  )))
  const baseFileName = toExportBaseFileName(race)

  return {
    fileName: `${baseFileName}.zip`,
    mimeType: 'application/zip',
    data: zipSync(zipEntries, { level: 6 }),
  }
}

export async function exportRaceDownloads(race: Race): Promise<void> {
  const zipExport = createRaceExportZip(race)

  if (Capacitor.isNativePlatform()) {
    const path = `exports/${zipExport.fileName}`
    const data = uint8ArrayToBase64(zipExport.data)

    await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Cache,
      recursive: true,
    })
    const fileUri = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    })

    await Share.share({
      title: race.name || 'Aster Race export',
      text: 'Export från Aster Race',
      url: fileUri.uri,
      dialogTitle: 'Exportera race',
    })

    return
  }

  createBinaryFileDownload(zipExport.fileName, zipExport.mimeType, zipExport.data)
}
