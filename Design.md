# SailRaceApp Design Document

Det här dokumentet beskriver nuvarande implementation i repo:t. När dokumentation och kod skiljer sig åt gäller koden.

## 1. Syfte

SailRaceApp är en iPhone-app för kappsegling. Appen ska hjälpa seglaren att:

- kontrollera GPS/sensorer och kalibrera rullning/stampning
- sätta upp en enkel kappseglingsbana
- hantera startnedräkning
- visa stora instrumentvärden under segling
- senare kunna spela upp och analysera seglingen efteråt

Appen är byggd för användarens egen iPhone under utveckling och körs i nuläget direkt via Xcode på fysisk iPhone, inte via App Store.

## 2. Plattform och teknikval

Projektet använder:

- React för UI och vylogik
- TypeScript för datamodeller och säkrare ändringar
- Vite för lokal utveckling och produktionsbygge
- Capacitor för att paketera webbappen som iOS-app
- iOS/Xcode för körning på fysisk iPhone
- Core Motion via en lokal Capacitor-plugin för vindmätning och rullning/stampning
- Capacitor Geolocation för GPS-position, fart och course over ground

Vanliga kommandon:

```bash
npm install
npm run dev
npm run build
npm run cap:sync
npm run cap:open:ios
```

## 3. Huvudvyer

Appen har fem huvudvyer:

```text
Setup → Bana → Start → Segling → Analys
```

Navigeringen ligger i `NavigationBar`. `AppShell` äger aktiv vy och blockerar manuell navigering när starttimern kör.

### Setup

Setup används för sensorstatus och kalibrering av rullning/stampning.

Nuvarande beteende:

- Visar GPS-status.
- Visar filtrerad fart i knop.
- Visar filtrerad COG när den är tillförlitlig.
- Visar `Motion` och `Heading` som `OK` eller `SAKNAS` beroende på faktisk sensordata från pluginen.
- Visar rullning/stampning som `R —` och `S —` före kalibrering.
- Knappen `Kalibrera nolläge` sparar aktuell rullning/stampning som runtime-nolläge.
- Efter kalibrering visas relativa värden, till exempel `R +0°` och `S +0°`.
- Kalibrering sparas inte permanent och försvinner vid apprestart/reload.
- Setup stannar kvar på samma vy efter kalibrering.

Begrepp:

- `R` = rullning = sidolutning vänster/höger = roll/heel.
- `S` = stampning = fören upp/ned = pitch.
- Yaw/heading, alltså vridning runt lodrät axel, ska inte påverka R/S nämnvärt.

Telefonmontering enligt koden:

- Telefonen sitter i portrait/stående.
- Telefonens högerkant motsvarar styrbord.
- Telefonens baksida pekar mot fören.
- Telefonens skärm pekar mot aktern.

Teckenkonvention i native-koden:

- R/rullning är positiv när styrbordssidan höjs jämfört med kalibreringen.
- S/stampning är positiv när fören höjs jämfört med kalibreringen.

### Bana

Bana används för att sätta banpunkter, startlinje och vindriktning.

Nuvarande beteende:

- Startlinjen har två punkter: A och B.
- Banan har ett kryssmärke K1 och ett länsmärke L1.
- K2 och L2 är borttagna ur UI och datamodell.
- K1 visas centrerat upptill.
- L1 visas centrerat nedtill.
- A visas till vänster och B till höger.
- Startlinjen ritas mellan A och B.
- Ingen banaxellinje visas i UI.
- Banaxeln finns internt som bäringen från L1 till K1.
- Banaxeln används för banreferens och vindpilens relativa rotation.

Punktbeteende:

- Tryck på en ej satt punkt sätter punkten med aktuell live-GPS.
- Tryck på en redan satt punkt rensar den.
- Om GPS-position saknas sätts ingen punkt och status visar `GPS-position saknas`.
- `Rensa bana` rensar alla banpunkter och vindriktning.

Punktkvalitet:

- Varje satt punkt sparar latitud, longitud och eventuell `accuracyAtSet`.
- `good` om GPS accuracy är högst 5 meter.
- `poor` om GPS accuracy är sämre än 5 meter eller saknas.
- Ej satta punkter visas grå.
- Good-punkter visas gröna.
- Poor-punkter visas gula.
- Gula punkter används fortfarande i beräkningar.

Startlinjens färg:

- Grå om A eller B saknas.
- Grön om A och B båda är good.
- Gul om A eller B är poor.

GPS-status:

