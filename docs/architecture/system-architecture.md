# TackWise System Architecture

## Status

Initial target architecture. Update this document when accepted design decisions change.

## Components

- **TackWise Race (iPhone)** - race execution and local recording.
- **TackWise Analysis (web)** - post-race user interface.
- **`anflyg/tackwise-api` (Cloudflare Worker)** - shared backend/API for Race and Analysis, including future session validation, entitlement checks, synchronization, privileged Supabase operations, private R2 access and analysis orchestration.
- **`anflyg/tackwise-contracts`** - shared versioned schemas and API contracts between clients, API and Analysis.
- **Apple** - end-user identity provider through Sign in with Apple and preferred initial StoreKit/App Store billing surface.
- **Supabase Auth** - session/auth integration and internal TackWise user UUID.
- **Supabase PostgreSQL** - structured metadata such as users, races, licences and analysis metadata/results.
- **Cloudflare DNS** - DNS for TackWise domains.
- **Cloudflare Pages** - intended web hosting for Analysis.
- **Cloudflare Workers** - intended API/server-side processing where required.
- **Cloudflare R2** - private raw race telemetry/object storage.
- **Cloudflare Queues** - accepted ADR-004 choice for transient analysis delivery to a separate route-less trusted consumer owned by `tackwise-api`; implementation deferred, with PostgreSQL as durable work/outcome authority.
- **Strato** - registrar for `tackwise.se`; not intended as application hosting.

## Principles

- Offline-first race execution.
- A background transition saves a local active-race session checkpoint and time without ending the race; foregrounding in the same process continues recording. A new process finalizes a matching previously active race at a reliable checkpoint time, preserving samples and without initiating upload. With no reliable checkpoint, existing manual recovery remains fail-closed and pauses GPS samples until the sailor chooses to resume or end. iOS may not deliver a force-quit callback, so finalization may occur on the next launch. This adds no cloud processing or new telemetry stream.
- Sailing wind-relative display and wind-shift cues are computed on-device from the fresh circularly filtered true-north Core Motion back-vector HDG and the Course wind snapshot. They add no sensor stream, persisted estimate, cloud processing or logging. GPS remains the source for over-ground VMG, speed and start geometry.
- The wind-shift instrument's transient state and its start-gun eligibility gate outlive Sailing tab mounts. Its marker begins at 0° upon approved Course wind measurement; wind estimation begins only after the race start gun on a stable upwind tack and is frozen on wind-FROM-relative courses 90°–270° (beam/downwind), holding the last valid marker. See `docs/product/tackwise-race.md` for the definitive product behavior. No new persistence, cloud dependencies, sensor streams or logging are added.
- Setup, Course and Sailing share a foreground Core Motion stream, retained across tabs during an active race. Wind capture uses fused true-north attitude and fresh motion uptime, without a CLHeading accuracy gate. Local race metadata marks new captures `core-motion-v1`; unmarked historical winds require remeasurement. Other historical race data is preserved. Capture remains offline and adds no cloud data, telemetry or logs. The marker is included in local export; the cloud upload format is unchanged.
- No permanently running application server required in the initial architecture.
- Raw telemetry separated from relational metadata.
- Opaque IDs rather than personal data in object names/keys.
- Server-authoritative entitlement state; clients do not authorize paid or beta access.
- Product analytics is separate from private race-analysis data and is privacy-minimized by design.
- Race sync uses authenticated Worker-mediated prepare/upload/finalize; PostgreSQL remains authoritative for acceptance and free-counter consumption.
- [ADR-004](decisions/adr-004-analysis-dispatch-lifecycle-and-cleanup.md) defines durable analysis runs, safe duplicate delivery, bounded reconciliation/cleanup and finite retries. Analysis uses Worker-only owner-scoped APIs; internal storage references and credentials never form the browser contract.
- Early-stage infrastructure target: USD 0-10/month where practical.

## Repository boundaries

`anflyg/SailRaceApp` owns the iPhone application and remains the current source of truth for suite-level product, architecture, security and privacy decisions. `anflyg/TackWiseAnalysis` owns the web frontend and analysis UI. `anflyg/tackwise-api` owns the shared cloud/backend/API implementation. `anflyg/tackwise-contracts` owns shared contracts. These boundaries do not change the offline-first requirement: race-critical execution and recording remain local to the iPhone app.

## Logical flow

```text
Apple Sign in
     |
     v
Supabase Auth ---- Supabase PostgreSQL
     |                    |
     |                    +-- structured metadata/results
     |
iPhone Race ---- tackwise-api Worker ---- Analysis Web
     |                    |
     +-- authenticated -->+-- private binding --> R2 race objects
```


## Marketing website boundary (owner approved 2026-11-16)

The owner approved a separate private repository, `anflyg/TackWiseWebsite`,
for the static Swedish marketing website. This repository is planned and must
be verified as created before claiming an implementation or deployment exists.
SailRaceApp remains the suite-level source of truth.

The website serves self-hosted HTML, CSS, JavaScript and approved brand assets.
Product screenshots must be captured from current Race/Analysis code with
synthetic/demo data only, with source commit and capture provenance recorded
in the website repository. Race retains its white interface and instruments;
Analysis retains its light map-first workspace. Watch is explicitly a concept
under development. Preliminary Free/Pro positioning does not change the current
first-three-accepted-cloud-races Analysis entitlement or authorize billing.

Cloudflare Pages is approved for a separate **preview-only** project connected
to the website repository: framework None, no build command, output `public`.
Preview deployments may track the feature branch. Automatic production builds
must remain disabled during preview preparation, and connecting Git must not
publish the starter as a production deployment. The eventual production branch
is `main`; only after separate release approval may production builds be
enabled so subsequent merges/pushes to `main` trigger Pages deployment.

This boundary adds no authentication, payment, database, API, direct Supabase
access, R2 access, GPS/race-data processing, analytics cookies or third-party
tracking. The Analysis link may target `https://analysis.tackwise.se/` but is
not evidence that general live authentication is approved. Self-hosted images
and a restrictive CSP minimize third-party requests; hosting still processes
technical request data such as IP addresses and requires provider/privacy review.

**Production gate:** `integritet.html` is an incomplete draft and blocks
production publishing until controller/contact, purposes/legal bases,
providers/transfers, logging/retention and rights information are completed
and owner approved. Explicit owner approval is also required for merge,
production deployment, `www.tackwise.se` attachment and any DNS change.
Neither `analysis.tackwise.se` nor the API domain/configuration may be altered.

The historical infrastructure-status file is not current deployment proof:
Analysis's later [delivery record](https://github.com/anflyg/TackWiseAnalysis/blob/main/docs/cloud-analysis-delivery.md)
documents hosted HTTPS verification on 2026-10-29. Inspect actual Cloudflare
Pages, zone DNS and applicable rules before any website hosting changes;
record verified observations without assuming that historical notes reflect
today's account state.
