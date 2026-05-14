# Aster Race Design Document

Det här dokumentet beskriver nuvarande implementation i repo:t. När dokumentation och kod skiljer sig åt gäller koden.

## 1. Syfte

Aster Race är en iPhone-app för kappsegling. Appen ska hjälpa seglaren att:

- kontrollera GPS/sensorer och kalibrera rullning/stampning
- sätta upp en enkel kappseglingsbana
- hantera startnedräkning
- visa stora instrumentvärden under segling
- spara, spela upp och analysera seglingen efteråt

Appen är byggd för användarens egen iPhone under utveckling och körs i nuläget direkt via Xcode på fysisk iPhone, inte via App Store.

Brandingriktning:

- Performance Instrument + Nordic Premium.
- Mörk marin instrumentkänsla med hög kontrast för dagsljus.

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

Telefonmontering enligt kod och fysisk installationskrav:

- Telefonen sitter på masten.
- Telefonen sitter i portrait/stående.
- Telefonens högerkant motsvarar styrbord.
- Telefonens baksida pekar mot fören.
- Telefonens skärm pekar mot aktern.
- Telefonen kan luta lite framåt/bakåt beroende på mastlutning.

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
- När timern är stoppad eller pausad visas minutknapparna.
- När timern kör döljs minutknapparna och Start visar TTL, BURN, GPS och eventuell status.
- När timern kör tar timerrutan mindre vertikal plats än tidigare, medan TTL/BURN/GPS-raderna är kraftigt förstorade för läsbarhet på avstånd.
- TTL beräknas mot startlinjesegmentet A-B från aktuell GPS-position, filtrerad GPS-fart och filtrerad COG.
- BURN beräknas som `countdownSeconds - TTL`, där plus betyder tidig och minus betyder sen.
- TTL/BURN visas bara när GPS finns, A/B finns, aktuell GPS-accuracy är högst 5 meter, filtrerad fart är minst 1 knop och rörelsevektorn skär A-B-segmentet framför båten.
- TTL/BURN använder medvetet lägre farttröskel än Segling: 1,0 knop för att fungera tidigt i startmanövern.
- Statusprioritet är `GPS SAKNAS`, `SAKNAR LINJE`, `GPS OSÄKER`, `FÖR LÅG FART`, `UTANFÖR LINJEN`, `LINJE OSÄKER`.
- Medan timern är `running` är manuell navigation låst. Appen stannar på Start, övriga navigationsknappar är inaktiverade och användaren kan inte manuellt byta vy.
- När timern pausas eller återställs låses navigationen upp igen.
- Automatisk övergång vid intern `-0:10` är uttryckligen tillåten trots navigationslåset. Då växlar appen till Segling och navigationen låses upp.
- När en ny nedräkning startas skapar race logging-engine ett nytt race.
- Om ett aktivt race redan finns avslutas det innan nästa race skapas.
- När timern når 0 sätts `startGunTime` på det aktiva racet.
- Efter start fortsätter logging tills racet stoppas, ersätts av ny nedräkning eller auto-avslutas av stillaliggande heuristik.

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

- VMG Vind använder blå/cyan performance-stil.
- VMG Bana använder orange tactical/course-stil.
- Ej satt använder grå/dimmad bakgrund.

Segling använder 1,5 knop som tröskel för pålitlig COG. Det är avsiktligt högre än TTL:s 1,0 knop eftersom Segling visar kontinuerlig riktning och VMG och behöver stabilare COG.

### Analys

Analys är appens after-action-läge. Den får därför ha högre informationsdensitet än Bana,
Start och Segling: fler tabeller, mindre siffror och mer metadata är okej eftersom
användaren inte ska läsa den i samma stressade läge som under start eller aktiv segling.

Nuvarande beteende:

