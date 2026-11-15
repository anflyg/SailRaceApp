import { describe, expect, it } from 'vitest'
import { isExpectedCapacitorSyncChange } from './ios-device-safety.mjs'

describe('Capacitor sync change guard', () => {
  it('allows Capacitor to refresh the generated web assets and config', () => {
    expect(isExpectedCapacitorSyncChange('ios/App/App/public')).toBe(true)
    expect(isExpectedCapacitorSyncChange('ios/App/App/public/index.html')).toBe(true)
    expect(isExpectedCapacitorSyncChange('ios/App/App/public/assets/index-abc123.js')).toBe(true)
    expect(isExpectedCapacitorSyncChange('ios/App/App/capacitor.config.json')).toBe(true)
  })

  it('continues to reject edits to native and other protected files', () => {
    expect(isExpectedCapacitorSyncChange('ios/App/App/AppDelegate.swift')).toBe(false)
    expect(isExpectedCapacitorSyncChange('ios/App/App/Info.plist')).toBe(false)
    expect(isExpectedCapacitorSyncChange('ios/App/App.xcodeproj/project.pbxproj')).toBe(false)
    expect(isExpectedCapacitorSyncChange('ios/App/CapApp-SPM/Package.swift')).toBe(false)
    expect(isExpectedCapacitorSyncChange('ios/App/App/cordova.js')).toBe(false)
    expect(isExpectedCapacitorSyncChange('ios/App/App/publicity/index.html')).toBe(false)
  })
})
