# SailRaceApp Design Document

## 1. Syfte

SailRaceApp är en iPhone-app för användning under kappsegling. Appen ska hjälpa seglaren med fyra huvudmoment:

- sätta upp kappseglingsbanan
- hantera startnedräkning
- visa en enkel instrumentvy under segling
- senare kunna spela upp och analysera seglingen efteråt

Appen är i första hand byggd för användarens egen iPhone under utveckling. Den är inte utformad för App Store-distribution i nuläget, utan körs direkt via Xcode på en fysisk iPhone.

## 2. Plattform och teknikval

Projektet använder:

- React för UI och vylogik.
- TypeScript för tydligare datamodeller och säkrare ändringar.
- Vite för snabb lokal utveckling och produktionbygge.
- Capacitor för att paketera webbappen som en iOS-app.
- iOS/Xcode för körning på fysisk iPhone.

Den här stacken valdes för att appens UI snabbt kan byggas och testas i webbläsare, samtidigt som samma kod kan paketeras till en riktig iPhone-app med Capacitor. Det gör det möjligt att utveckla vyer och beräkningar snabbt i webbläsare, och sedan verifiera safe area, orientering, touchytor och native-beteende på riktig telefon.

Browser-testning fungerar med npm och Vite. iPhone-testning kräver att webbappen byggs, att Capacitor synkar de byggda filerna till iOS-projektet och att projektet öppnas i Xcode. Den nuvarande iOS-appen deployas direkt från Xcode till ansluten iPhone.

Användbara kommandon:

```bash
npm install
npm run dev
npm run build
npm run cap:sync
npm run cap:open:ios
```

## 3. Huvudvyer

Appen har fem huvudvyer i navigeringen: Setup, Bana, Start, Segling och Analys.

### Setup

Syftet med Setup är att visa sensorstatus och kalibrera nolläge för heel/pitch.

Nuvarande beteende:

- Visar GPS-accuracy med `OK`, `GPS OSÄKER` eller `GPS SAKNAS`.
- Visar filtrerad fart i knop.
- Visar filtrerad COG när den är användbar.
- Visar Motion/Heading som `OK` bara när native sensor/plugin faktiskt ger data.
- Visar `H —` och `P —` innan kalibrering.
- Knappen `Kalibrera nolläge` sparar aktuell heel/pitch som runtime-nolläge.
- Efter kalibrering visar Setup relativ H/P, till exempel `H +0°` och `P +0°`.
- Kalibrering sparas inte permanent och återställs vid apprestart/reload.

### Bana

Syftet med Bana är att sätta banpunkter, sätta vindriktning och skapa en banreferens från L1 till K1.

Nuvarande beteende:

- A och B är startlinjens punkter.
- K1 är primärt kryssmärke.
- L1 är primärt länsmärke.
- K2 och L2 är borttagna ur UI och datamodell.
- K1 visas centrerat upptill, L1 centrerat nedtill, A till vänster och B till höger.
- Tryck på en punkt togglar den mellan satt och ej satt.
- När en punkt sätts sparas aktuell live GPS-position som punktens latitud/longitud samt GPS-accuracy vid sättning.
- Punktkvalitet är `good` när accuracy är högst 5 meter och `poor` när accuracy är sämre än 5 meter.
- Ej satta punkter visas grå, good-punkter gröna och poor-punkter gula.
- Gula punkter används fortfarande i beräkningar.
- Startlinjen är grå om A eller B saknas, grön om båda är good och gul om någon av A/B är poor.
- Om GPS-position saknas sätts ingen fejkad koordinat och punkten förblir ej satt.
- En kort statusrad visar `GPS-position saknas` när användaren försöker sätta en punkt utan tillgänglig GPS-position.
- Bana visar aktuell GPS-accuracy längst ner med `GPS SAKNAS` eller `GPS OSÄKER` vid behov.
- När vind är ej satt startar tryck på vindpilen en Core Motion-baserad
  vindmätning på iOS.
- När vind redan är satt rensar tryck på vindpilen vindriktningen.
- Under vindmätning visas kort status, till exempel `Mäter vind...`.
- `Rensa bana` rensar alla banpunkter och vindriktning.
- När K1 och L1 finns beräknas banaxeln som bäringen från L1 till K1.
- Vindpilen ritas relativt banaxeln när banaxeln finns. Om banaxeln saknas visas pilen relativt verklig nord.

Banpunkterna sparas i React-state och kommer från live GPS. Vindriktning mäts på iOS från telefonens bakåtriktade vektor via Core Motion. I webbläsarutveckling används en tydligt separerad mockmätning.