- Segmenterad kontroll med `Bibliotek`, `Översikt`, `Start`, `Grafer` och `Data`.
- `Bibliotek` är första vy och listar sparade race grupperade per datum.
- Racekort visar namn, datum/tid, duration, distans, maxfart, sample count och favoritstatus.
- Race kan öppnas, döpas om, raderas och favoritmarkeras från biblioteket.
- När ett race öppnas växlar Analys till `Översikt`.
- `Översikt` använder replay-engine med play/paus, reset, seek-slider och hastigheter 1x, 2x och 4x.
- Replay drivs av en central `currentReplayTime` och interpolerar aktuell position och data mellan samples.
- Datapanelen visar aktuell replaytid, fart, COG, VMG Bana, VMG Vind, lat/lon och GPS accuracy när data finns.
- Banvyn/kartan är en lokal SVG/projektionsvy utan extern kartleverantör.
- Kartan visar huvudspår, aktuell båtposition, startlinje, K1, L1 och vindpil när datan finns.
- Om K1 och L1 finns roteras banvyn så K1 ligger uppåt och L1 nedåt.
- Om K1/L1 saknas används nordorienterad vy.
- Ghost replay kan lägga ett andra race ovanpå huvudracet.
- Ghost använder samma `currentReplayTime` som huvudracet, men jämför relativ race-tid, inte absoluta klockslag.
- Ghost-spår och ghost-position visas tunnare och mer transparent än huvudracet.
- `Start` visar startanalys för valt race när startlinje, startskott och tillräckliga samples finns.
- Startanalys letar efter linjepassage nära startskottet, interpolerar passagetid/fart/COG och visar osäkerhet.
- `Grafer` och `Data` är reserverade för kommande analysundersidor.
- Om inget race är valt visas en tydlig uppmaning att välja race i biblioteket.
- Om valt race saknar samples visas tydlig tomdata-status i replay/karta.

Framtida analysidéer:

- grafer för fart, VMG, COG och eventuell vind över tid
- bästa segment idag
- referenslinje baserad på bästa segment
- estimerade K1/L1 från vändpunkter när bana saknas eller är osäker

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

Branding och färgpalett:

- Background primary: `#031426`
- Background secondary/fallback: `#061A33`
- Surface/cards: `#071F3D`
- Surface elevated: `#0A2A4D`
- Primary blue: `#0098F7`
- Primary light/cyan: `#35C2FF`
- Accent orange: `#FF8500`
- Text primary: `#FFFFFF`
- Text secondary: `#B9C6D3`
- Border subtle: `rgba(185, 198, 211, 0.22)`
- Border active: `rgba(53, 194, 255, 0.55)`

Färgroller:

- navy/mörkblå = bas/instrument
- blå/cyan = performance, vind och VMG Vind
- orange = tactical/course och VMG Bana
- vitt = primär data
- sekundär blågrå text = stödtext
- grönt/rött = status/alert (behålls för running/negativ timer och varningslägen)

Grafiska ändringar får inte ändra:

- vylogik
- navigation
- placering av data
- storlek på siffror
- race-/timer-/sensorlogik
- vystruktur eller instrumentlayout

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
- `StartTimerView` får banstate, live GPS och filtrerad GPS för TTL/BURN.
- `StartTimerView` meddelar `AppShell` när timern kör via `onRunningChange`.
- `StartTimerView` anropar `onFinish` vid -0:10, vilket växlar till Segling.
- `AppShell` kopplar starttimerflödet till `raceLogger`: start av nedräkning skapar nytt race, startskott markerar `startGunTime` och reset/ny start kan avsluta aktivt race.
- `RaceDashboardView` får banstate, filtrerad GPS-data och R/S som props.
- `NavigationBar` visar fem vyknappar och disablar inaktiva vyer när navigationen är låst.
- Live GPS-watch startas när aktiv vy inte är Analys.
- `useDeviceAttitude` är aktiv när aktiv vy är Setup eller Segling.
- `useFilteredGps` håller ungefär 3 sekunders glidande medelvärde för speed over ground och COG.
- `raceLogger` använder filtrerad live-GPS när start-/raceflödet är aktivt, men Analys startar aldrig logging bara genom att öppnas.
- `RaceAnalysisView` läser sparade race från storage-service och äger valt race, aktiv analysundersida, replay-state och ghost-val för analysflödet.

Lokal racepersistens:

- Race storage finns i `src/services/raceStorage.ts`.
- Datamodellerna ligger i `src/types/race.ts`: `SailingDay`, `Race`, `RaceSample`, `CourseDefinition` och `RaceSummary`.
- Storage använder `localStorage` med robust normalisering vid läsning och memory fallback om `localStorage` saknas.
- Race grupperas via `SailingDay` med datumformat `YYYY-MM-DD`.
- Flera race kan finnas samma datum.
- `deleteRace` tar även bort race-id från aktuell `SailingDay` och rensar tomma dagar.
- `appendRaceSample` räknar om summary, inklusive sample count, duration, distance, max speed och average speed när data finns.
- Exponerade operationer är bland annat `createRace`, `getRace`, `listRaces`, `listSailingDays`, `listRacesByDay`, `updateRace`, `deleteRace`, `renameRace`, `toggleFavorite` och `appendRaceSample`.
- Vald startlängd, banpunkter, vindriktning och R/S-kalibrering är fortfarande runtime-state och sparas inte permanent som användarinställningar.

Race logging:

- Logging-service finns i `src/services/raceLogger.ts`.
- Ny startnedräkning betyder nytt race.
- Aktivt race-id sparas separat från analysens valda race så modellen inte låses till ett enda öppet replay.
- Sampling är batterisnål och drivs av en central loggingloop via start-/raceflödet.
- Normal sampling sker var 5:e sekund.
- Sista minuten före planerat startskott samplas var 1:a sekund.
- Första 20 sekunderna efter startskott samplas var 1:a sekund.
- Därefter går sampling tillbaka till 5 sekunder.
- Om GPS-position saknas skapas inget tomt sample.
- Auto-stop görs när fart är under 0,8 knop i 10 minuter.
- Samples sparar minst timestamp, lat/lon och när tillgängligt accuracy, speedKnots och cogDegrees.
- Loggern sparar också `headingDegrees` om det skickas in samt `vmgCourseKnots` och `vmgWindKnots` när referensdata finns.

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

## VMG och VMC

`VMG Bana` är appens nuvarande VMC mot ett banmål. Referensen ska normalt vara K1,
aktivt banmål eller banaxeln, beroende på vilken analysnivå som finns tillgänglig.
Det här är den mest robusta VMG/VMC-varianten eftersom den bygger på GPS
course-over-ground och en geografisk referens, inte på telefonens sensorheading.

`VMG Vind` beräknas mot uppmätt vindriktning. I appen betyder vindriktning den
riktning vinden kommer från. När båten seglar uppvind, alltså mot den riktningen,
ska VMG Vind därför bli positiv.

Grundformeln är:

```text
speedKnots * cos(angleBetween(courseOverGround, referenceHeading))
```

Positivt värde betyder rörelse mot referensriktningen. Negativt värde betyder
rörelse bort från referensriktningen.

VMG Vind är känsligare än VMG Bana eftersom vindriktningen mäts via telefonens
sensorer och beror på korrekt montering, nordreferens och hur vindmätningen görs.
VMG Bana ska inte vara beroende av telefonens sensorheading.

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
- Native `WindHeading` använder `getBackVectorHeading` och beräknar heading från telefonens back vector.
- Back vector projiceras mot horisontalplanet innan heading räknas ut.
- Projektionen gör att roll, pitch och normal mastlutning inte ska ge ett systematiskt headingfel så länge telefonens back vector har tillräcklig horisontell komponent.
- Native-koden returnerar ingen heading om den horisontella komponenten är för svag.
- Samples medelvärdesbildas cirkulärt i `windHeadingService`.
- True north används i första hand.
- Magnetic north används som fallback när true north saknas.
- Magnetisk fallback är inte deklinationskorrigerad.
- `windHeadingService` returnerar även sample count, reference frame och accuracy-fält, men `useWindHeadingMeasurement` exponerar i nuläget bara själva headingvärdet till Bana.
- För att vindriktningen ska vara korrekt måste användaren mäta när telefonens baksida/fören representerar vindens riktning, normalt genom att båten pekar upp mot vinden vid mätningen.
- Den sparade vindriktningen ska tolkas som riktningen vinden kommer från, inte riktningen vinden blåser mot.
- Eftersom skärmen pekar akterut är det viktigt att all vindheading utgår från telefonens baksida. Nuvarande native-kod gör detta med back vector och undviker därmed en 180° skärm-/frontvektor-förväxling.

Rullning/stampning:

- `useDeviceAttitude` läser aktuell device attitude från native pluginen.
- Native pluginen beräknar R/S från Core Motions gravitationsvektor i telefonens monterade båtkoordinater.
- R/S beräknas inte direkt från rå `CMAttitude.roll`/`CMAttitude.pitch`.
- Kalibrering görs i React-state genom att aktuell R/S sparas som nolläge.
- `calculateRollPitchRelativeToCalibration` använder kortaste vinkeldelta mellan aktuell R/S och kalibrerad R/S.

Nuvarande sensorstatus:

- `sensorTypes.ts` definierar interface för GPS-position, GPS-fart, GPS-kurs, båtens framåtriktning och vindheading.
- `useLiveGps.ts` startar en live GPS-watch via Capacitor Geolocation när Setup, Bana, Start eller Segling är aktiv och exponerar status, fel, position, fart, kurs och kursens tillförlitlighet.
- `useFilteredGps.ts` filtrerar speed over ground och course over ground över ungefär 3 sekunder.
- `useDeviceAttitude.ts` läser rullning/stampning och headingstatus för Setup/Segling.
- `useWindHeadingMeasurement.ts` exponerar status, fel och en `measureWindHeading`-funktion för Bana.
- `windHeadingService.ts` samplar native-heading över tid, gör cirkulärt medelvärde och har en separat browser/mock-fallback.
- `startLine.ts` innehåller TTL/BURN-geometri för startlinjesegmentet A-B.
- `mockSensorService.ts` innehåller mockade sensorvärden och visar tänkt form för framtida implementation.
- `AppDelegate.swift` registrerar en Capacitor-plugin `WindHeading` som använder `CMDeviceMotion`.
- `geolocationService.ts`, `headingService.ts`, `wakeLockService.ts` och `raceRecordingService.ts` är stubs/TODO.

Om Core Motion, pluginen eller nordreferens saknas på native iOS sätts ingen fejkad vind. UI:t visar en kort felstatus och vind förblir ej satt.

Sensorgranskning 2026-05-14:

- `ios/App/App/AppDelegate.swift` registrerar native-pluginen `WindHeading`.
- `getBackVectorHeading` använder Core Motion attitude med true-north frame när den finns och magnetic-north frame som fallback.
- `backVectorHeadingDegrees(from:)` läser telefonens back vector från rotation matrix, projicerar den horisontellt och räknar heading med norr som 0°.
- `getDeviceAttitude` använder samma plugin och rapporterar om heading är tillgänglig.
- `deviceMotionService.ts` exponerar roll, pitch, reference frame och headingstatus till React.
- `CourseSetupView.tsx` sätter vindriktning via `useWindHeadingMeasurement`, vilket i sin tur samplar native back-vector heading.
- `RaceDashboardView.tsx` beräknar både VMG Bana och VMG Vind från GPS COG, inte från telefonens sensorheading.
- `raceLogger.ts` loggar `vmgCourseKnots` och `vmgWindKnots` från filtrerad GPS COG och ban-/vindreferens.
- `navigation.ts` innehåller den gemensamma VMG-formeln `speed * cos(angleBetween(courseOverGround, referenceHeading))`.

Bedömning:

- Krav 1, back vector: uppfyllt i native-koden.
- Krav 2, horisontal projektion: uppfyllt i native-koden.
- Krav 3, roll/pitch/mastlutning: hanteras genom projektionen, men bör fälttestas i faktisk mastmontering.
- Krav 4, 180°-risk från skärmen akterut: native-koden använder back vector och bör därför inte vara 180° fel på grund av skärmens riktning.
- Krav 5, VMG Vind-tolkning: kodens formel ger positivt värde vid rörelse mot sparad vindheading. Det är korrekt om sparad heading är vindens `from`-riktning.
- Krav 6, VMG Bana: uppfyllt; den bygger på GPS COG och geografiskt mål/banaxel, inte på sensorheading.

Kvarvarande risker:

- Magnetic-north fallback är inte deklinationskorrigerad och kan ge systematiskt fel jämfört med GPS true bearing.
- UI:t visar inte ännu vilken reference frame som användes vid vindmätning.
- UI:t visar inte sample count eller heading accuracy från vindmätningen, även om service-lagret har plats för den datan.
- Field test behövs för att bekräfta att mastlutning, vibrationer och magnetisk störning inte ger praktiskt headingfel.

