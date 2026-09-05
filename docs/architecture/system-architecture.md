# TackWise System Architecture

## Status

Initial target architecture. Update this document when accepted design decisions change.

## Components

- **TackWise Race (iPhone)** - race execution and local recording.
- **TackWise Analysis (web)** - post-race user interface.
- **Apple** - end-user identity provider through Sign in with Apple.
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
- Early-stage infrastructure target: USD 0-10/month where practical.

## Logical flow

```text
Apple Sign in
     |
     v
Supabase Auth ---- Supabase PostgreSQL
     |                    |
     |                    +-- structured metadata/results
     |
iPhone Race ---- Cloudflare API/Workers ---- Analysis Web
     |                    |
     +------------------> R2 private race objects
```
