# Geographic nautical basemap for TackWise Analysis

**Product decision: APPROVED 2026-11-17.** The product owner selected **MapLibre GL JS + Open Waters Seamap** as the primary nautical-style background for post-race analysis, instead of the earlier satellite-first proposal. Users must be able to switch the background **on/off** for both synthetic and **owner-authorized real** races. This is an approved product choice, **not** approval to enable third-party map requests for private races in production before the separate security/privacy/CRA/GDPR release gates below have passed.

## Approved experience and implementation direction

- A single shared analysis workspace for synthetic and authenticated, ready, owner-authorized races. When the nautical background is permitted, choose **Sjökort** (MapLibre/Seamap) or **Enkel karta** (local SVG schematic track); the latter always remains available. The primary intended customer experience is the nautical background, subject to the release gates.
- Both modes show the **same selected race's track, replay progress, boat marker and available course/crossing information** and remain synchronized with the existing replay and performance charts. Do not invent missing course/position data.
- Turning the external basemap **off must unmount MapLibre and stop subsequent external tile/style requests** (apart from already in-flight network activity that cannot be recalled). Do not initialize hidden demo maps in cloud mode. Do not store the per-user toggle or GPS in persistent browser storage unless separately approved.
- On private races, enabling the external map is a separately gated capability until the relevant data flow and provider are approved for real-race use. When disabled or unavailable, show the local SVG map; never block access to the private replay or charts. No API/backend/ownership permission change follows from this decision.
- Preserve map zoom/pan when appropriate during replay, fit the selected race on race changes, and reset/unmount on logout, account/session changes and mode changes. Never display a previous user's track or send a race UUID, user identity, coordinates array or access token to tile providers.
- Visible credit for every source, and a clear **Not for navigation** notice. No false claim that the Seamap background is an official navigational chart.
- Continue the work in the existing [TackWiseAnalysis draft PR #12](https://github.com/anflyg/TackWiseAnalysis/pull/12); keep this linked documentation PR #79 as the decision record. No merge/deployment is approved by this record.

## Sources, attribution and limitations

Use MapLibre GL JS (BSD-3-Clause) and the published [Open Waters Seamap style](https://tiles.openwaters.io/seamap/style.json). [Seamap documentation](https://openwaters.io/charts/seamap/) identifies OpenStreetMap (ODbL), Seascape bathymetry, VersaTiles base data, Noto fonts (SIL OFL) and chart symbols used with permission. Hosted Seamap tiles, style and sprites are described as CC BY 4.0, requiring © Open Waters: Seamap; OSM requires © OpenStreetMap contributors. MapLibre attribution must retain all credits supplied by style and TileJSON, including Mapterhorn and Seascape and their linked terms; verify all live downstream licensing and display before release. The style package and tile pipeline have separate code licenses and are not bundled as application code.

**Not for navigation:** seamarks may be missing, outdated or incorrect, and bathymetry is not reduced to chart datum or adjusted for tides. Official nautical charts remain necessary. Coverage, accuracy, availability, fair use, costs and service guarantees require verification. Local SVG fallback is not geographically authoritative.

## External data flow and release gates

A style/TileJSON inspection on 2026-11-17 identified `tiles.openwaters.io` (style, seamark and Seascape TileJSON/tiles, glyphs and chart sprites) and `tiles.versatiles.org` (base vector/elevation tiles and base sprites). Reinspect the mutable live style, TileJSON, redirects and actual browser network traffic before release. Restrict CSP `connect-src` and `img-src` to approved hosts and `worker-src` to self for the bundled MapLibre worker. Reject unapproved hosts and do not send cross-origin credentials.

External requests need not contain raw GPS arrays or identity but **IP address, viewport tile coordinates/zoom, timing and navigation movements may disclose the sailing area**; browser caches and provider logs may persist beyond the local GPS lifecycle. Retain `Referrer-Policy: no-referrer`. Switching to the local SVG map does not erase data already delivered to third-party services.

**Separate GO/NO-GO required before production activation for real races:** review necessity/proportionality, lawful basis/notices, provider roles/terms and sub-processors, transfers, retention/caching, security and CRA/GDPR implications, dependency/licensing and availability; document approvals. Verify attribution, CSP, actual browser traffic, zero credential/track-payload exfiltration, edge cases and responsive WebGL/fallback, including synthetic preview. Preserve owner-scoped access and private GPS in memory only. Neither this product approval nor PR #12 authorizes expanded alpha access, production flags or deployment.
