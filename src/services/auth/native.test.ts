import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
describe('native auth build/security regression alarms (not device proof)', () => {
  it('uses Apple/CryptoKit/Security without requesting personal profile scopes', () => {
    const source = read('ios/App/App/TackWiseAuthPlugin.swift')
    for (const required of ['import AuthenticationServices','SecRandomCopyBytes','count: 32','request.requestedScopes = []','request.nonce = SHA256.hash','request.state = state','credential.state == requestState','getCredentialState(forUserID:', 'credentialRevokedNotification']) expect(source).toContain(required)
    expect(source).not.toMatch(/print\(|NSLog|\.email|\.fullName/)
  })
  it('uses fixed app-private, nonsynchronizing device-only Keychain and invalidates stale writes', () => {
    const source = read('ios/App/App/TackWiseAuthPlugin.swift')
    for (const required of ['kSecAttrAccessibleWhenUnlockedThisDeviceOnly','kSecAttrSynchronizable as String: false','SecItemCopyMatching','SecItemUpdate','SecItemAdd','revision == old["revision"]','UUID().uuidString','SecItemDelete','UserDefaults.standard.bool(forKey: installMarker)', 'UserDefaults.standard.bool(forKey: logoutMarker)', 'UserDefaults.standard.set(true, forKey: self.logoutMarker)']) expect(source).toContain(required)
    expect(source).not.toContain('kSecAttrAccessGroup')
    expect(read('capacitor.config.ts')).toContain("loggingBehavior: 'none'")
  })
  it('is registered in the existing bridge and compiled in the application target', () => {
    expect(read('ios/App/App/AppDelegate.swift')).toContain('registerPluginInstance(TackWiseAuthPlugin())')
    expect(read('ios/App/App.xcodeproj/project.pbxproj')).toContain('TackWiseAuthPlugin.swift in Sources')
    expect(read('src/app/AppShell.tsx')).not.toContain('new RaceSyncCoordinator')
  })
})