### Start

Syftet med Start är att hantera kappseglingens startnedräkning.

Nuvarande beteende:

- Nedräkningen kan väljas till 5, 4, 3, 2 eller 1 minut.
- Vald startlängd koms ihåg under aktuell React-session.
- Vid full apprestart eller webbläsarreload återgår vald längd till 5 minuter.
- Tryck på den stora timern startar eller pausar.
- Långt tryck på timern återställer till vald längd.
- När timern passerar 0:00 fortsätter den internt till -0:10.
- Den negativa perioden visas utan minustecken. Röd bakgrund räcker som signal för post-starttid.
- Vid intern tid -0:10 pausas timern och appen växlar automatiskt till Segling.
- När timern är stoppad eller pausad visas minutknapparna.
- När timern kör döljs minutknapparna och Start visar TTL, BURN, GPS och eventuell status.
- TTL beräknas mot startlinjesegmentet A-B från aktuell GPS-position, filtrerad GPS-fart och filtrerad COG.
- BURN beräknas som `countdownSeconds - TTL`, där plus betyder tidig och minus betyder sen.
- TTL/BURN visas bara när GPS finns, A/B finns, aktuell GPS-accuracy är högst 5 meter, filtrerad fart är minst 1 knop och rörelsevektorn skär A-B-segmentet framför båten.
- Statusprioritet är `GPS SAKNAS`, `SAKNAR LINJE`, `GPS OSÄKER`, `FÖR LÅG FART`, `UTANFÖR LINJEN`, `LINJE OSÄKER`.

Bakgrundsstater:

- Grå = idle eller pausad.
- Mörkgrön = körande nedräkning före start, `seconds >= 0`.
- Mörkröd = post-startperiod, `seconds < 0`.

Timerlogiken ligger i `useCountdown`. Startvyn äger själva sekundräkningen medan `AppShell` äger vald startlängd för att valet ska överleva navigation bort från och tillbaka till Start.

### Segling

Syftet med Segling är att vara den aktiva instrumentvyn under kappsegling.

Nuvarande beteende:

- Visar Fart.
- Visar Riktning.
- Visar VMG Vind eller VMG Bana.
- Värdena är mycket stora och fyller större delen av skärmen.
- Fart visas med en decimal och svensk decimalcomma.
- Riktning visas som tre siffror och gradtecken, till exempel `097°`.
- Fart hämtas från live GPS när GPS-fart finns.
- Riktning hämtas från GPS course over ground endast när kursen är pålitlig.
- Om GPS-fart eller pålitlig GPS-kurs saknas visas `--` i stället för demovärden.

VMG-läge:

- Om vind finns men ingen primär bana finns visas `VMG Vind`.
- Om K1 och L1 finns men ingen vind finns visas `VMG Bana`.
- Om både vind och primär bana finns kan användaren trycka på VMG-rutan för att växla mellan `VMG Vind` och `VMG Bana`.
- Om varken vind eller primär bana finns visas `Ej satt` och `--`.
- H/P visas kompakt längst ner, till exempel `H +8°   P -2°`.
- Om H/P inte är kalibrerat visas `H —   P —`.

Färgkodning:

- VMG Vind använder mörkgrön bakgrund.
- VMG Bana använder mörkorange bakgrund.
- Ej satt använder grå/dimmad bakgrund.

Segling använder filtrerad live GPS för fart, riktning och VMG-beräkningar. Course over ground används bara när filtrerad GPS-fart är minst `1.5` knop. GPS-kurs används inte för att sätta vind; vind sätts från Core Motion-mätning i Bana.

### Analys

Syftet med Analys är framtida replay och efteranalys av seglingen.

Nuvarande beteende:

- Placeholdervy med svensk text.
- Placeholderknapp för spela/pausa.
- Uppspelningshastigheter 1x, 2x och 4x.

Ingen riktig raceinspelning, replaygrafik eller analysberäkning är kopplad ännu.

## 4. UI/UX-principer

Appen ska fungera på vattnet, där användaren har begränsad tid, rörelse i båten och svårare läsbarhet än vid skrivbordet.

Principer:

- Bana, Start och Segling ska ha minimalt med text.
- Viktiga värden ska vara mycket stora.
- Kontrast ska vara hög.
- Antalet kontroller ska vara lågt.
- Touchytor ska vara stora och lätta att träffa.
- Appen ska vara optimerad för iPhone i porträttläge.
- iPhone safe area ska respekteras.
- Området för Dynamic Island, kamera och statusbar ska vara svart och utan tryckbara UI-element.
- Hemindikatorns område ska lämnas fritt så viktiga knappar inte hamnar för lågt.
- Ingen onödig instruktionstext ska visas i Bana, Start och Segling.