- Bana visar aktuell GPS-status längst ner.
- `GPS ±x.x m` visas när GPS finns.
- `GPS OSÄKER` visas när accuracy är sämre än 5 meter.
- `GPS SAKNAS` visas när position/accuracy saknas.

Vindpil:

- Vindpilen är kvar i Bana.
- Om vind saknas startar tryck på vindpilen Core Motion-baserad vindmätning.
- Om vind redan är satt rensar tryck på vindpilen vindriktningen.
- Under mätning visas `Mäter vind...`.
- Vid fel visas `Kunde inte mäta vind`.
- Vindriktning sparas som absolut heading.
- Om K1 och L1 finns visas vindpilen relativt banaxeln L1 → K1.
- Om banaxeln saknas visas pilen relativt nord/0°.

Exempel: om banaxeln är 40° och vinden är 50° roteras vindpilen +10° relativt den vertikala banan på skärmen.

### Start

Start används för kappseglingens nedräkning och startlinjeinstrument.

Nuvarande beteende:

- Nedräkningen kan väljas till 5, 4, 3, 2 eller 1 minut.
- Vald startlängd finns kvar under aktuell React-session.
- Vid full reload/apprestart återgår startlängden till 5 minuter.
- Tryck på timern startar eller pausar.
- Långt tryck på timern återställer till vald längd.
- När timern passerar 0:00 fortsätter den internt till -0:10.
- Den negativa perioden visas utan minustecken; röd timerbakgrund signalerar post-start.
- Vid intern tid -0:10 pausas timern och appen växlar automatiskt till Segling.

Två UI-lägen:

1. Timer stoppad eller pausad:
   - Minutknapparna visas.
   - TTL/BURN/GPS-raderna visas inte.

2. Timer kör:
   - Minutknapparna döljs.
   - TTL, BURN, GPS och eventuell status visas.
   - Timer-rutan tar fortfarande tydlig plats men TTL/BURN/GPS är stora nog för att kunna läsas under segling.

Navigationslås:

- När starttimern kör sätter `AppShell` `isStartTimerRunning` till true.
- Manuell navigering till andra vyer blockeras då i `AppShell`.
- `NavigationBar` får `isLocked` och inaktiverar alla andra vyknappar än den aktiva.
- När timern pausas eller resetas låses navigationen upp.
- Automatisk övergång till Segling vid -0:10 är tillåten även om navigationen är låst.
- Efter automatisk övergång till Segling är navigationen upplåst igen.

Timerimplementation:

- `StartTimerView` använder `useCountdown` för sekundräkning.
- Själva sekundräkningen ägs fortfarande av Start-vyn.
- Den praktiska designen är därför att användaren inte ska kunna lämna Start-vyn medan timern kör.
- `AppShell` äger vald startlängd och `isStartTimerRunning`.

TTL/BURN:

- TTL = Time To Line.
- TTL är tid tills båtens aktuella rörelsevektor skär startlinjesegmentet A-B.
- TTL använder aktuell GPS-position, filtrerad GPS-fart och filtrerad GPS course over ground.
- TTL använder segmentet mellan A och B, inte en oändlig linje.
- TTL visas i hela sekunder.
- BURN = `countdownSeconds - TTL`.
- Positiv BURN betyder att båten är tidig och behöver bränna tid.
- Negativ BURN betyder att båten är sen.

Villkor för TTL/BURN:

- GPS-position finns.
- A och B finns.
- Aktuell GPS accuracy är högst 5 meter.
- Filtrerad fart är minst 1,0 knop.
- Filtrerad COG finns.
- Rörelsevektorn skär A-B-segmentet framför båten.

Statusprioritet:

1. `GPS SAKNAS`
2. `SAKNAR LINJE`
3. `GPS OSÄKER`
4. `FÖR LÅG FART`
5. `UTANFÖR LINJEN`
6. `LINJE OSÄKER`

`LINJE OSÄKER` visas om A eller B är poor. TTL/BURN beräknas ändå om övriga villkor uppfylls.

Bakgrundsstater för timern:

- Grå = stoppad eller pausad.
- Mörkgrön = körande nedräkning före start.
- Mörkröd = post-startperiod.

### Segling

Segling är den aktiva instrumentvyn under kappsegling.

Nuvarande beteende:

