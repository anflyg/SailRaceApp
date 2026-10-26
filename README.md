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
4. Sync Capacitor after building:
   ```bash
   npm run cap:sync
   ```
5. Open the iOS project in Xcode:
   ```bash
   npm run cap:open:ios
   ```
6. In Xcode, select your signing team and a connected iPhone, then run the app.

## Notes

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

## M2 post-race synchronization (synthetic only)

In **Analysis → Library**, open **Synthetic sync test** to run the complete local
mock Worker flow. It uses fixed fictional positions, separate private persistence
and an explicit “no cloud upload” success label. Your recordings and accounts are
not used. Real per-race sync controls remain disabled; no session or Worker URL is
configured. Recording, local race IDs, export and analysis remain offline-first.

Run `npm test -- --maxWorkers=1`, `npm run build` and `npm run sync:validation`.
The browser check runs a local Vite server and Playwright Chromium only.
[Client protocol, storage, recovery and real-integration gates](docs/architecture/m2-iphone-cloud-sync.md)
include the existing native dependency advisories and physical-device checks.

Dependency security baseline: Capacitor core/CLI/iOS are pinned together at 8.4.3.
Use `npm ci` and `npx cap sync ios` after building; the tracked SwiftPM resolution
must agree with npm. See [security and native-build evidence](docs/security/m2-dependency-remediation.md)
for audit results, reproducible native commands and remaining device checks.

## M2 native account layer (cloud uploads still disabled)

Setup includes optional Swedish/English account controls. Native Apple sign-in,
Supabase session refresh and Keychain persistence are implemented; browser sign-in
and unconfigured builds stay disabled. `.env.auth.example` lists public-only
configuration names, with no endpoints or secrets. Run the existing test/build/
validation commands; `npx cap sync ios` includes the local Swift bridge. See
[auth design and exact external/device prerequisites](docs/architecture/authentication.md)
before configuring an approved test environment. No live Apple authentication is
claimed; signing capabilities and external projects were not configured.
