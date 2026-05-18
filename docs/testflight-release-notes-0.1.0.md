# Aster Race TestFlight 0.1.0

## Första TestFlight-versionen
Detta är första TestFlight-builden av Aster Race.

## Fokus i denna version
- Bana: sättning av A, B, K1, L1.
- Starttimer: nedräkning, startskott och race-startflöde.
- Seglingsdata: fart, riktning, VMG (bana/vind).
- Sensorer: GPS, kompass/riktning, motiondata.
- Branding: splashscreen och appikon.
- Export: race-export i ZIP (JSON, CSV, GPX).

## Kända begränsningar
- Vind/heading kan påverkas av fysisk telefonmontering och lokal kompassmiljö.
- GPS-course kan vara mindre stabil i låg fart.
- Datatäthet och analysupplösning beror på GPS-kvalitet.
- Exportflöde är optimerat för delning; importflöde ingår inte i denna version.

## Vad testare ska återkoppla på
- Riktning/vind: stämmer visad riktning mot verklig segling?
- Startflöde: är timer/startmoment tydligt och robust?
- Bana/UI: är bana och markeringar tydliga och praktiska under användning?
- Stabilitet: krascher, frysningar, oväntade states.
- Export: fungerar delning av ZIP och går filer att öppna externt?
- Läsbarhet i starkt ljus och i rörelse ombord.