- Visar Fart.
- Visar Riktning.
- Visar VMG Vind eller VMG Bana.
- Värdena är stora och optimerade för läsbarhet på vatten.
- Fart visas med en decimal och svensk decimalcomma.
- Riktning visas som tre siffror och gradtecken, till exempel `097°`.
- Fart och riktning kommer från filtrerad live-GPS.
- Riktning visas bara när GPS course over ground bedöms pålitlig.
- Om fart eller pålitlig kurs saknas visas `--`.
- R/S visas kompakt längst ner, till exempel `R +8°   S -2°`.
- Om R/S inte är kalibrerat visas `R —   S —`.

VMG-läge:

- Om vind finns men primär bana saknas visas `VMG Vind`.
- Om K1 och L1 finns men vind saknas visas `VMG Bana`.
- Om både vind och primär bana finns kan användaren trycka på VMG-rutan för att växla mellan `VMG Vind` och `VMG Bana`.
- Om varken vind eller primär bana finns visas `Ej satt` och `--`.
- Toggle-valet sparas inte permanent.

Färger:

- VMG Vind använder mörkgrön bakgrund.
- VMG Bana använder mörkorange bakgrund.
- Ej satt använder grå/dimmad bakgrund.

Segling använder 1,5 knop som tröskel för pålitlig COG. Det är avsiktligt högre än TTL:s 1,0 knop eftersom Segling visar kontinuerlig riktning och VMG och behöver stabilare COG.

### Analys

Analys är en placeholder för framtida replay och efteranalys.

Nuvarande beteende:

- Visar svensk placeholdertext.
- Har placeholderknapp för spela/pausa.
- Har uppspelningshastigheter 1x, 2x och 4x.
- Ingen riktig raceinspelning, replaygrafik eller analysberäkning är kopplad ännu.

## 4. UI/UX-principer

Appen ska fungera på vattnet, med stora värden och låg kognitiv belastning.

Principer:

- Setup får ha mer statusinformation.
- Bana, Start och Segling ska ha minimalt med text.
- Viktiga värden ska vara mycket stora.
- Kontrast ska vara hög.
- Touchytor ska vara stora.
- iPhone porträttläge prioriteras.
- Safe area ska respekteras.
- Dynamic Island/statusbar-området ska inte innehålla tryckbara element.
- Hemindikatorns område ska lämnas fritt.

Start-vyn när timern kör prioriterar:

- stor men lägre timerpanel
- stora TTL/BURN-rader
- GPS-rad och eventuell statusrad

CSS använder `env(safe-area-inset-top)` och `env(safe-area-inset-bottom)` tillsammans med fallbackpadding. `viewport-fit=cover` används så safe area fungerar i iOS WebView.

## 5. State och dataflöde

Nuvarande state-flöde:

- `AppShell` äger aktiv vy.
- `AppShell` äger banstate: A, B, K1, L1 och vindriktning.
- `AppShell` äger vald startlängd som session-only state.
- `AppShell` äger `isStartTimerRunning` och använder det för att låsa navigation.
- `AppShell` äger runtime-kalibrering för rullning/stampning.
- `SetupView` visar sensorstatus och kalibrerar R/S.
- `CourseSetupView` renderar banan och anropar callbacks för punkter, vind och rensa bana.
- `CourseSetupView` använder `useWindHeadingMeasurement` när vindpilen trycks och vind saknas.
- `StartTimerView` äger countdownens sekunder/status via `useCountdown`.
- `StartTimerView` meddelar `AppShell` när timern kör via `onRunningChange`.
- `StartTimerView` anropar `onFinish` vid -0:10, vilket växlar till Segling.
- `RaceDashboardView` får banstate, filtrerad GPS-data och R/S som props.
- `NavigationBar` visar fem vyknappar och disablar inaktiva vyer när navigationen är låst.
- Live GPS-watch startas när aktiv vy inte är Analys.
- `useDeviceAttitude` är aktiv när aktiv vy är Setup eller Segling.
- `useFilteredGps` håller ungefär 3 sekunders glidande medelvärde för speed over ground och COG.

Det finns ingen permanent lagring ännu. Vald startlängd, banpunkter, vindriktning och R/S-kalibrering finns bara i React-minne.

## 6. Beräkningar

### Vinklar

`src/domain/angles.ts` innehåller hjälpfunktioner för vinkelhantering:

- grader normaliseras till 0–360
- `shortestAngleDeltaDegrees` ger kortaste vinkeldelta
- `averageAnglesDegrees` gör cirkulär medelvärdesbildning

### Banaxel och bearing

`calculateBearingDegrees` beräknar bäring mellan två GPS-punkter.

