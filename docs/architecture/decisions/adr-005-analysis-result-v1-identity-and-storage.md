# ADR-005: Analysis result v1 identity and storage

**Status:** Accepted design; implementation remains deferred until after roadmap step 6G.

**Date:** 2026-10-07

## Context

ADR-004 establishes PostgreSQL-authoritative analysis runs, a trusted route-less consumer, private R2, and later summary/result persistence. The result contract must preserve a small client-safe PostgreSQL summary while keeping detailed location analysis private and immutable. This ADR fixes the initial result shape and byte/object identity. It does not add an algorithm, API, migration, or deployment.

## Decision

### Version and result split

analysis-v1 initially emits resultFormatVersion = 1. The shared schemas in anflyg/tackwise-contracts define:

- a bounded summary containing aggregate duration, distance, sample count, speed, start, and leg metrics; and
- a detailed result containing the source identity, the same summary, a bounded derived track, detailed start analysis, and bounded leg items.

The PostgreSQL summary contains no latitude, longitude, GPS track arrays, exact track timestamps, user UUID, R2 keys, race object keys, digests, tokens, or credentials. Unavailable scalar metrics use null; fields are not omitted. The summary is still race-related data and must receive owner-scoped access controls.

The detailed result may contain the user's track and derived location analysis. Treat it as personal data and store it only as a private R2 object. TackWiseAnalysis never receives the internal R2 key and accesses results through authenticated owner-scoped Worker APIs.

### Deterministic result bytes

Result format 1 uses RFC 8785 JSON Canonicalization Scheme (JCS) over the complete detailed-result JSON. Encode those canonical JSON bytes as UTF-8. Compute SHA-256 over those exact bytes and store its lowercase hexadecimal digest. Use Content-Type: application/json with no gzip encoding.

The immutable bytes contain only deterministic analysis output and identity. Do not include generated timestamps, processing timestamps, worker identifiers, random values, or other operational metadata. Reject a detailed result over 16 MiB or a canonical summary over 16 KiB; never truncate either value.

### Private immutable R2 identity

The initial detailed-result key is:

    analysis/<analysis_run_uuid>/result-v1.json

analysis_run_uuid is opaque and server-internal. The key is deterministic from the durable analysis run and contains no user or race UUID. Create the object only if absent. Retries must never overwrite an existing object. If the key already exists, recovery verifies its bytes against the expected canonical digest and size before reuse. An uncertain R2 write can therefore be reconciled at the exact known key. The key is never returned to TackWiseAnalysis or a client.

This decision changes only derived-result identity; it does not redesign raw race keys.

### PostgreSQL relationship and future completion

analysis_runs.summary will contain exactly the validated summary object present in the immutable detailed result. PostgreSQL separately records result format version, SHA-256, byte size, and the internal private object reference. completed_at and other processing timestamps remain operational database metadata and are not part of deterministic result bytes.

A future server-only completion RPC must atomically require the current processing lease for a running result; validate and persist the bounded summary and result metadata; transition the run to complete; and transition the race to ready only if the run remains the race's required analysis version. For an uncertain database response, an already-complete run with exactly the same immutable result identity may return success as a no-op. A conflicting identity fails closed.

No completion RPC, result persistence, or analysis algorithm is authorized by this decision. Update privacy/processing records and confirm processor, transfer, access, and retention controls before production result collection.

## Consequences

- Contracts and stored result bytes have a stable, reproducible identity independent of operational processing time.
- Detailed location data remains in private R2; PostgreSQL stores only bounded summary data and internal identity metadata.
- Retries and uncertain writes can verify the exact immutable object without overwriting history.
- Result schema validation, canonicalization, size enforcement, object publication, and atomic completion require separately reviewed implementation and tests.
