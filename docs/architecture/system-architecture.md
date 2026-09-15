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
- **Strato** - registrar for `tackwise.se`; not intended as application hosting.

## Principles

- Offline-first race execution.
- No permanently running application server required in the initial architecture.
- Raw telemetry separated from relational metadata.
- Opaque IDs rather than personal data in object names/keys.
- Server-authoritative entitlement state; clients do not authorize paid or beta access.
- Product analytics is separate from private race-analysis data and is privacy-minimized by design.
- Race sync uses authenticated Worker-mediated prepare/upload/finalize; PostgreSQL remains authoritative for acceptance and free-counter consumption.
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
