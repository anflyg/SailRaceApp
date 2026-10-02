# R2 Race Object Format and Access Model

**Status:** Accepted first-upload baseline under [ADR-003](decisions/adr-003-first-race-upload-and-sync.md); implementation deferred.

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

The first-upload Worker derives the raw key from the validated user, prepared race, version, and compressed-byte digest:

```text
races/<user_uuid>/<race_uuid>/raw-v<format_version>-sha256-<compressed_sha256>.json.gz
analysis/<user_uuid>/<race_uuid>/<analysis_version>/result.json.gz
```

The UUID segments are opaque identifiers, not user-visible identity.

[ADR-004](decisions/adr-004-analysis-dispatch-lifecycle-and-cleanup.md) makes raw/result references server-internal and requires immutable historical analysis results. The analysis path above remains illustrative; the detailed-result contract must settle key/publication mechanics and exact digest/size semantics before implementation. It must not overwrite a prior artifact during retries or expose keys to TackWiseAnalysis.

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

Initial preferred upload artifact and storage format: versioned JSON compressed with gzip, unless profiling demonstrates a compelling reason for another format. The first content PUT sends that artifact as `Content-Type: application/gzip`, without an HTTP `Content-Encoding` header.

Reasons:
- easy debugging and migration,
- broad interoperability,
- good compression for repetitive telemetry,
- low implementation complexity during early development.

A later binary format may be introduced with a new `formatVersion`; historic formats must remain parseable or migratable. The first cloud raw schema is distinct from the app's current user-export ZIP/JSON version.

Initial upload limits are 5 MiB compressed, 20 MiB after decompression, and 50,000 samples, subject to confirmation with representative fixtures before endpoint implementation. The Worker must enforce compressed and expanded bounds independently and stop decompression when the expanded limit is crossed.

## Integrity and idempotency

The phone computes SHA-256 over the exact gzip artifact bytes and persists those immutable retry bytes. The Worker independently computes and verifies the same request-body bytes before storage, then stores the original bytes unchanged. PostgreSQL stores the verified digest in `races.raw_sha256` and the compressed length in the proposed `races.raw_size_bytes`. R2 records `application/gzip` and compression metadata, but no HTTP transport decoding participates in the digest invariant.

Upload/sync must be idempotent:
- retrying the same race must not create duplicate race records,
- the immutable race UUID is the idempotency identity,
- conflicting content for an existing race UUID must be rejected or explicitly handled as a version/migration case.

## Access model

R2 is private.

Clients must not receive permanent R2 credentials.

The first flow is the authenticated Worker-mediated prepare/content/finalize protocol in ADR-003:
1. prepare reserves the client race UUID and expected immutable object description,
2. the bounded gzip body is authenticated, hashed, decompressed with a hard ceiling, schema-validated, and written through the private Worker R2 binding,
3. finalize first returns a matching accepted race idempotently; otherwise it verifies object presence and invokes the atomic PostgreSQL acceptance operation,
4. analysis may read the object only after an accepted race row exists.

Under ADR-004, the separate route-less trusted analysis consumer resolves the accepted object from PostgreSQL using only the queue's race UUID and analysis version. TackWiseAnalysis obtains metadata/results through authenticated owner-scoped Worker APIs and never accesses R2 directly.

No signed/direct R2 upload URL is issued in the first flow. Introducing one later requires a reviewed architecture and threat-model change and must remain short-lived, object-specific, authorized, and unsuitable for bucket listing.

The object is logically staged until database acceptance even though it already uses its canonical immutable key. An R2 object without an accepted race row is not readable or analyzable through application flows. Prepared sessions expire after 24 hours; scheduled cleanup removes expired unreferenced objects and reservations within a further 24 hours after rechecking acceptance.

ADR-004 specifies the initial one-hour post-expiry grace and finite cleanup budget. Before deletion, validate authoritative accepted state, exact reservation/object identity and cleanup ownership. Coordinate with finalize and late content PUTs; retain durable recovery references on provider uncertainty. An accepted object is never an abandoned-upload cleanup target.

## Logging

Do not log raw payloads or GPS samples in normal application logs. Logs may contain opaque race/user IDs, operation status, byte counts, format version and error categories where necessary for operations.

The stricter ADR-004 analysis/maintenance rule excludes user UUIDs, queue envelopes, R2 keys, digests and provider bodies; use safe operation correlation IDs, phases, categories and bounded counts/timings/status only.

## Deletion

Race deletion must delete both raw and derived R2 objects. Failed cross-store deletion must be retryable and observable without exposing location data in logs.

## Cost controls

- compress before persistent storage,
- avoid repeatedly downloading raw telemetry for normal page loads,
- store reusable derived summaries/results after analysis,
- protect upload/analysis endpoints from abuse and oversized files,
- monitor the initial compressed/expanded/sample limits before raising them.

## Open decisions before implementation

- Exact summary/result schema and size boundary: ADR-004 selects bounded summaries in PostgreSQL and private immutable R2 for detailed results too large for PostgreSQL; metrics and key/publication mechanics remain later contract work.
- Exact raw-race v1 fields within the ADR-003 minimization boundary; the formal schema belongs in `anflyg/tackwise-contracts`.
