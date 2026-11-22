import { chromium } from 'playwright'
import { strict as assert } from 'node:assert'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173/tests/watch-countdown/')
  await page.waitForFunction(() => window.testListenerReady === true)
  const watch = async (action, id) => {
    await page.evaluate(([action, id]) => window.sendWatch(action, id), [action, id])
    await page.waitForFunction(id => window.testConfirmations.some(c => c.id === id), id)
  }
  await watch('start', 'start-1')
  await watch('pause', 'pause-1')
  await watch('resume', 'resume-1')
  await watch('reset', 'reset-1')
  assert.deepEqual(await page.evaluate(() => window.testCalls), ['start', 'pause', 'resume', 'pause'])
  assert.deepEqual(await page.evaluate(() => window.testConfirmations.filter(c => c.id).map(c => c.phase)), ['running', 'paused', 'running', 'ready'])
  await page.locator('.timer-display').click()
  await page.waitForFunction(() => window.testCalls.length === 5)
  await page.locator('.timer-display').click()
  await page.waitForFunction(() => window.testCalls.length === 6)
  await page.evaluate(() => window.sendWatch('start', 'stale', Date.now() - 1))
  await page.waitForTimeout(100)
  assert.equal(await page.evaluate(() => window.testConfirmations.some(c => c.id === 'stale')), false)
  assert.deepEqual(await page.evaluate(() => window.testCalls), ['start', 'pause', 'resume', 'pause', 'start', 'pause'])
  console.log('Watch countdown React integration passed')
} finally { await browser.close() }
