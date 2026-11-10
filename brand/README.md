# TackWise brand assets

## Approved identity

The shared mark combines two sails, a semicircular instrument arc that fades at both ends, inward-facing blue ticks, an orange north mark and a cyan-to-blue wave. The wordmark is **TackWise** and the tagline is **Race smarter.** (`RACE SMARTER` in artwork).

The splash uses the stacked logo on an exact white `#FFFFFF` background with soft overlapping cyan, blue and navy waves along the bottom. An orange upper wave is separated from the blue by a narrow white line. Do not add a separate large `RACE` label below the tagline. The product remains TackWise Race in app metadata.

## Palette

| Role | Hex |
| --- | --- |
| Background | `#FFFFFF` |
| Navy | `#081E3A` |
| Blue | `#0A84FF` |
| Cyan | `#22D3FF` |
| Orange | `#FF8A00` |

Use darker accessible variants for small text or controls when the bright blue or orange does not provide enough contrast. Functional green, red and other status colors retain their existing meanings.

## Artwork and variants

- `source/tackwise-symbol.svg` is the light-canvas symbol master: navy sails, fading navy instrument arc and blue ticks.
- `source/tackwise-native-icon.svg` is the dark, full-bleed app-icon master with white sails, a navy background, cyan ticks and no text.
- `source/tackwise-logo-stacked.svg` and `source/tackwise-logo-horizontal.svg` use the shared symbol with the wordmark and tagline.
- `source/tackwise-race-splash.svg` is the full white React/native splash artwork; `source/tackwise-splash-waves.svg` is its responsive bottom-wave overlay, including the white separation line.
- Product tiles reuse the light symbol. OS icons remain symbol-only.

Keep the symbol geometry and proportions consistent across variants. Generate raster exports and iOS assets from the corresponding SVG masters, preserve the existing asset-catalog dimensions, and do not stretch or crop the mark. Keep launch-screen and React splash backgrounds exactly white for a clean transition.
