# M2 dependency remediation — PR #16

## Scope and security effect

Capacitor core, CLI and iOS are pinned together at **8.4.3**. This fixes
[GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv),
which could serve remote content at the trusted app origin through the native
HTTP interceptor, even with CapacitorHttp disabled. The upstream fix rejects
interceptor document/frame navigation before plugin navigation overrides and
rejects proxy requests when the proxy is disabled. Direct native HTTP remains
available; its binary-body and redirect behavior retain regression coverage.

8.5.1 was evaluated but its CLI adds `xcode` 3.x and vulnerable `uuid` 7.x.
8.4.3 is also an approved patched release and avoids that added dependency
without overrides or a major upgrade. Plugins remain Filesystem 8.1.2,
Geolocation 8.2.0, Share 8.0.1 and community Keep Awake 8.0.1; all resolve core
8.4.3 without invalid peer dependencies.

No authentication, network endpoint, permission, data collection, storage policy
or cloud activation changes. Real cloud sync remains disabled. The update reduces
the risk of app-private GPS/session data exposure and records patch-management
evidence for CRA/GDPR review; it does not claim regulatory conformity.

## npm resolution and audit

Validated on 2026-10-23 with a fresh `npm ci`, `npm ls` and `npm audit` against the
regenerated lockfile. The initial full audit had **13 entries** (2 critical,
7 high, 3 moderate, 1 low); the final full audit has **0 findings** at all levels.
An audit is a dated advisory check, not proof that no unknown vulnerability exists.

| Dependency | Before | Resolved |
| --- | --- | --- |
| Capacitor core / CLI / iOS | 8.3.3 | 8.4.3 |
| tar (CLI) | 7.5.15 | 7.5.22 |
| @xmldom/xmldom (CLI → plist) | 0.9.10 | 0.9.12 |
| brace-expansion (ESLint → minimatch) | 5.0.6 | 5.0.12 |
| Vite | 8.0.11 | 8.3.5 |
| Vitest / @vitest/mocker | 4.1.7 | 4.1.12 |

Compatible transitive updates also remediate the reported Babel core,
baseline-browser-mapping, browserslist, nanoid, postcss and source-map-js
advisories. No `audit fix --force`, dependency override or major framework update
was used. Full audit includes CLI/build/test dependencies, not just app runtime.

## Actual native resolution and build

`npx cap sync ios` regenerated the CLI-managed Package.swift with exact 8.4.3.
Xcode resolved and the tracked Package.resolved pins `capacitor-swift-pm` 8.4.3
at **89e0d8ec2321025f549ddb19259a717467943b97**. Existing native dependencies
IONFilesystemLib 1.1.2 and IONGeolocationLib 2.1.1 are unchanged.

The resolved upstream package uses binary XCFrameworks. Its Capacitor download
is `releases/download/8.4.3/Capacitor.xcframework.zip`, checksum
`28a09b11d71c89077cb415be6a40cc743b8e494e70f4689b9f642d4a3f467081`.
Xcode 27.1 (27A9275) successfully processed that XCFramework, compiled the app
and all four plugins and embedded the simulator framework in the unsigned app.
The embedded binary and the resolved simulator artifact have identical SHA-256:
`cd0321b6f4530b04317eeea4cb3196ba15a7a2b116ee6e1403aff984aa9ccca2`.
The framework Info.plist reports generic version `1.0`; provenance is established
by the resolved revision, versioned/checksummed package and embedded binary match,
not by that generic Info.plist value or npm alone.

Reproduce from this branch with Xcode installed (temporary paths may differ):

```sh
npm ci
npm run build
npx cap sync ios
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj \
  -scheme App -clonedSourcePackagesDirPath /private/tmp/tackwise-m2-security-spm
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/tackwise-m2-security-derived \
  -clonedSourcePackagesDirPath /private/tmp/tackwise-m2-security-spm \
  -onlyUsePackageVersionsFromResolvedFile CODE_SIGNING_ALLOWED=NO build
```

Nonfatal native warnings: upstream Filesystem unused `responseType`; local
CoreSimulator service is older than the selected Xcode framework (1171.7.0 vs
1174.9.2). The generic simulator build succeeded, but no simulator runtime test
is claimed. No signing, upload, deployment or installed app replacement occurred.

## Regression results and remaining device evidence

- `npm test -- --maxWorkers=1`: **248 tests, 30 files passed**, no skips.
- `npm run build`: passed TypeScript and production Vite build.
- `npm run sync:validation`: passed synthetic full flow, reload persistence,
  phone/tablet layouts and zero external requests.
- `npm run analysis:validation`, `npm run logged-race:analysis`: passed.
- `npm run simulation:test`: passed the offline recording/GPS/course/start/VMG
  scenarios using synthetic fixtures.
- `npm audit`: zero findings; `git diff --check`: passed.
- Native iOS sync, package resolution and unsigned generic simulator build: passed.

New regression alarms assert installed/declaration/lockfile/native resolution
alignment and the upstream proxy guards. Existing tests exercise exact gzip bytes,
Content-Length, no Content-Encoding, redirects disabled, native empty 204,
private Library persistence, restart/retry, recording deferral and local data
preservation. Source/injected tests do not execute WKWebView or physical sensors.

Before real Apple authentication/cloud sync, verify on a physical iPhone:
record/start/stop and analysis/export fully offline; GPS permission/watch updates
and accuracy, motion and Keep Awake; Filesystem persistence across restart and
upgrade, file protection/backup/restore; and the proxy navigation rejection with
CapacitorHttp disabled/enabled. Direct native HTTP still needs an approved isolated
Worker drill proving exact compressed bytes/hash/headers, redirects and offline
recovery. Measure memory/CPU and recording responsiveness. Those are activation
requirements; no real session, real GPS upload or provider test was performed.
