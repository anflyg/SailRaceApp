# R2 Race Object Format and Access Model

**Status:** Proposed baseline for implementation.

## Purpose

Cloudflare R2 stores raw/bulk race telemetry and, where useful, larger derived analysis artifacts. PostgreSQL stores only structured metadata and references to these objects.

## Bucket model

Initial production intent:
- one private production bucket for TackWise race objects,
- no public bucket access,
- no user-facing predictable paths,
- separate development/test buckets or prefixes if needed.

Suggested bucket name: `tackwise-races-prod`.

The exact bucket name is not a security boundary. Authorization must be enforced by the API.

## Object keys

Use only opaque identifiers. Do not include names, email addresses, boat names, club names or other personal data in keys.

Suggested structure:

```text
races/<user_uuid>/<race_uuid>/raw-v<format_version>.json.gz
analysis/<user_uuid>/<race_uuid>/<analysis_version>/result.json.gz
```

The UUID segments are opaque identifiers, not user-visible identity.

Alternative flat hashed keys are acceptable if they improve implementation, provided ownership remains stored in PostgreSQL and no personal data appears in object names.

## Raw race payload

A raw race object should contain the immutable source data required to reproduce analysis later.

Top-level fields should include at least:
- `formatVersion`
- `raceId`
- `recordedAt` / start/end timestamps
- app version/build metadata
- device/source metadata required to interpret sensor fields
- course/start/mark/wind setup snapshots used during the race
- ordered telemetry samples
- explicit units or schema-defined units

Telemetry may include, when actually recorded by the app:
- timestamp
- latitude/longitude
- GPS accuracy
- speed and speed source
- course over ground
- heading and heading source
- sensor quality/diagnostic fields needed to interpret the race

Do not add new categories of personal or device data merely because they are available. Collection must have a documented product/diagnostic purpose.

## Compression and encoding

Initial preferred transport/storage format: versioned JSON compressed with gzip, unless profiling demonstrates a compelling reason for another format.

Reasons:
- easy debugging and migration,
- broad interoperability,
- good compression for repetitive telemetry,
- low implementation complexity during early development.

A later binary format may be introduced with a new `formatVersion`; historic formats must remain parseable or migratable.

## Integrity and idempotency

The uploader/API should calculate and store a SHA-256 digest for the raw object. PostgreSQL stores the expected digest in `races.raw_sha256`.

Upload/sync must be idempotent:
- retrying the same race must not create duplicate race records,
- the immutable race UUID is the idempotency identity,
- conflicting content for an existing race UUID must be rejected or explicitly handled as a version/migration case.

## Access model

R2 is private.

Clients must not receive permanent R2 credentials.

Preferred flow:
1. authenticated client calls TackWise API,
2. API validates Supabase session/user and entitlement,
3. API validates race ownership/ID and upload metadata,
4. API either streams the object or issues a short-lived constrained upload/download mechanism,
5. metadata is committed only when the upload is validated,
6. analysis reads R2 through trusted server-side access.

Any signed URL must be:
- short lived,
- object-specific,
- issued only after authorization,
- unsuitable for listing the bucket.

## Logging

Do not log raw payloads or GPS samples in normal application logs. Logs may contain opaque race/user IDs, operation status, byte counts, format version and error categories where necessary for operations.

## Deletion

Race deletion must delete both raw and derived R2 objects. Failed cross-store deletion must be retryable and observable without exposing location data in logs.

## Cost controls

- compress before persistent storage,
- avoid repeatedly downloading raw telemetry for normal page loads,
- store reusable derived summaries/results after analysis,
- protect upload/analysis endpoints from abuse and oversized files,
- define reasonable per-race size limits before production.

## Open decisions before implementation

- Exact maximum raw upload size.
- Direct signed upload versus Worker-streamed upload.
- Whether large analysis outputs stay in R2 or remain compact enough for PostgreSQL JSONB.
- Formal schema location/versioning shared between Race and Analysis repositories.
