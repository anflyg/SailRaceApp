# ADR-005: Analysis result v1 identity and storage

**Status:** Accepted design; implementation remains deferred until after roadmap step 6G.

**Date:** 2026-10-07

**Approved amendment (2026-10-24):** The product owner approved only the bounded same-key guard/payload/seal exception for immutable analysis-result publication and separately authorized deletion. This does not approve ADR-007, any deletion activation, unverified provider behavior, or an indefinite retention/restore policy.

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

analysis_run_uuid is opaque and server-internal. The key is deterministic from the durable analysis run and contains no user or race UUID. For the reviewed same-key fencing protocol below, create only the initial guard if absent. Publish the immutable payload only against that original guard ETag. Retries must never overwrite an existing payload. If the key already exists, recovery verifies its registered protocol state and exact bytes against the expected identity before reuse. An uncertain R2 write can therefore be reconciled at the exact known key. The key is never returned to TackWiseAnalysis or a client.

This decision changes only derived-result identity; it does not redesign raw race keys.

### Conditional result publication and deletion boundary

The literal create-only-if-absent rule applies to the initial guard. The guard-to-payload and future guard/payload-to-seal conditional replacements are the only protocol exceptions; they do not authorize rewriting a result payload. Keep the exact key, deterministic RFC 8785 UTF-8 result bytes, SHA-256 and size limits above. This amendment does not accept ADR-007 or enable processing/deletion.

Before any provider mutation, durably bind the required analysis run, accepted owner/race/raw identity, result format/digest/byte size and exact canonical summary to one provider account/bucket/key. Acquire existing matching account gate, race gate, then lifecycle locks. New guard/payload admission requires both gates open and the current required-version processing lease. Keep registration and every operation/condition immutable and recoverable independently of Auth/race cascades. A SQL preflight/lease does not fence a submitted R2 write.

Register one random guard UUID and a distinct random seal UUID. Create the initial guard exactly once using S3 PutObject If-None-Match: *. Proposed private marker Content-Type is application/vnd.tackwise.analysis-fence; marker UTF-8 bytes are tackwise/analysis-fence/v1/guard/<guard UUID> followed by LF, or tackwise/analysis-fence/v1/seal/<seal UUID> followed by LF. Markers contain no result/identity/location data and are never analysis JSON or client-visible results. Fix the original strong quoted guard ETag G only after positive exact-marker verification; known successful response ETags constrain later observations. A missing read, timeout, restart or new SQL lease never authorizes another initial guard.

Every payload attempt is journaled before dispatch and carries the original G with If-Match, identical canonical bytes, application/json and no Content-Encoding. Never substitute a newer observed ETag. A 412 alone is not success: only full exact-byte, size, SHA-256 and registered-payload verification can establish matching persistence. Conflicts fail closed. Disable automatic SDK retries; unknown results stop further mutations in that pass. Record pending/uncertain operation responses separately from positive object-state observations, preserving ambiguity and original conditions after restart and current-lease takeover. No unknown object state permits completion. Exact observed persistence may reconcile a lost response only under the verified provider contract; it cannot rewrite the original response journal.

Atomic completion requires positive immutable payload verification bound to the exact registered artifact, current processing lease, open account/race gates and the still-required analysis version. Persist exactly that result's validated summary and private metadata, complete its run and transition the race to ready in one transaction. A matching already-complete identity may be reconciled as an authorized no-op after response loss; a stale lease cannot perform a new completion. Conflicting identities, closed/missing gates, an obsolete required version and unresolved provider state fail closed.

Result sealing/deletion needs separate result-specific SQL/job authority and review before implementation/activation. Under that reviewed boundary, only a current owned deletion lease with a closed race gate can journal and conditionally replace an exactly verified guard/payload with the registered distinct seal. Verify the exact seal and immutable evidence before a separately authorized exact-key DELETE; absence or a DELETE response alone is never deletion completion. A payload writer always retains G and cannot acquire authority from the seal or a new lease. Keep analysis-result deletion fail-closed until this integration is implemented and verified.

Provider commit-time condition/ETag guarantees, exclusion of all bypass/legacy writers and credentials, bounded Worker CPU/memory, finite recovery, owner deletion/export inventory, safe evidence retention/removal and coordinated backup/restore require separate evidence and approval. Offline models are not provider proof. No generic sealing bypass, legacy adoption, guard reopening, automatic GC or indefinite retention policy is authorized.

### PostgreSQL relationship and future completion

analysis_runs.summary will contain exactly the validated summary object present in the immutable detailed result. PostgreSQL separately records result format version, SHA-256, byte size, and the internal private object reference. completed_at and other processing timestamps remain operational database metadata and are not part of deterministic result bytes.

A future server-only completion RPC must atomically require the current processing lease for a running result; validate and persist the bounded summary and result metadata; transition the run to complete; and transition the race to ready only if the run remains the race's required analysis version. For an uncertain database response, an already-complete run with exactly the same immutable result identity may return success as a no-op. A conflicting identity fails closed.

No completion RPC, result persistence, or analysis algorithm is authorized by this decision. Update privacy/processing records and confirm processor, transfer, access, and retention controls before production result collection.

## Consequences

- Contracts and stored result bytes have a stable, reproducible identity independent of operational processing time.
- Detailed location data remains in private R2; PostgreSQL stores only bounded summary data and internal identity metadata.
- Retries and uncertain writes can verify the exact immutable object without overwriting history.
- Result schema validation, canonicalization, size enforcement, object publication, and atomic completion require separately reviewed implementation and tests.
