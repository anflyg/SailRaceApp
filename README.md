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

- Xcode krävs senare för iPhone/native-test, men webbläsartest fungerar i dagsläget med `npm run dev`.
- Den här versionen är testbar i webbläsaren och använder React + TypeScript + Capacitor utan iOS-native-sensorintegration.
- Appen innehåller fyra huvudvyer: Bana, Start, Segling och Analys.
- GPS, kompass, accelerometer, magnetometer och raceinspelning är för närvarande placeholder-tjänster.

## Browser-testbara funktioner

- Bana-vyn kan sätta och rensa falska banpunkter.
- Vindriktning kan ändras med +10° / -10° och wrappar mellan 0–359°.
- Start-vyn har valbara 5/4/3/2/1 min och ett stort klickbart tidtagarfält.
- Tidtagaren togglar start/pause på klick och återställs vid långt tryck.
- Tidtagaren går till -0:10 och växlar därefter automatiskt till Segling.
- Segling visar stora värden för Fart, Riktning och VMG.
- Analys visar markerade uppspelningsknappar och svensk placeholder-text.

## Known limitations

- No real GPS or compass integration yet.
- Race replay is currently placeholder-only.
- Wake lock is prepared as a service stub but not wired to the UI.

## Next planned steps

- Add Capacitor-native GPS and heading support.
- Implement screen wake lock and keep-awake behavior.
- Wire real race recording and replay.
- Add race data persistence and analysis graphs.
