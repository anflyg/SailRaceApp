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

Appen har fyra huvudvyer i navigeringen: Bana, Start, Segling och Analys.

### Bana

Syftet med Bana är att sätta banpunkter, sätta vindriktning och skapa en banreferens från L1 till K1.

Nuvarande beteende:

- A och B är startlinjens punkter.
- K1 och K2 är kryssmärken.
- L1 och L2 är länsmärken.
- K1 visas visuellt uppe till höger och K2 uppe till vänster, men K1 är fortfarande datanyckeln `kryss1` och K2 är `kryss2`.
- Tryck på en punkt togglar den mellan satt och ej satt.
- Vindpilen togglar vind satt/ej satt.
- `Rensa bana` rensar alla banpunkter och vindriktning.
- När K1 och L1 finns beräknas banaxeln som bäringen från L1 till K1.
- Vindpilen ritas relativt banaxeln när banaxeln finns. Om banaxeln saknas visas pilen relativt verklig nord.

Nuvarande implementation använder demopunkter i `AppShell`, inte riktig GPS-positionering.

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
- Visar VMG eller VMC.
- Värdena är mycket stora och fyller större delen av skärmen.
- Fart visas med en decimal och svensk decimalcomma.
- Riktning visas som tre siffror och gradtecken, till exempel `097°`.
- Fart hämtas från live GPS när GPS-fart finns.
- Riktning hämtas från GPS course over ground endast när kursen är pålitlig.
- Om GPS-fart eller pålitlig GPS-kurs saknas visas `--` i stället för demovärden.

VMG/VMC-läge:

- Om vind finns men ingen primär bana finns visas `VMG vind`.
- Om K1 och L1 finns men ingen vind finns visas `VMC mål`.
- Om både vind och primär bana finns kan användaren trycka på VMG/VMC-rutan för att växla mellan `VMG vind` och `VMC mål`.
- Om varken vind eller primär bana finns visas `Ej satt` och `--`.

Färgkodning:

- VMG vind använder mörkgrön bakgrund.
- VMC mål använder mörkorange bakgrund.
- Ej satt använder grå/dimmad bakgrund.

Segling använder nu live GPS för fart, position och course over ground. Course over ground används bara när GPS-farten är minst `1.5` knop. GPS-kurs används inte för att sätta vind; Core Motion-baserad vindmätning är fortfarande en framtida uppgift.

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
- `CourseSetupView` renderar banan och anropar callbacks för att toggla punkter, vind och rensa bana.
- `StartTimerView` äger countdownens sekunder/status via `useCountdown`.
- `RaceDashboardView` får banstate och live GPS-data som props.
- Live GPS-watch startas bara när Segling är aktiv, så iOS ber om platsbehörighet först när GPS behövs.
- Mockade banpunkter används fortfarande i `AppShell`.

Det finns ingen permanent lagring ännu. Vald startlängd sparas inte i `localStorage` och återställs till 5 minuter vid apprestart. Banpunkter och vindriktning är också bara React-minne.

Troliga framtida ändringar:

- Banpunkter sätts från aktuell GPS-position i stället för demopunkter.
- Vindriktning sätts från Core Motion-baserad mätning.
- Raceinspelning läggs till och sparar tidsserie med position, fart, riktning, vind, VMG/VMC och events.
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

### VMG

VMG vind beräknas som:

```text
fart * cos(vinkeln mellan båtens kurs och vindriktningen)
```

VMG används när vindriktning finns.

### VMC

VMC mål beräknas som:

```text
fart * cos(vinkeln mellan båtens kurs och bäringen till mål)
```

Nuvarande mål är K1 när K1 och L1 är satta. Framtida arbete bör stödja aktivt ben och målval, till exempel K1 på kryss och L1 på läns.

### Nuvarande datakällor

Segling använder live GPS där data finns:

- GPS-fart konverteras från meter per sekund till knop.
- GPS course over ground används bara för Riktning och VMG/VMC när kursen finns, är icke-negativ och farten är minst `1.5` knop.
- GPS-position används för VMC-bäring till K1 när K1/L1 är satta.
- Om GPS-data saknas eller är opålitlig visas `--`.

Banpunkter är fortfarande demopunkter. Core Motion-baserad vindmätning återstår.

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
- GPS-kurs räknas som pålitlig först från `1.5` knop.
- VMG/VMC använder live GPS-fart och pålitlig GPS-kurs när relevant referens finns.
- VMC använder live GPS-position för bäring till K1 när primär bana finns.

