import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = process.env.MANUAL_BASE_URL ?? 'http://127.0.0.1:5173'
const OUTPUT_DIR = path.resolve('docs/manual/screenshots')

const APP_SETTINGS_KEY = 'aster-race:app-settings:v1'
const RACE_STORAGE_KEY = 'aster-race:race-storage:v1'
const RACE_LOGGER_KEY = 'aster-race:race-logger:v1'

const raceStorageFixture = {
  version: 1,
  sailingDaysById: {
    '2026-05-20': {
      id: '2026-05-20',
      date: '2026-05-20',
      raceIds: ['manual-race-1', 'manual-race-2'],
    },
  },
  racesById: {
    'manual-race-1': {
      id: 'manual-race-1',
      dayId: '2026-05-20',
      name: 'Onsdagsträning K1',
      createdAt: '2026-05-20T13:55:00.000Z',
      startGunTime: '2026-05-20T14:00:00.000Z',
      endTime: '2026-05-20T14:28:00.000Z',
      isFavorite: true,
      course: {
        startLine: {
          port: { latitude: 59.3296, longitude: 18.0592 },
          starboard: { latitude: 59.3296, longitude: 18.0608 },
        },
        windwardMark: { latitude: 59.3334, longitude: 18.06 },
        leewardMark: { latitude: 59.3262, longitude: 18.06 },
        windDirectionDegrees: 22,
        courseAxisDegrees: 0,
      },
      events: [
        {
          type: 'layline-tack',
          timestamp: '2026-05-20T14:15:42.000Z',
          latitude: 59.3323,
          longitude: 18.0597,
          cogDegrees: 18,
          speedKnots: 6.2,
          alphaDegrees: 90,
          postTackHeadingDegrees: 108,
          laylineVariant: 'plus-alpha',
          target: 'K1',
        },
      ],
      samples: [
        { timestamp: '2026-05-20T13:59:56.000Z', latitude: 59.32944, longitude: 18.0600, accuracy: 4.1, speedKnots: 5.7, cogDegrees: 2, vmgCourseKnots: 5.6, vmgWindKnots: 5.3 },
        { timestamp: '2026-05-20T13:59:58.000Z', latitude: 59.32952, longitude: 18.0600, accuracy: 4.0, speedKnots: 5.9, cogDegrees: 4, vmgCourseKnots: 5.8, vmgWindKnots: 5.4 },
        { timestamp: '2026-05-20T14:00:00.000Z', latitude: 59.32960, longitude: 18.0600, accuracy: 3.9, speedKnots: 6.0, cogDegrees: 6, vmgCourseKnots: 5.9, vmgWindKnots: 5.5 },
        { timestamp: '2026-05-20T14:00:02.000Z', latitude: 59.32968, longitude: 18.0600, accuracy: 3.8, speedKnots: 6.1, cogDegrees: 8, vmgCourseKnots: 6.0, vmgWindKnots: 5.6 },
        { timestamp: '2026-05-20T14:00:04.000Z', latitude: 59.32976, longitude: 18.0600, accuracy: 3.8, speedKnots: 6.2, cogDegrees: 10, vmgCourseKnots: 6.1, vmgWindKnots: 5.7 },
        { timestamp: '2026-05-20T14:03:00.000Z', latitude: 59.3312, longitude: 18.0598, accuracy: 3.7, speedKnots: 6.3, cogDegrees: 18, vmgCourseKnots: 6.0, vmgWindKnots: 5.1 },
        { timestamp: '2026-05-20T14:06:00.000Z', latitude: 59.3322, longitude: 18.0597, accuracy: 3.7, speedKnots: 6.1, cogDegrees: 24, vmgCourseKnots: 5.9, vmgWindKnots: 4.9 },
      ],
    },
    'manual-race-2': {
      id: 'manual-race-2',
      dayId: '2026-05-20',
      name: 'Kvällspass VMG',
      createdAt: '2026-05-20T17:15:00.000Z',
      startGunTime: '2026-05-20T17:20:00.000Z',
      endTime: '2026-05-20T17:40:00.000Z',
      isFavorite: false,
      course: {
        startLine: {
          port: { latitude: 59.3295, longitude: 18.0591 },
          starboard: { latitude: 59.3295, longitude: 18.0609 },
        },
        windwardMark: { latitude: 59.3333, longitude: 18.0601 },
        leewardMark: { latitude: 59.3263, longitude: 18.06 },
        windDirectionDegrees: 32,
        courseAxisDegrees: 1,
      },
      events: [],
      samples: [
        { timestamp: '2026-05-20T17:20:00.000Z', latitude: 59.3296, longitude: 18.0602, accuracy: 4.5, speedKnots: 5.2, cogDegrees: 20, vmgCourseKnots: 4.8, vmgWindKnots: 4.1 },
        { timestamp: '2026-05-20T17:25:00.000Z', latitude: 59.3304, longitude: 18.0601, accuracy: 4.2, speedKnots: 5.8, cogDegrees: 28, vmgCourseKnots: 5.1, vmgWindKnots: 4.3 },
      ],
    },
  },
}