Banaxeln definieras som bäringen från L1 till K1. K1 behandlas som primärt kryssmärke och L1 som primärt länsmärke.

### Vindpilens rotation

Vindpilen visas relativt banaxeln när K1 och L1 finns:

```text
relativ vindvinkel = vindriktning - banaxelns heading
```

Om banaxeln saknas används 0° som referens.

### VMG Vind

VMG Vind beräknas som:

```text
fart * cos(vinkeln mellan båtens kurs och vindriktningen)
```

### VMG Bana

VMG Bana är nuvarande VMC mot banmål, men visas i UI som VMG Bana.

Den beräknas som:

```text
fart * cos(vinkeln mellan båtens kurs och bäringen till mål)
```

Nuvarande mål är K1 när K1 och L1 är satta. Aktiv växling mellan K1 och L1 är inte implementerad.

### TTL/BURN

TTL beräknas i `src/domain/startLine.ts`.

Metoden:

- aktuell båtposition används som lokal projektionsorigin
- A och B projiceras till lokala meterkoordinater
- GPS COG omvandlas till en ray från båtpositionen
- rayen måste skära startlinjesegmentet A-B framför båten
- skärning utanför segmentet eller bakom båten ger `TTL —`
- parallell ray ger `TTL —`

Farten konverteras med:

```text
1 knop = 0.514444 m/s
```

TTL avrundas till hela sekunder.

BURN beräknas som:

```text
nedräkningstid - TTL
```

### GPS-filtrering

`useFilteredGps` använder ungefär 3 sekunders historik.

- Speed over ground medelvärdesbildas aritmetiskt.
- Course over ground medelvärdesbildas cirkulärt.
- GPS accuracy visas som aktuell/latest accuracy och medelvärdesbildas inte för UI.
- Segling använder filtrerad fart och filtrerad COG.
- TTL/BURN använder filtrerad fart och filtrerad COG.

Trösklar:

- TTL/BURN kräver minst 1,0 knop.
- Segling kräver minst 1,5 knop för pålitlig COG.
- GPS accuracy högst 5 meter räknas som bra.

## 7. Sensorstrategi

Sensorstrategin finns även i `docs/sensors.md`.

GPS:

- `useLiveGps` använder Capacitor Geolocation.
- `enableHighAccuracy` är satt.
- GPS watch uppdaterar position, accuracy, fart, COG och timestamp.
- I native-läge används `position.coords.course` för COG.
- I browser/dev kan `position.coords.heading` användas som fallback.
- GPS-kurs räknas bara som pålitlig från 1,5 knop i live/filtered GPS.

Vind:

- Vind sätts inte från GPS-kurs.
- Vind mäts med Core Motion via native plugin.
- Pluginen samplar heading för telefonens bakåtriktade vektor.
- Eftersom telefonens baksida pekar mot fören motsvarar den vektorn båtens framåtriktning.
- Samples medelvärdesbildas cirkulärt i `useWindHeadingMeasurement`/`windHeadingService`.
- True north används i första hand.
- Magnetic north används som fallback när true north saknas.
- Magnetisk fallback är inte deklinationskorrigerad.

Rullning/stampning:

- `useDeviceAttitude` läser aktuell device attitude från native pluginen.
- Native pluginen beräknar R/S från Core Motions gravitationsvektor i telefonens monterade båtkoordinater.
- R/S beräknas inte direkt från rå `CMAttitude.roll`/`CMAttitude.pitch`.
- Kalibrering görs i React-state genom att aktuell R/S sparas som nolläge.
- `calculateRollPitchRelativeToCalibration` använder kortaste vinkeldelta mellan aktuell R/S och kalibrerad R/S.

## 8. iOS / Capacitor

Appen paketeras med Capacitor.

`capacitor.config.ts` använder:

- `appId`: `com.anflyg.sailraceapp`
- `appName`: `SailRaceApp`
- `webDir`: `dist`

iOS-projektet finns under `ios/App`.

Viktiga iOS-beslut:

- iPhone ska vara låst till porträtt.
- Safe area hanteras i CSS.
- Webbändringar måste byggas och synkas innan de syns i Xcode/iOS.
- Appen deployas direkt från Xcode under utveckling.
- `AppBridgeViewController` registrerar `WindHeadingPlugin`.
- `WindHeadingPlugin` exponerar `getBackVectorHeading`, `getDeviceAttitude` och `stopBackVectorHeading`.
- Samma plugin används för vindheading och R/S.

Standardflöde efter webbändringar:

```bash
npm run build
npm run cap:sync
npm run cap:open:ios
```

## 9. Nuvarande implementationstatus

Klart eller delvis klart:

- React/Vite/TypeScript-app med fem huvudvyer.
- Capacitor/iOS-projekt finns.
- Navigering mellan Setup, Bana, Start, Segling och Analys.
- Navigation låses när starttimern kör.
- iPhone safe area respekteras i CSS.
- iPhone porträttorientering är satt i iOS-konfiguration.
- iOS har `NSLocationWhenInUseUsageDescription` för GPS-behörighet.
- Bana kan sätta och rensa A/B/K1/L1 från live GPS-position.
- Bana visar punktkvalitet och startlinjekvalitet.
- Bana kan sätta/rensa vind via vindpilen.
- Bana ritar startlinje och märken visuellt.
- Start har valbar nedräkning, start/paus, långt tryck för reset och automatisk växling till Segling.
- Start visar TTL/BURN/GPS när timern kör.
- Start visar minutknappar när timern inte kör.
- Start visar post-startperiod utan minustecken.
- Vald startlängd lever under aktuell appsession.
- Segling visar stora instrumentvärden och VMG Vind/VMG Bana-växling.
- Segling visar R/S kompakt när nolläge är kalibrerat.
- Segling använder filtrerad live GPS för fart, position och COG när data finns.
- Grundläggande matematik för bearing, VMG, vinklar och TTL/BURN finns.

Inte klart:

- Testad Core Motion-vindmätning på flera fysiska monteringar.
- Långtidstest av R/S-mappning i faktisk mastmontering och under rörelse.
- Deklinationskorrigering när magnetic north används.
- Wake lock kopplad till UI/livscykel.
- Raceinspelning och lokal persistens.
- Analys/replay med riktig data.
- Aktivt ben/aktivt mål för VMG Bana.
- Fördjupad felhantering för sensorbehörigheter och dålig signalkvalitet.

## 10. Kända designbeslut och begränsningar

- Koden är sanningskälla för appens faktiska beteende.
- Appen prioriterar iPhone porträtt framför desktoplayout.
- Browserläge ska fortsätta fungera för snabb UI-testning.
- Setup får innehålla mer statusinformation än övriga seglingsvyer.
- Bana, Start och Segling ska inte fyllas med hjälpinstruktioner.
- K1/L1 är nuvarande primära banreferens.
- K2/L2 är borttagna.
- Gula punkter används men ska förstås som osäkra.
- VMG-matematiken ska inte ändras utan separat uppgift och testning.
- Timerlogiken är fortfarande komponentbaserad; därför låses navigationen när timern kör.
- Permanent lagring införs separat. Nuvarande state är medvetet flyktigt.

## 11. Rekommenderade nästa utvecklingssteg

1. Verifiera vindmätning med fysisk iPhone i faktisk montering.
2. Långtidstesta R/S under verklig segling.
3. Koppla `wakeLockService` till aktiv start-/seglingsperiod.
4. Lägg till raceinspelning som tidsserie.
5. Bygg Analys som replayvy baserad på inspelad data.
6. Lägg till aktivt ben och målval för VMG Bana.
7. Lägg till tester för vinklar, VMG-regler, TTL/BURN, R/S och timer-/navigationsbeteende.

## 12. Verifiering för framtida ändringar

Minimikontroller före commit:

```bash
npm run build
npx eslint .
```

Vid ändringar som ska testas i iPhone/Xcode:

```bash
npm run build
npm run cap:sync
npm run cap:open:ios
```

Manuell iPhone-verifiering bör kontrollera:

- UI ligger under Dynamic Island/statusbar.
- Övre safe area är svart och utan tryckbara element.
- Viktiga knappar ligger ovanför hemindikatorn.
- Appen roterar inte till landskap.
- Setup visar GPS, fart, COG, Motion, Heading och R/S.
- R/S kan kalibreras och visar rimliga värden.
- Bana visar bara A, B, K1 och L1.
- Bana kan sätta/rensa punkter och visa grå/grön/gul kvalitet.
- Bana kan mäta vind med vindpilen och rensa vind med nästa tryck.
- Start visar minutknappar när timern inte kör.
- Start visar TTL/BURN/GPS när timern kör.
- Start låser navigation när timern kör.
- Paus/reset låser upp navigation.
- Start växlar automatiskt till Segling vid intern -0:10.
- Segling visar läsbara instrumentvärden, R/S och VMG-växling.