Strategi för att sätta vind vid låg fart eller baninställning:

- Lita inte på GPS-kurs.
- GPS-kurs används inte för vindinställning.
- Använd i framtiden iOS Core Motion med fused attitude.
- Beräkna horisontell heading för telefonens bakåtriktade vektor.
- Eftersom telefonens baksida pekar mot fören motsvarar den vektorn båtens framåtriktning.
- Ta flera samples under ungefär 1-3 sekunder och gör cirkulärt medelvärde.
- Undvik rå magnetometer direkt om det går.

Nuvarande status:

- `sensorTypes.ts` definierar interface för GPS-position, GPS-fart, GPS-kurs, båtens framåtriktning och vindheading.
- `useLiveGps.ts` startar en live GPS-watch via Capacitor Geolocation när Segling är aktiv och exponerar status, fel, position, fart, kurs och kursens tillförlitlighet.
- `mockSensorService.ts` innehåller mockade sensorvärden och visar tänkt form för framtida implementation.
- `geolocationService.ts`, `headingService.ts`, `wakeLockService.ts` och `raceRecordingService.ts` är stubs/TODO.
- Riktig iOS/Core Motion-integration är inte implementerad.

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

- React/Vite/TypeScript-app med fyra huvudvyer.
- Capacitor/iOS-projekt finns.
- Navigering mellan Bana, Start, Segling och Analys.
- iPhone safe area respekteras i CSS.
- iPhone porträttorientering är satt i iOS-konfiguration.
- iOS har `NSLocationWhenInUseUsageDescription` för GPS-behörighet.
- Bana kan toggla demopunkter och vind.
- Bana ritar startlinje och märken visuellt.
- Start har valbar nedräkning, start/paus, långt tryck för reset och automatisk växling till Segling.
- Start visar post-startperiod utan minustecken.
- Vald startlängd lever under aktuell appsession.
- Segling visar stora instrumentvärden och VMG/VMC-växling.
- Segling använder live GPS för fart, position och course over ground när data finns.
- Grundläggande matematik för bearing, VMG/VMC och vinklar finns.
- Sensorstrategi är dokumenterad.

Inte klart:

- Riktig GPS-position för banpunkter.
- Core Motion-baserad heading/vindmätning.
- Wake lock kopplad till UI/livscykel.
- Raceinspelning och lokal persistens.
- Analys/replay med riktig data.
- Aktivt ben/aktivt mål för VMC.
- Felhantering för sensorbehörigheter och dålig signalkvalitet.

## 10. Kända designbeslut och begränsningar

- Appen prioriterar iPhone porträtt framför desktoplayout.
- Browserläget ska fortsätta fungera för snabb UI-testning.
- Bana, Start och Segling ska inte fyllas med hjälpinstruktioner; de ska fungera som verktygsytor.
- K1/L1 är nuvarande primära banreferens. K2/L2 finns i UI men används inte ännu i beräkningarna.
- VMG/VMC-matematiken ska inte ändras utan separat uppgift och tydlig testning.
- Sensorarkitekturen ska byggas stegvis och inte blandas in i rena UI-uppgifter.
- Permanent lagring ska införas separat. Nuvarande session-state är medvetet flyktigt.

Ingen separat produkt-specifikationsfil utöver README, `docs/sensors.md` och den nuvarande implementationen hittades i repo-genomgången. Den här designfilen sammanfattar därför den specifikation som framgår av befintliga docs, kod och senast implementerade produktbeslut.

## 11. Rekommenderade nästa utvecklingssteg

1. Koppla Bana till riktig GPS-position när användaren sätter A, B, K1, K2, L1 och L2.
2. Implementera Core Motion-baserad båtframåtriktning enligt sensorstrategin.
3. Implementera vindmätning med 1-3 sekunders sampling och cirkulärt medelvärde.
4. Lägg till tydlig sensorstatus utan att störa huvudvyerna.
5. Koppla `wakeLockService` till aktiv seglings-/startperiod.
6. Lägg till raceinspelning som tidsserie.
7. Bygg Analys som replayvy baserad på inspelad data.
8. Lägg till aktivt ben och målval för VMC.
9. Lägg till fokuserade tester för vinkelberäkningar, VMG/VMC-regler och timerbeteende.

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
- Start kan starta, pausa, återställa och växla till Segling vid intern -0:10.
- Segling visar läsbara instrumentvärden och VMG/VMC-växling fungerar när både vind och primär bana finns.
