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