Planerad sensor-debug i Setup/Bana:

- aktuell back-vector heading
- reference frame: true-north eller magnetic-north
- heading accuracy när native kan leverera den
- sample count vid vindmätning
- roll/pitch
- tydlig text: `Baksida mot fören`

Rekommenderad separat kommande uppgift: `Sensor calibration and heading validation`.

## 8. iOS / Capacitor

Appen paketeras med Capacitor.

`capacitor.config.ts` använder:

- `appId`: `com.anflyg.sailraceapp`
- `appName`: `SailRaceApp` (teknisk konfiguration)
- `webDir`: `dist`

Appnamn i iOS (visningsnamn):

- `CFBundleDisplayName`: `Aster Race`

iOS-projektet finns under `ios/App`.

Viktiga iOS-beslut:

- iPhone ska vara låst till porträtt.
- Safe area hanteras i CSS.
- Webbändringar syns inte i Xcode förrän appen har byggts och Capacitor har synkat eller kopierat `dist` till iOS-projektet.
- Under utveckling deployas appen direkt från Xcode till ansluten iPhone.
- `WindHeadingPlugin` är en liten lokal Capacitor-plugin för iOS som registreras från `AppDelegate.swift`.
- Samma plugin exponerar även aktuell device attitude för runtime R/S-kalibrering.
- Device attitude mappas till båtens axlar: telefonens högerkant är styrbord och telefonens baksida är fören.
- R/S beräknas från `CMDeviceMotion.gravity`: rullning från styrbordsaxelns uppkomponent och stampning från förens uppkomponent.
- Core Motion-baserad vindmätning kräver ingen extra Info.plist-rad i denna implementation.

Splashscreen:

- React-splash använder `AsterRaceSplash` med officiell primary logo (`src/assets/branding/aster-race-primary-logo.png`).
- Splashens timing är fade in + diskret leave-state (ingen layoutförändring av övriga vyer).
- Launch screen i iOS hålls mörk navy för att minimera vit blinkning vid uppstart.

Appikon:

- iOS appicon byggs från `aster-race-appicon-master.png` och ligger i `ios/App/App/Assets.xcassets/AppIcon.appiconset`.
- `Contents.json` innehåller iPhone-, iPad- och iOS-marketing-storlekar.

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
- Manuell navigation låses medan starttimern kör och låses upp vid paus, reset eller automatisk växling till Segling.
- iPhone safe area respekteras i CSS.
- iPhone porträttorientering är satt i iOS-konfiguration.
- iOS har `NSLocationWhenInUseUsageDescription` för GPS-behörighet.
- Bana kan sätta och rensa A/B/K1/L1 från live GPS-position.
- Bana visar punktkvalitet och startlinjekvalitet.
- Bana kan sätta/rensa vind via vindpilen.
- Bana ritar startlinje och märken visuellt.
- Start har valbar nedräkning, start/paus, långt tryck för reset och automatisk växling till Segling.
- Start visar stora TTL/BURN/GPS-rader när timern kör och har en lägre timerruta än tidigare utan att minska timerns sifferstorlek.
- Start visar post-startperiod utan minustecken.
- Vald startlängd lever under aktuell appsession.
- Segling visar stora instrumentvärden och VMG Vind/VMG Bana-växling.
- Segling visar R/S kompakt när nolläge är kalibrerat.
- Segling använder filtrerad live GPS för fart, position och COG när data finns.
- Grundläggande matematik för bearing, VMG, vinklar och TTL/BURN finns.
- Race storage/datamodell för `SailingDay`, `Race`, `RaceSample`, `CourseDefinition` och `RaceSummary`.
- Lokal persistens för race med listning, daggruppering, uppdatering, radering, rename, favorit och append av samples.
- Automatisk race logging kopplad till startnedräkning.
- Batterisnål sampling: 5 s normalt, 1 s sista minuten före start och 1 s första 20 s efter start.
- Racebibliotek i Analys med race grupperade per datum.
- Replay-engine med `currentReplayTime`, play/paus/reset/seek, hastigheter och sampleinterpolation.
- Analys/Översikt med replaykontroller och datapanel.
- Banvy/karta i Analys som roterar K1 uppåt och L1 nedåt när banmärken finns.
- Startanalys med linjepassage, delta mot startskott och konservativ osäkerhet.
- Ghost replay med ett ghost-race synkat mot samma `currentReplayTime`.

