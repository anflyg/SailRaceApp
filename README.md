# TackWise Race

TackWise Race is the iPhone product in the TackWise sailing-instrument suite, built with React, TypeScript, Vite and Capacitor for iOS.

## Stack

- React
- TypeScript
- Vite
- Capacitor
- iOS (iPhone 12+)

## Required tools

- Node.js
- VS Code
- Xcode
- iPhone 12 or newer for device testing

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run locally in browser:
   ```bash
   npm run dev
   ```
3. Build the app:
   ```bash
   npm run build
   ```
4. Build, sync, install and launch on a connected physical iPhone:
   ```bash
   npm run ios
   ```
   The command prints the current worktree, branch, commit and Git status before
   building. It uses the current checkout without switching branches, requires
   one available iPhone (or `TACKWISE_IOS_DEVICE_ID=<UDID>` when several are
   connected), and uses Xcode automatic Debug signing. It stops before Capacitor
   sync if locally changed sync-generated files could be overwritten. To open
   Xcode manually instead, run `npm run cap:sync` followed by
   `npm run cap:open:ios`.

## Phase 1 + Phase 2 physical-iPhone development test

To test both unmerged race-performance phases on one **personally connected iPhone** using the existing Apple Development signing identity, check out branch `feat/race-performance-phase2` (which includes Phase 1). On the Mac with Xcode, connect/unlock and trust the iPhone, then run:

```sh
npm ci
npm run ios:vmg-test
```

This explicit opt-in runs a **development Vite bundle** (`NODE_ENV=development`) and uses **Capacitor copy** (not sync) to preserve the existing Swift Package.swift/native dependency manifest. Then it runs the existing signed Xcode Debug build, device installation and launch. It is **not TestFlight or a production release**. The ordinary `npm run ios` still builds the production bundle, in which the Phase 2 VMG path stays disabled. If the signing certificate/profile is missing, the test command stops and reports that blocker; it does not request new provisioning updates.

**If a prior attempt ran `cap sync` and stopped on `ios/App/CapApp-SPM/Package.swift`:** inspect `git diff -- ios/App/CapApp-SPM/Package.swift` in this worktree. Only if the file contains *exclusively* the Capacitor-generated iOS platform bump and no intentional local native change, restore that one file with `git restore -- ios/App/CapApp-SPM/Package.swift` before retrying. Never reset other native files or run a blanket `git restore .`.

**Before installation:** the test uses the existing iOS Bundle ID `com.anflyg.sailraceapp`, not a parallel test identity. Installing may update/replace an existing TackWise Race installation and affect its local data. Back up/retain any important unsynced recordings first. Do not uninstall the app or change signing, bundle identity, entitlements or cloud environment as an automatic workaround. This test does not approve new GPS uploads or backend switches.

What to check on the phone: start a new local race, approve Course wind, pass the gun, compare frozen VMG on steady steering versus the unchanged moving tactical marker; change manual tack angle; re-establish one eligible tack; verify GPS/HDG loss, late first Course wind, R/S, A/B capture, TTL/BURN, and background/Continue restrictions. A restart currently **withholds development VMG by design** pending approved persistence. Record findings locally without GPS traces, accounts, tokens or real location in GitHub. Physical/on-water verification is still required before release.

## Notes

- Xcode Cloud runs `ios/App/ci_scripts/ci_post_clone.sh` before Swift package
  resolution. The executable hook installs Node 22 via Homebrew if needed,
  installs locked npm dependencies (including build tools), builds the normal
  production web assets and syncs Capacitor for iOS. Keep it beside
  `App.xcodeproj`; the local Swift packages require `node_modules` on each fresh
  checkout. It clears `TACKWISE_NATIVE_TEST_BUILD` and leaves the existing
  Release/archive guard against synthetic native-test assets enabled.

- Xcode krävs för iPhone/native-test, men webbläsartest fungerar med `npm run dev`.
- Den här versionen är testbar i webbläsaren och använder React + TypeScript + Capacitor. Live GPS används i Setup, Bana, Start och Segling, och iOS använder Core Motion för vindmätning i Bana.
- Appen innehåller fem huvudvyer: Setup, Bana, Start, Segling och Analys.
- Live GPS används i Bana för A/B/K1/L1 och i Segling för fart, position och course over ground när data finns.
- Start visar TTL/BURN/GPS när timern kör och minutknappar när timern är stoppad eller pausad.
- Setup visar GPS-, fart-, COG-, motion- och headingstatus samt runtime-kalibrering för R/S.
- R/rullning visas positivt när styrbordssidan höjs; S/stampning visas positivt när fören höjs. Värdena beräknas från Core Motions gravitationsvektor så yaw/heading inte ska påverka R/S nämnvärt.
- Core Motion-vindmätning använder telefonens bakåtriktade vektor och cirkulärt medelvärde över flera samples.
- Sensorarkitektur och native-strategi finns dokumenterad i `docs/sensors.md`.

