# Synchronization and Storage

## Offline-first model

TackWise Race records races locally. Sync is opportunistic after racing when Internet connectivity is available. Failed sync must be retryable and must not lose the local source recording.

## Storage split

### Supabase/PostgreSQL

Use for structured data such as:
- user UUID,
- race metadata,
- timestamps/duration,
- boat/course metadata,
- licence state,
- server-controlled product plan, access source, status/expiry and the free-race counter,
- analysis version and derived summaries/results,
- references to raw objects.

### Cloudflare R2

Use for raw or bulk race telemetry. R2 objects must remain private and be accessed through authorized application flows.

Object names must use opaque identifiers and must not contain names or email addresses.

## Deletion and export

The architecture must allow:
- deleting one race and all associated metadata/results/raw objects,
- deleting an account and all user-owned cloud data subject to documented legal retention,
- exporting user-owned data in a portable form.

## Versioning

Raw race formats and analysis algorithms should be explicitly versioned so historic recordings can be re-analysed with improved algorithms.

## Entitlement gate

The server must atomically authorize a cloud-race acceptance before upload/analysis work. Free access consumes one counter only after successful acceptance; valid Pro access through App Store or time-bounded beta authorization bypasses the counter. A local recording must never be blocked by entitlement or cloud availability.

## First upload lifecycle

[ADR-003](decisions/adr-003-first-race-upload-and-sync.md) defines authenticated prepare, bounded gzip upload through the Worker, and idempotent finalize. Pre-acceptance reservations and private unreferenced R2 objects are temporary; `races.sync_state = uploaded` is the authoritative successful-acceptance point. The PostgreSQL acceptance transaction first returns a matching accepted retry without counter mutation; only a new acceptance requires the reservation, entitlement check, unique race insert, and any free-counter increment. Failed, interrupted, or abandoned uploads remain local and do not consume the allowance.

TackWise Race persists the exact prepared compressed bytes/digest and uses the same immutable cloud race UUID for every retry. A transient failure returns local state to the queue with backoff; entitlement rejection remains queued/blocked until access changes; permanent schema validation failure requires user-visible remediation and is not retried automatically.
