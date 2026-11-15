import { describe, expect, it } from 'vitest'
import { describeUnavailableIphones, parseXcdeviceList, selectPhysicalIphone } from './ios-device-selection.mjs'

const availableIphone = {
  name: 'Anders iPhone',
  identifier: '00008110-001234567890001E',
  platform: 'com.apple.platform.iphoneos',
  architecture: 'arm64e',
  modelCode: 'iPhone15,2',
  modelName: 'iPhone 14 Pro',
  operatingSystemVersion: '18.5 (22F76)',
  interface: 'usb',
  available: true,
  simulator: false,
}
const unavailableIphone = {
  ...availableIphone,
  name: 'Unavailable iPhone',
  identifier: '00008120-009876543210002E',
  available: false,
  error: {
    code: 'com.apple.dt.devicekit.error',
    description: 'The device is locked. (device serial 12345678)',
    recoverySuggestion: 'Unlock the device and trust this Mac.',
  },
}
const simulator = {
  ...availableIphone,
  name: 'iPhone 16 Simulator',
  identifier: 'A1B2C3D4-E5F6-4789-ABCD-0123456789AB',
  platform: 'com.apple.platform.iphonesimulator',
  simulator: true,
}

const fixture = JSON.stringify([availableIphone, unavailableIphone, simulator])

describe('xcdevice physical iPhone selection', () => {
  it('selects an available physical device by xcdevice identifier (UDID)', () => {
    const selected = selectPhysicalIphone(fixture)
    expect(selected).toEqual(availableIphone)
    expect(selected.identifier).toBe('00008110-001234567890001E')
    expect(selectPhysicalIphone(fixture, availableIphone.identifier).identifier).toBe(selected.identifier)
  })

  it('excludes simulators and reports unavailable iPhone reasons without identifiers', () => {
    const { available, unavailable } = parseXcdeviceList(fixture)
    expect(available).toEqual([availableIphone])
    expect(unavailable).toEqual([unavailableIphone])
    const message = describeUnavailableIphones(unavailable).join('\n')
    expect(message).toContain('Unavailable iPhone')
    expect(message).toContain('The device is locked.')
    expect(message).not.toContain(unavailableIphone.identifier)
    expect(message).not.toContain('12345678')
  })

  it('reports why no physical iPhone is available, while excluding a connected simulator', () => {
    expect(() => selectPhysicalIphone(JSON.stringify([unavailableIphone, simulator])))
      .toThrow(/Otillgängliga enheter:[\s\S]*Unavailable iPhone: The device is locked\./)
  })

  it('uses the same UDID selection contract for a requested but unavailable device', () => {
    expect(() => selectPhysicalIphone(fixture, unavailableIphone.identifier))
      .toThrow(/Vald iPhone är inte tillgänglig[\s\S]*The device is locked/)
  })
})