CSS använder `env(safe-area-inset-top)` och `env(safe-area-inset-bottom)` tillsammans med fallbackpadding. `index.html` använder `viewport-fit=cover` så safe area-värden fungerar i iOS WebView. iPhone-orienteringen är låst till porträtt i iOS-konfigurationen.

## 5. State och dataflöde

Nuvarande React-state:

- `AppShell` äger aktiv vy.
- `AppShell` äger banstate: banpunkter och vindriktning.
- `AppShell` äger vald startlängd som session-only state.
- `AppShell` äger runtime-kalibrering för heel/pitch.
- `SetupView` visar sensorstatus och kalibrerar heel/pitch.
- `CourseSetupView` renderar banan och anropar callbacks för att toggla punkter, vind och rensa bana.
- `CourseSetupView` använder `useWindHeadingMeasurement` när vindpilen trycks och vind inte redan är satt.
- `StartTimerView` äger countdownens sekunder/status via `useCountdown`.
- `StartTimerView` får banstate, live GPS och filtrerad GPS för TTL/BURN.
- `RaceDashboardView` får banstate, filtrerad GPS-data och H/P som props.
- Live GPS-watch startas när Setup, Bana, Start eller Segling är aktiv.
- Bana använder live GPS-position när användaren sätter A, B, K1 och L1.
- `useFilteredGps` håller ungefär 3 sekunders glidande medelvärde för speed over ground och course over ground.
- `useDeviceAttitude` läser Core Motion-attitude via native plugin när Setup eller Segling är aktiv.

Det finns ingen permanent lagring ännu. Vald startlängd sparas inte i `localStorage` och återställs till 5 minuter vid apprestart. Banpunkter, vindriktning och H/P-kalibrering är också bara React-minne.

Troliga framtida ändringar:

- Raceinspelning läggs till och sparar tidsserie med position, fart, riktning, vind, VMG och events.
- Analysvyn läser inspelad data och visar replay.

## 6. Beräkningar

### Vinklar

`src/domain/angles.ts` innehåller hjälpfunktioner för vinkelhantering:

- Grader normaliseras till intervallet 0 till mindre än 360.
- `shortestAngleDeltaDegrees` ger kortaste differensen mellan två vinklar.
- `averageAnglesDegrees` gör cirkulär medelvärdesbildning via sinus/cosinus, så värden runt 0/359 hanteras korrekt.

### Bearing

`calculateBearingDegrees` beräknar bäringen mellan två GPS-punkter med latitud och longitud.

Banaxeln definieras som bäringen från L1 till K1. K1 behandlas därmed som banans primära kryssmärke och "uppåt"/upwind-referens i nuvarande modell.

### Vindpilens rotation

Vindpilen visas relativt banaxeln när K1 och L1 finns:

```text
relativ vindvinkel = vindriktning - banaxelns heading
```

Om banaxeln saknas används `0` som referens, vilket gör att pilen visas relativt verklig nord.

### VMG Vind

VMG Vind beräknas som:

```text
fart * cos(vinkeln mellan båtens kurs och vindriktningen)
```

VMG används när vindriktning finns.

### VMG Bana

VMG Bana är nuvarande VMC mot banmål och beräknas som:

```text
fart * cos(vinkeln mellan båtens kurs och bäringen till mål)
```

Nuvarande mål är K1 när K1 och L1 är satta. Aktiv växling mellan K1 och L1 är inte implementerad i denna etapp.

### TTL/BURN

TTL, Time To Line, beräknas med lokal meterprojektion nära aktuell GPS-position:

- P är båtens aktuella GPS-position.
- A-B är startlinjesegmentet.
- Rörelsevektorn kommer från filtrerad GPS COG.
- Farten kommer från filtrerad GPS SOG.
- Ray från P måste skära segmentet A-B framför båten.

Om rayen är parallell, skär bakom båten eller skär utanför segmentet visas `TTL —` och status `UTANFÖR LINJEN`.

BURN beräknas som:

```text
nedräkningstid - TTL
```

Positiv BURN betyder att båten är tidig och behöver bränna tid.

### Nuvarande datakällor

Segling använder live GPS där data finns:

- GPS-fart konverteras från meter per sekund till knop.
- GPS speed/course filtreras över ungefär 3 sekunder innan de används för Segling och TTL/BURN.
- GPS course over ground används bara för Riktning och VMG när kursen finns, är icke-negativ och filtrerad fart är minst `1.5` knop.
- GPS-position används för VMG Bana-bäring till K1 när K1/L1 är satta.
- Om GPS-data saknas eller är opålitlig visas `--`.

