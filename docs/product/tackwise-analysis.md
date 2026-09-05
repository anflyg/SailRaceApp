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

## Free and licensed use

**TackWise Analysis Free** allows the first three races on an account to be synchronized and analysed using the normal analysis experience.

After the third analysed race, additional cloud analysis requires an active licence. Race recording in the phone may continue locally. When a licence is later activated, eligible locally retained races may be synchronized.

## Data principles

- Raw race files are private.
- User authorization is enforced for every user-owned race.
- Users must eventually be able to delete individual races, export their data and delete their account.