const appSettingsFixture = {
  layline: {
    enabled: true,
    alphaDegrees: 90,
  },
}

const raceLoggerFixture = {
  activeRaceId: null,
}

async function resetOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const files = await fs.readdir(OUTPUT_DIR)
  await Promise.all(
    files
      .filter((file) => file.endsWith('.png'))
      .map((file) => fs.unlink(path.join(OUTPUT_DIR, file))),
  )
}

function withQuery(query) {
  return `${BASE_URL}/?${query}`
}

async function capture(page, name) {
  const screenshotPath = path.join(OUTPUT_DIR, name)
  await page.screenshot({ path: screenshotPath })
  return screenshotPath
}

async function gotoReady(page, query) {
  await page.goto(withQuery(query), { waitUntil: 'networkidle' })
  const splash = page.locator('.aster-race-splash')
  if (await splash.count()) {
    await splash.waitFor({ state: 'detached', timeout: 10_000 })
  }
  await page.locator('.navigation-bar').waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(200)
}

async function run() {
  await resetOutputDir()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  })

  await context.addInitScript(
    ({ settingsKey, settingsValue, storageKey, storageValue, loggerKey, loggerValue }) => {
      window.localStorage.setItem(settingsKey, settingsValue)
      window.localStorage.setItem(storageKey, storageValue)
      window.localStorage.setItem(loggerKey, loggerValue)
    },
    {
      settingsKey: APP_SETTINGS_KEY,
      settingsValue: JSON.stringify(appSettingsFixture),
      storageKey: RACE_STORAGE_KEY,
      storageValue: JSON.stringify(raceStorageFixture),
      loggerKey: RACE_LOGGER_KEY,
      loggerValue: JSON.stringify(raceLoggerFixture),
    },
  )

  const page = await context.newPage()

  await gotoReady(page, 'manual=1&view=setup')
  await capture(page, '01_setup.png')

  await gotoReady(page, 'manual=1&view=course')
  await capture(page, '02_bana.png')

  await gotoReady(page, 'manual=1&view=timer')
  await capture(page, '03_start_idle.png')

  await page.locator('.timer-display.interactive').click()
  await page.locator('.start-run-panel').waitFor({ state: 'visible' })
  await page.waitForTimeout(500)
  await capture(page, '04_start_running.png')

  await gotoReady(page, 'manual=1&view=race')
  await capture(page, '05_segling_vmg_bana.png')

  await page.locator('.metric-box.velocity-made-good').click()
  await page.waitForTimeout(400)
  await capture(page, '06_segling_vmg_vind.png')

  await gotoReady(page, 'manual=1&view=race&layline=8')
  await capture(page, '07_segling_layline.png')

  await gotoReady(page, 'manual=1&view=analysis')
  await page.waitForTimeout(300)
  await capture(page, '08_analys_bibliotek.png')

  await page.locator('.race-card-main').first().click()
  await page.waitForTimeout(700)
  await capture(page, '09_analys_oversikt.png')

  await page.getByRole('tab', { name: 'Start' }).click()
  await page.waitForTimeout(700)
  await capture(page, '10_analys_startanalys.png')

  await browser.close()
  // eslint-disable-next-line no-console
  console.log(`Saved screenshots to ${OUTPUT_DIR}`)
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exitCode = 1
})
