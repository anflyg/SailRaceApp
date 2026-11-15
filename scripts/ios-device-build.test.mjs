import { describe, expect, it } from 'vitest'
import { resolveAppProductPath } from './ios-device-build.mjs'

describe('iOS app product path', () => {
  it('uses the selected target build settings and preserves spaces in the product name', () => {
    const settings = [
      'Build settings for action build and target CapApp-SPM:',
      '    TARGET_BUILD_DIR = /tmp/Derived Data/Build/Products/Debug-iphoneos',
      '    FULL_PRODUCT_NAME = CapApp-SPM.framework',
      'Build settings for action build and target App:',
      '    TARGET_BUILD_DIR = /tmp/Derived Data/Build/Products/Debug-iphoneos',
      '    FULL_PRODUCT_NAME = TackWise Race.app',
    ].join('\n')

    expect(resolveAppProductPath(settings, 'App'))
      .toBe('/tmp/Derived Data/Build/Products/Debug-iphoneos/TackWise Race.app')
  })

  it('rejects settings without an app product for the requested target', () => {
    const settings = [
      'Build settings for action build and target App:',
      '    TARGET_BUILD_DIR = /tmp/DerivedData/Build/Products/Debug-iphoneos',
      '    FULL_PRODUCT_NAME = App.app/../Other.app',
    ].join('\n')

    expect(() => resolveAppProductPath(settings, 'App'))
      .toThrow('Xcode build settings did not provide an iOS app product for target App.')
  })
})