Inte klart:

- Testad Core Motion-vindmätning på flera fysiska monteringar.
- Långtidstest av R/S-mappning i faktisk mastmontering och under rörelse.
- Deklinationskorrigering när magnetic north används.
- Sensor-debug i Setup/Bana för back-vector heading, reference frame, sample count, accuracy och roll/pitch.
- Sensor calibration and heading validation.
- Wake lock kopplad till UI/livscykel.
- Aktivt ben/aktivt mål för VMG Bana.
- Grafer i Analys.
- Bästa segment idag.
- Referenslinje baserad på bästa segment.
- Estimerade K1/L1 från vändpunkter.
- Flera ghost-/overlay-spår.
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
- VMG Bana/VMC bygger på GPS COG och geografiskt mål/banaxel.
- VMG Vind bygger på GPS COG mot uppmätt vindriktning, där vindriktning betyder riktningen vinden kommer från.
- Timerlogiken är fortfarande komponentbaserad; därför låses navigationen när timern kör.
- Racepersistens finns lokalt, men banstate, startlängd och R/S-kalibrering är fortfarande medvetet flyktiga runtimevärden.
- Analys är after-action och får därför vara informationsrikare än de aktiva seglingsvyerna.
- Replay och ghost replay drivs av relativ race-tid via `currentReplayTime`, inte av absoluta klockslag.
- Telefonens fysiska montage är ett hårt antagande för sensorlogiken: stående på masten, baksidan mot fören, skärmen mot aktern.
- Ändringar i branding/färg får inte ändra vystruktur, storlekar, spacing, placering eller logik utan separat beslut.

## 11. Rekommenderade nästa utvecklingssteg

1. Bygg `Sensor calibration and heading validation` med tydlig debug för back-vector heading, reference frame, sample count, accuracy och roll/pitch.
2. Verifiera vindmätning med fysisk iPhone i faktisk mastmontering.
3. Långtidstesta R/S under verklig segling.
4. Koppla `wakeLockService` till aktiv start-/seglingsperiod.
5. Lägg till aktivt ben och målval för VMG Bana.
6. Bygg grafer i Analys för fart, VMG, COG och vind över tid.
7. Bygg bästa segment idag och referenslinje baserad på bästa segment.
8. Estimera K1/L1 från vändpunkter när bana saknas.
9. Lägg till tester för vinklar, VMG-regler, TTL/BURN, R/S, replay, startanalys och timer-/navigationsbeteende.

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
- Fysisk montering följer kravet: telefonen står på masten med baksidan mot fören och skärmen mot aktern.
- Vindmätning visar rimlig riktning när fören/baksidan pekar upp mot vinden.
- Bana visar bara A, B, K1 och L1.
- Bana kan sätta/rensa punkter och visa grå/grön/gul kvalitet.
- Bana kan mäta vind med vindpilen och rensa vind med nästa tryck.
- Start visar minutknappar när timern inte kör och TTL/BURN/GPS när timern kör.
- Start låser manuell navigation medan timern kör.
- Paus och långtrycksreset på Start låser upp navigationen.
- Start kan starta, pausa, återställa och växla till Segling vid intern -0:10.
- Automatisk växling till Segling vid intern -0:10 fungerar trots navigationslåset och låser upp navigationen efteråt.
- Segling visar läsbara instrumentvärden, R/S och VMG-växling fungerar när både vind och primär bana finns.
- Startnedräkning skapar ett race och sätter `startGunTime` vid 0.
- Racebiblioteket listar sparade race grupperade per datum och kan rename/delete/favorite.
- Översikt kan spela upp valt race med play/paus, seek och hastighet.
- Banvyn visar spår, aktuell position och roterar K1 uppåt/L1 nedåt när båda finns.
- Ghost replay visar ett annat race med samma relativa replaytid.
- Startanalys visar korrekt saknad-data-status när startlinje, startskott eller samples saknas.
