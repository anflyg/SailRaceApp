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

## Access and billing direction

**TackWise Analysis Free** allows the first three successfully accepted cloud races on an account to be synchronized and analysed using the normal analysis experience.

After the third accepted cloud race, additional cloud analysis requires server-authorized access. Race recording in the phone may continue locally. When access is later activated, eligible locally retained races may be synchronized.

The preferred initial consumer billing path is Apple StoreKit / App Store In-App Purchase, because paid access unlocks digital/cloud functionality associated with the iPhone app. Product definitions and prices remain open, App Store commercial terms can vary by region, and a future alternative or web-billing path is not ruled out; either requires a separate architecture and App Store-compliance review.

The TackWise server, not a client, is authoritative for paid access. A later implementation must verify App Store transactions/subscription state server-side before granting or retaining `plan = pro` with `access_source = app_store`.

Authorized beta/TestFlight participants may receive a server-controlled `plan = pro`, `access_source = beta` entitlement for unlimited cloud sync and analysis during a defined beta period. It requires a non-null future expiry, does not consume the free allowance, and may be revoked server-side before expiry. A client-supplied TestFlight/build flag is not authorization.

## Data principles

- Raw race files are private.
- User authorization is enforced for every user-owned race.
- Users must eventually be able to delete individual races, export their data and delete their account.
