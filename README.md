# SailRaceApp

SailRaceApp is a mobile-first sailing race app foundation built with React, TypeScript, Vite and Capacitor for iOS.

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
- R/rullning visas positivt när styrbordssidan höjs; S/stampning visas positivt när fören höjs.
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