## Browser-testbara funktioner

- Bana-vyn kan sätta och rensa banpunkter från live GPS när position finns.
- Banpunkter är grå/gula/gröna baserat på satt GPS-accuracy.
- Vindpilen kan sätta vind via mockmätning i browser/dev och via Core Motion på iOS.
- Start-vyn har valbara 5/4/3/2/1 min och ett stort klickbart tidtagarfält.
- Tidtagaren togglar start/pause på klick och återställs vid långt tryck.
- När tidtagaren kör visas TTL/BURN/GPS i stället för minutknappar.
- Tidtagaren går till -0:10 och växlar därefter automatiskt till Segling.
- Segling visar stora värden för Fart, Riktning och VMG Vind/VMG Bana. Live GPS används när webbläsaren eller iPhone tillhandahåller data; annars visas `--`.
- Segling visar R/S kompakt när nolläge har kalibrerats under aktuell appsession.
- Analys visar markerade uppspelningsknappar och svensk placeholder-text.

## Known limitations

- Core Motion-heading behöver verifieras och kalibreras i den faktiska mastmonteringen.
- Magnetisk nordfallback är inte deklinationskorrigerad ännu.
- Rullning/stampning-kalibrering är runtime-state och återställs vid apprestart/reload.
- Race replay is currently placeholder-only.
- Wake lock is prepared as a service stub but not wired to the UI.

## Next planned steps

- Verify Core Motion heading on a real mounted iPhone.
- Implement screen wake lock and keep-awake behavior.
- Wire real race recording and replay.
- Add race data persistence and analysis graphs.

## Recorded-race synchronization on iPhone

The ordinary iPhone app now offers **Analysis → Library → Synchronize** for a
completed local race, using the existing native Apple/Supabase account and private
Worker upload flow. It requires the existing public Auth configuration and an
authorized account/backend. Each upload is an explicit user action; recording,
startup and reconnect never initiate it. Local recordings are retained on success
and failure. No server flag is changed by the app. See the
[implementation, installation and physical acceptance steps](docs/architecture/recorded-race-sync.md).

### Internal synthetic sync verification

Synthetic fixtures and mock Worker tests remain available to developers, but
**Analysis → Library no longer displays synthetic test controls** on iPhone or web.
For completed local races, use the per-race **Synchronize** action on an approved,
configured iPhone. Local recording and analysis remain offline-first.

Run `npm test -- --maxWorkers=1`, `npm run build` and `npm run sync:validation`.
The browser validation uses Vite and Playwright without accessing a live account.
[Sync architecture and validation](docs/architecture/m2-iphone-cloud-sync.md)
retain the developer-only mock flow and physical-device acceptance boundaries.

Capacitor core, CLI and iOS are pinned together at **8.5.1**. After `npm ci`,
run `npm run cap:sync` before opening the native project. Locked SwiftPM
resolutions must agree with npm.

## Native account and internal synthetic verification

The internal synthetic upload harness is retained for isolated regression testing.
It uses fictional race data and existing approved Auth/Worker adapters only when
explicitly invoked by a developer test. It is **not mounted in the normal app UI**,
and does not use locally recorded races. Browser mocks likewise remain test-only.

Test code retains guarded upload intent, immutable gzip, checkpoint/retry and
accepted-versus-analysis-state checks. No backend gate, credentials, SQL,
automatic upload or cloud deletion behavior is changed by hiding the test UI.
The separate Debug-only `native-test` entry remains prohibited from
distribution.

Setup includes optional Swedish/English account controls. Native Apple sign-in,
Supabase session refresh and Keychain persistence are implemented; browser sign-in
and unconfigured builds stay disabled. `.env.auth.example` lists public-only
configuration names, with no endpoints or secrets. Run the existing test/build/
validation commands; `npx cap sync ios` includes the local Swift bridge. See
[auth design and exact external/device prerequisites](docs/architecture/authentication.md)
before configuring an approved test environment. No live Apple authentication is
claimed; signing capabilities and external projects were not configured.
