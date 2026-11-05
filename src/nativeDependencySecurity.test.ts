import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const json = (path: string) => JSON.parse(read(path))

// Deliberate security baseline: review these together when changing the native SDK.
const capacitorVersion = '8.5.1'

describe('native dependency security baseline', () => {
  it('keeps installed, locked and declared Capacitor packages aligned with SwiftPM', () => {
    const manifest = json('package.json')
    const lock = json('package-lock.json')
    for (const name of ['core', 'cli', 'ios']) {
      const dependency = `@capacitor/${name}`
      expect(manifest.dependencies[dependency]).toBe(capacitorVersion)
      expect(lock.packages[`node_modules/${dependency}`].version).toBe(capacitorVersion)
      expect(json(`node_modules/${dependency}/package.json`).version).toBe(capacitorVersion)
    }
    expect(read('ios/App/CapApp-SPM/Package.swift')).toContain(`exact: "${capacitorVersion}"`)
    const pins = json('ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved').pins
    expect(pins.find((pin: { identity: string }) => pin.identity === 'capacitor-swift-pm').state)
      .toEqual({ version: capacitorVersion, revision: '6afa7424fd2fcd8ca1e577478e8a00af284b7e82' })
  })

  it('retains the installed upstream proxy navigation and disabled-proxy guards', () => {
    const root = 'node_modules/@capacitor/ios/Capacitor/Capacitor/'
    const delegate = read(`${root}WebViewDelegationHandler.swift`)
    const guard = 'if navURL.path.starts(with: CapacitorBridge.httpInterceptorStartIdentifier)'
    const start = delegate.indexOf(guard)
    expect(start).toBeGreaterThan(-1)
    expect(delegate.slice(start, start + 180)).toContain('decisionHandler(.cancel)')
    expect(start).toBeLessThan(delegate.indexOf('for pluginObject in bridge.plugins'))
    const handler = read(`${root}WebViewAssetHandler.swift`)
    expect(handler).toContain('getPluginConfig("CapacitorHttp").getBoolean("enabled", false) == true')
    expect(handler).toContain('urlSchemeTask.didFailWithError(URLError(.unsupportedURL))')
    // Source checks are regression alarms, not substitutes for a native build/device test.
  })
})