Bana använder live GPS-position för banpunkter. Vind sätts via Core Motion-baserad mätning på iOS och via separat mockmätning i browser/dev.

## 7. Sensorstrategi

Sensorstrategin finns beskriven i `docs/sensors.md` och utgår från att iPhone monteras vertikalt på masten:

- Telefonens ovankant pekar uppåt.
- Telefonens baksida pekar mot fören.
- Telefonens skärm pekar mot aktern.
- Masten kan luta bakåt, böjas och påverkas av krängning.

Konsekvensen är att enkla kompass-API:er eller rå magnetometer inte är tillräckligt robusta för vindmätning.

Strategi under segling:

- Använd GPS-fart för båtfart.
- Använd GPS course over ground för båtriktning när farten är tillräckligt hög för att kursen ska vara stabil.
- Steg 1 av riktig sensorintegration är implementerat: Segling använder live GPS för fart, position och course over ground.
- Steg 2 är implementerat: Bana använder live GPS-position när banpunkter sätts.
- Steg 3 är implementerat: Bana kan sätta vind från iOS Core Motion när vindpilen trycks.
- GPS-accuracy högst 5 meter räknas som bra för punktkvalitet och TTL/BURN.
- Speed/course filtreras över ungefär 3 sekunder för lugnare instrumentvärden.
- GPS-kurs räknas som pålitlig först från `1.5` knop.
- VMG Vind/VMG Bana använder live GPS-fart och pålitlig GPS-kurs när relevant referens finns.
- VMG Bana använder live GPS-position för bäring till K1 när primär bana finns.

Strategi för att sätta vind vid låg fart eller baninställning:

- Lita inte på GPS-kurs.
- GPS-kurs används inte för vindinställning.
- Använd iOS Core Motion med fused attitude.
- Beräkna horisontell heading för telefonens bakåtriktade vektor.
- Eftersom telefonens baksida pekar mot fören motsvarar den vektorn båtens framåtriktning.
- Ta samples under 2 sekunder med ungefär 10 Hz och kräv minst 5 giltiga samples.
- Gör cirkulärt medelvärde med `averageAnglesDegrees`.
- Föredra Core Motion-referensen `xTrueNorthZVertical`.
- Använd `xMagneticNorthZVertical` som dokumenterad fallback om true north saknas.
- Magnetisk fallback är inte deklinationskorrigerad ännu.
- Undvik rå magnetometer direkt om det går.

Nuvarande status:

- `sensorTypes.ts` definierar interface för GPS-position, GPS-fart, GPS-kurs, båtens framåtriktning och vindheading.
- `useLiveGps.ts` startar en live GPS-watch via Capacitor Geolocation när Bana eller Segling är aktiv och exponerar status, fel, position, fart, kurs och kursens tillförlitlighet.
- `useFilteredGps.ts` filtrerar speed over ground och course over ground över ungefär 3 sekunder.
- `useDeviceAttitude.ts` läser heel/pitch och headingstatus för Setup/Segling.
- `useWindHeadingMeasurement.ts` exponerar status, fel och en `measureWindHeading`-funktion för Bana.
- `windHeadingService.ts` samplar native-heading över tid, gör cirkulärt medelvärde och har en separat browser/mock-fallback.
- `startLine.ts` innehåller TTL/BURN-geometri för startlinjesegmentet A-B.
- `mockSensorService.ts` innehåller mockade sensorvärden och visar tänkt form för framtida implementation.
- `AppDelegate.swift` registrerar en Capacitor-plugin `WindHeading` som använder `CMDeviceMotion`.
- `geolocationService.ts`, `headingService.ts`, `wakeLockService.ts` och `raceRecordingService.ts` är stubs/TODO.

Om Core Motion, pluginen eller nordreferens saknas på native iOS sätts ingen fejkad vind. UI:t visar en kort felstatus och vind förblir ej satt.

## 8. iOS / Capacitor

Appen paketeras med Capacitor. `capacitor.config.ts` använder:

- `appId`: `com.anflyg.sailraceapp`
- `appName`: `SailRaceApp`
- `webDir`: `dist`

iOS-projektet finns under `ios/App` och öppnas i Xcode. Appen har testats på riktig iPhone via Xcode.

Viktiga iOS-beslut:

