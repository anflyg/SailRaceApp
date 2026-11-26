# TackWise Analysis

## Role

TackWise Analysis is the web-based post-race analysis environment. Its purpose is to help a sailor understand what happened, where performance was gained or lost and what can be improved.

The initial intended endpoint is `analysis.tackwise.se`.

## Synchronization

After a race, TackWise Race can synchronize recorded data when Internet access is available. A cloud outage must never prevent local race recording.

## Analysis scope

The analysis platform may progressively provide:
- race track visualization,
- replay with pause and variable speed,
- speed and VMG over time,
- heading/course visualization,
- tack and gybe detection,
- manoeuvre loss,
- speed before/during/after manoeuvres,
- port versus starboard performance,
- leg detection,
- upwind/downwind analysis,
- layline and mark-approach analysis,
- start analysis,
- comparison of sailed and theoretical/optimal paths,
- race-to-race comparison and long-term development.

Analysis algorithms should evolve independently of the raw recording format so older races can benefit from improved algorithms.

## Desktop analysis experience (approved 2026-11-15)

**Map-first design.** The sailing track is the primary content of the post-race desktop workspace; metrics and analysis support it rather than displacing it.

- The desktop layout provides a race library, a large central track/map, and an analysis column. The library and analysis column are independently collapsible; a maximize/restore action expands the track without resetting replay position. On narrower screens, the layout reflows rather than shrinking text and controls to unreadable sizes. Target desktop layouts include 1920×1080 and 1440×900; visual verification at each resolution is a release check, not an assumed fact.
- Place a compact, readable race summary above the track, and prominent play/pause, seek and playback-speed controls immediately below. Use the approved TackWise logo, colors and accessible high-contrast variants, with legible labels, controls and chart axes.
- When an authorized detail result is available, the boat position, progress along the track, current boat speed, current VMG and both charts use the **same replay time**. Both charts show a clearly moving time cursor and current sample value. Draw elapsed portions prominently and future portions more subtly, without inventing values across missing samples or data gaps. Playback, pause and seeking must remain synchronized.
- Distinguish the full route, replayed route, boat marker and start/crossing/course annotations visually. Mark course geometry as unavailable when it is absent; do not substitute synthetic course data into an authenticated user's race.
- Present leg names, durations, and start/end clock times in a readable form with an explicit time zone. Keep synthetic/demo data visibly separate from private, authenticated race data, including loading, unavailable and error states.
- This is an **interface decision only**. It does not authorize any new cloud access, change API/data contracts, enable private detail endpoints, alter authentication, or relax the existing security, CRA and GDPR requirements.

## Geographic basemap direction (not yet approved for implementation)

A future geographic map should show the GPS track at its correct geographic position and **default to satellite imagery**, with an explicit option to turn the imagery off. Provide safe fallback when imagery is unavailable. Before choosing or integrating an engine or imagery provider, separately review geographic alignment and fit-to-track, access to Swedish coastal imagery, licensing and attribution, costs, dependencies, operational limits, and security/privacy/CRA/GDPR impacts. Requests for map tiles can disclose the displayed area and the user's IP address to a provider; approve the provider, data flows, relevant processing/transfer terms, notices and retention/caching rules first. The current schematic SVG remains in place until that work is approved.

## Access and billing direction

**TackWise Analysis Free** allows the first three successfully accepted cloud races on an account to be synchronized and analysed using the normal analysis experience.

After the third accepted cloud race, additional cloud analysis requires server-authorized access. Race recording in the phone may continue locally. When access is later activated, eligible locally retained races may be synchronized.

Expired or revoked Pro access blocks acceptance of new cloud races but does not remove ownership access to previously accepted races or stored results. The normal initial analysis for a race that was successfully accepted may complete. Any later policy for optional re-analysis is separate.

The preferred initial consumer billing path is Apple StoreKit / App Store In-App Purchase, because paid access unlocks digital/cloud functionality associated with the iPhone app. Product definitions and prices remain open, App Store commercial terms can vary by region, and a future alternative or web-billing path is not ruled out; either requires a separate architecture and App Store-compliance review.

The TackWise server, not a client, is authoritative for paid access. A later implementation must verify App Store transactions/subscription state server-side before granting or retaining `plan = pro` with `access_source = app_store`.

Authorized beta/TestFlight participants may receive a server-controlled `plan = pro`, `access_source = beta` entitlement for unlimited cloud sync and analysis during a defined beta period. It requires a non-null future expiry, does not consume the free allowance, and may be revoked server-side before expiry. A client-supplied TestFlight/build flag is not authorization.

## Approved planned maneuver analysis — 2026-11-26

[PR #84 D3/D6/D10](race-performance-change-decisions.md) approves post-race tack-angle feedback and wind-history explainability, plus web tack/gybe identification, time/location, observed minimum speed, reduction/recovery and within-race comparison when input quality supports them. Performance-loss definitions, exact metrics/visuals/confidence thresholds and treatment of the current five-second GPS cadence remain open. A speed dip is not verified distance loss. This is product direction only: no higher recording rate, new sensor persistence, contract migration, cloud processing or deployment is authorized. Historical support and strict owner access remain required.

The [technical design](../architecture/race-performance-technical-design.md) and proposed [ADR-012](../architecture/decisions/adr-012-wind-history-and-maneuver-analysis.md) identify the data/version/privacy reviews before implementation in the owning repositories.

## Data principles

- Raw race files are private.
- User authorization is enforced for every user-owned race.
- Users must eventually be able to delete individual races, export their data and delete their account.
