# TestFlight Checklist (Aster Race)

## 1) Branch och preflight
1. Säkerställ att du bygger från `main` eller en release-branch (inte `feature/*`).
2. Kör:
   ```bash
   git status
   git rev-parse --abbrev-ref HEAD
   npm run build
   npm run cap:sync
   ```
3. Öppna iOS-projektet:
   ```bash
   open ios/App/App.xcodeproj
   ```

## 2) Archive i Xcode (exakta steg)
1. Välj scheme `App`.
2. Välj destination `Any iOS Device (arm64)` (inte simulator).
3. Gå till **Product → Archive**.
4. Vänta tills Organizer öppnas automatiskt med den nya arkiven.

## 3) Ladda upp via Organizer
1. I Organizer: välj senaste arkiven för `Aster Race`.
2. Klicka **Distribute App**.
3. Välj **App Store Connect**.
4. Välj **Upload**.
5. Behåll standardval för symboler och signing om inget särskilt krävs.
6. Bekräfta och ladda upp.
7. Vänta på “Upload Successful”.

## 4) App Store Connect (vad du fyller i)
1. Gå till **App Store Connect → My Apps → Aster Race → TestFlight**.
2. Vänta tills bygget är “Ready to Test”.
3. Lägg till:
   - **What to Test**: se text nedan.
   - **Beta App Description**: se text nedan.
   - **Feedback Email**: teamets testadress.
4. Lägg till intern testgrupp och/eller extern grupp.

## 5) Beta App Description (kort)
`Aster Race är ett seglingsinstrument för start och race med bana, starttimer, fart, riktning, VMG och sensordata för iPhone.`

## 6) What to Test / testinstruktion (kort)
`Testa bana (A/B/K1/L1), vindmätning, starttimer, seglingsvyn (fart/riktning/VMG), samt export till ZIP. Rapportera avvikelser i riktning/vind, GPS-stabilitet, UI-läsbarhet och exportdelning.`

## 7) Vanlig felsökning
- **Archive syns inte i Organizer**: kontrollera att destination var `Any iOS Device`, kör Archive igen.
- **Build saknas i TestFlight**: vänta 5–30 min, uppdatera sidan, kontrollera att uppladdning verkligen lyckades.
- **Invalid Binary / signing-fel**: kontrollera Bundle ID, certifikat/provisioning och att Team är rätt valt i Signing.
- **Version/build-konflikt**: höj `CURRENT_PROJECT_VERSION` och archive igen.
- **Plugin-/native-fel efter sync**: kör `npm run cap:sync`, öppna om Xcode och gör Clean Build Folder.