- iPhone ska vara låst till porträtt.
- Safe area hanteras i CSS.
- Webbändringar syns inte i Xcode förrän appen har byggts och Capacitor har synkat eller kopierat `dist` till iOS-projektet.
- Under utveckling deployas appen direkt från Xcode till ansluten iPhone.
- `WindHeadingPlugin` är en liten lokal Capacitor-plugin för iOS som registreras från `AppDelegate.swift`.
- Samma plugin exponerar även aktuell device attitude för runtime H/P-kalibrering.
- Core Motion-baserad vindmätning kräver ingen extra Info.plist-rad i denna implementation.

Standardflöde efter webbändringar:

```bash
npm run build
npm run cap:sync
npm run cap:open:ios
```

För snabbare webbutveckling:

```bash
npm run dev
```

## 9. Nuvarande implementationstatus

Klart eller delvis klart:

- React/Vite/TypeScript-app med fem huvudvyer.
- Capacitor/iOS-projekt finns.
- Navigering mellan Setup, Bana, Start, Segling och Analys.
- iPhone safe area respekteras i CSS.
- iPhone porträttorientering är satt i iOS-konfiguration.
- iOS har `NSLocationWhenInUseUsageDescription` för GPS-behörighet.
- Bana kan toggla A/B/K1/L1 från live GPS-position och vind.
- Bana visar punktkvalitet och startlinjekvalitet.
- Bana kan sätta vind via iOS Core Motion och rensa vind genom att trycka på vindpilen igen.
- Bana ritar startlinje och märken visuellt.
- Start har valbar nedräkning, start/paus, långt tryck för reset och automatisk växling till Segling.
- Start visar TTL/BURN/GPS när timern kör.
- Start visar post-startperiod utan minustecken.
- Vald startlängd lever under aktuell appsession.
- Segling visar stora instrumentvärden och VMG Vind/VMG Bana-växling.
- Segling visar H/P kompakt när nolläge är kalibrerat.
- Segling använder live GPS för fart, position och course over ground när data finns.
- Grundläggande matematik för bearing, VMG och vinklar finns.
- Sensorstrategi är dokumenterad.

Inte klart:

- Testad kalibrering av Core Motion-heading på flera fysiska monteringar.
- Testad mapping av H/P mot faktisk mastmontering och båtens rörelser.
- Deklinationskorrigering när magnetisk nordfallback används.
- Wake lock kopplad till UI/livscykel.
- Raceinspelning och lokal persistens.
- Analys/replay med riktig data.
- Aktivt ben/aktivt mål för VMG Bana.
- Felhantering för sensorbehörigheter och dålig signalkvalitet.

## 10. Kända designbeslut och begränsningar

- Appen prioriterar iPhone porträtt framför desktoplayout.
- Browserläget ska fortsätta fungera för snabb UI-testning.
- Bana, Start och Segling ska inte fyllas med hjälpinstruktioner; de ska fungera som verktygsytor.
- K1/L1 är nuvarande primära banreferens. K2/L2 är borttagna i denna förenklade banmodell.
- VMG-matematiken ska inte ändras utan separat uppgift och tydlig testning.
- Sensorarkitekturen ska byggas stegvis och inte blandas in i rena UI-uppgifter.
- Permanent lagring ska införas separat. Nuvarande session-state är medvetet flyktigt.

Ingen separat produkt-specifikationsfil utöver README, `docs/sensors.md` och den nuvarande implementationen hittades i repo-genomgången. Den här designfilen sammanfattar därför den specifikation som framgår av befintliga docs, kod och senast implementerade produktbeslut.

## 11. Rekommenderade nästa utvecklingssteg

1. Verifiera Core Motion-heading på fysisk iPhone i den faktiska mastmonteringen.
2. Kalibrera eller korrigera magnetisk fallback om true north saknas.
3. Koppla `wakeLockService` till aktiv seglings-/startperiod.
4. Lägg till raceinspelning som tidsserie.
5. Bygg Analys som replayvy baserad på inspelad data.
6. Lägg till aktivt ben och målval för VMG Bana.
7. Lägg till fokuserade tester för vinkelberäkningar, VMG-regler, TTL/BURN och timerbeteende.

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
- Appen roterar inte till landskap på iPhone.
- Bana kan sätta och rensa punkter.
- Bana kan mäta vind med vindpilen, visa kort status och rensa vind med nästa tryck.
- Bana visar bara A, B, K1 och L1.
- Start visar minutknappar när timern inte kör och TTL/BURN/GPS när timern kör.
- Start kan starta, pausa, återställa och växla till Segling vid intern -0:10.
- Segling visar läsbara instrumentvärden, H/P och VMG-växling fungerar när både vind och primär bana finns.
