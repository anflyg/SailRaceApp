# ADR-003: First race upload and sync architecture

**Status:** Accepted, implementation deferred.

**Date:** 2026-09-15

## Context

TackWise Race records races locally and must remain fully usable when cloud services or connectivity are unavailable. A completed race may later be synchronized for private storage and analysis. Raw GPS/race telemetry is personal data, belongs in private Cloudflare R2, and must not be written to PostgreSQL or ordinary logs. Structured metadata and server-authoritative entitlement state belong in Supabase/PostgreSQL.

The deployed API currently has no race upload endpoint. The deployed `races` table already has an opaque race UUID, owner UUID, structured metadata, immutable-object fields, and `sync_state = uploaded | processing | ready | error`. ADR-001 requires the free counter to increment atomically, exactly once, and only after a cloud race is successfully accepted. R2 and PostgreSQL do not share a transaction, so the first upload design must make their boundary explicit and recoverable.

## Decision

### Use authenticated prepare, upload, and finalize requests through the Worker

The first production flow is an authenticated cloud-ID creation step followed by the three-step Worker-mediated upload protocol:

1. **Create cloud race:** in a dedicated authenticated, idempotent request, the server creates and returns a cloud race UUID. The phone retains its existing local race ID and stores the returned cloud ID separately. This request creates the only cloud identity eligible for synchronization.
2. **Prepare:** reserve that server-issued cloud race UUID and immutable upload description without consuming entitlement.
3. **Upload content:** send one bounded gzip object through the Worker. The Worker authenticates the user, validates ownership and the prepared description, validates the compressed and expanded payload, computes SHA-256, and writes the verified bytes through its private R2 binding.
4. **Finalize:** verify the stored object and execute one authoritative PostgreSQL acceptance transaction. Only this step accepts the `races` row, consumes a free race where applicable, and makes the race eligible for analysis.

```text
iPhone completed race
  |-- POST create -------> Worker -- cloud identity ---> PostgreSQL
  |-- POST prepare ------> Worker -- reservation ------> PostgreSQL
  |-- PUT gzip content --> Worker -- validated bytes --> private R2
  `-- POST finalize -----> Worker -- verify R2
                                  `-- atomic accept ----> PostgreSQL
                                                        `-- analysis handoff
```

Every step requires a Supabase bearer token validated server-side. The client never receives R2 credentials, a bucket key, or a signed R2 URL. The URL of the content endpoint is not a capability: possession without a valid user session and ownership check grants nothing.

This protocol is preferred over the alternatives for the first release:

- A one-step Worker upload combines a large, failure-prone transfer with acceptance and makes recovery after a lost response harder.
- A direct signed R2 upload saves Worker bandwidth but adds signing credentials/code, leak and expiry handling, and a more complex validation/finalization boundary. It does not by itself provide resumability. It may be reconsidered in a later ADR if measured payload size or cost requires it.
- Multipart/resumable upload is deferred. With strict initial size limits, retrying the same immutable gzip object from the beginning is the smallest reliable mobile design.

Cloud failure never changes or deletes the local race. Synchronization begins only after recording has completed and is always retryable or deferrable.

### Race identity and immutable retry material

- TackWise Race keeps its existing local race ID unchanged and independent of cloud identity. Recording and all race-critical behavior remain available offline.
- A dedicated authenticated cloud-race creation operation generates the cloud race UUID on the server using a cryptographically secure random generator conforming to UUIDv4. The client cannot choose or submit this UUID. Only this operation may create cloud race identity; prepare, finalize, imports, recovery and generic service-role code must never create an identity from an incoming UUID.
- A server-issued, cryptographically verifiable creation-intent attestation is required. Its validity is exactly 24 hours from the server's issuance time. Issuing the attestation does not create a cloud race, reservation, or race gate. The attestation must let the server verify its issuance and expiry after temporary database intent records have been pruned; its encoding, claims, signing/verification algorithm and key lifecycle remain open.
- A currently valid attestation may be presented only in an authenticated, idempotent cloud-race creation request. Successful creation atomically associates that intent with one server-generated UUIDv4 and its race gate. Repeated requests for the same intent return that same identity while its gate remains open; a closed race or account is rejected and never reopened, including on retry. An expired attestation is rejected without automatic renewal or replacement. Another creation attempt after expiry requires a new, explicit user action that initiates a new intent.
- The race gate is provisioned open only as part of successful authenticated creation using a valid intent attestation and an existing open account gate, in the global account-gate-before-race-gate order. No login, ordinary API request, prepare/finalize call, missing UUID or service-role lookup may create a missing gate or reopen a closed gate.
- Creation-intent identity, account binding, replay control, durable mapping, retention, and restore behavior must be designed so an unexpired attestation cannot create another identity after temporary state is pruned, and so no required protective state is removed while valid attestations or external writes can still affect the race. These controls must be reviewed before use.
- A cloud race UUID is immutable once issued. UUID possession is never authorization. UUIDv4 collision/reissue probability is accepted as astronomically small; this decision does not require a central monotonic allocator, UUIDv8 scheme, or global UUID denylist. All access still requires authenticated ownership and open server-side gates. A random collision with an existing live identity must be rejected by database uniqueness and retried only within the creation transaction; collision checking against permanently deleted IDs is not required by this accepted probability decision.
- Existing local records retain their local IDs. They receive a separate server-issued `cloudRaceId` through the authenticated creation operation before their first prepare request.
- Before prepare, the phone serializes the versioned raw payload, gzip-compresses it, computes SHA-256 over the exact compressed bytes, and persists that exact blob or reproducible immutable upload artifact until acceptance. Retries must not silently reserialize different bytes under the same prepared upload.
- The issued `race_id` identifies the cloud race for prepare/content/finalize idempotency. The creation-intent idempotency mechanism is separate and must not allow a delayed/replayed request to reopen a closed race or account gate.

Prepare reserves only a previously issued race UUID globally for its authenticated owner. It rejects a UUID with no existing server-issued identity or open race gate; it never provisions identity or gates from the path value. Repeating prepare with the same owner, version, digest, size, and immutable metadata returns the existing state. A different owner receives a non-enumerating not-found/conflict response. Changed immutable input for an existing reservation or accepted race returns `409 race_conflict`.

An identical content PUT is safe to repeat. After acceptance, content PUT is disabled. Finalize is idempotent: it checks for a matching accepted race for the authenticated owner before requiring a reservation. A matching owner/race/version/digest returns the accepted result and never touches entitlement state or increments the counter again.

### Minimal v1 API contract

The authenticated cloud-race creation operation is a prerequisite to the upload contract below. It accepts no cloud race UUID and returns the server-issued UUID. A valid server attestation is required, expires 24 hours after issuance and is not refreshed automatically. Issuance alone creates no cloud race. The request/response schema, attestation claims and cryptographic format, account/race gate transaction, same-local-race mapping, and behavior for old clients are not yet specified here and must be reviewed as part of the versioned contract before implementation. No legacy prepare request may mint or lazily adopt a cloud ID.

All responses include an opaque request ID. Error responses contain only a stable category and must not include provider errors, SQL, object keys, tokens, payload fragments, or GPS data.

#### Prepare

```http
POST /v1/races/{raceId}/upload
Authorization: Bearer <supabase-access-token>
Content-Type: application/json
```

Conceptual request:

```json
{
  "rawFormatVersion": 1,
  "rawSha256": "64-lowercase-hex-characters",
  "compressedBytes": 123456,
  "startedAt": "2026-09-15T10:00:00Z",
  "endedAt": "2026-09-15T11:30:00Z",
  "durationSeconds": 5400,
  "distanceMeters": 18750
}
```

The path UUID, not a body `userId`, identifies the race. The server derives the owner from the validated token. The server validates timestamps, non-negative bounded numeric metadata, supported raw format, digest syntax, and declared size. It performs a preliminary entitlement check to avoid unnecessary upload, but does not reserve or consume a free allowance.

Conceptual response:

```json
{
  "raceId": "8d64f32d-28d9-4df0-b83d-4818d229930f",
  "uploadState": "prepared",
  "contentUrl": "/v1/races/8d64f32d-28d9-4df0-b83d-4818d229930f/upload/content",
  "expiresAt": "2026-09-16T10:05:00Z",
  "limits": {
    "compressedBytes": 5242880,
    "expandedBytes": 20971520,
    "samples": 50000
  }
}
```

Use `201` for a new reservation and `200` for a matching existing reservation or already accepted race.

#### Upload content

```http
PUT /v1/races/{raceId}/upload/content
Authorization: Bearer <supabase-access-token>
Content-Type: application/gzip
Content-Length: <bytes>

<exact prepared gzip bytes>
```

The request body is the exact immutable gzip artifact, not an HTTP representation that a transport layer may decode. There is no `Content-Encoding` header in the first-version contract. `Content-Length` is the compressed artifact length. The first implementation starts with hard upper bounds of 5 MiB compressed, 20 MiB after decompression, and 50,000 samples. The contracts PR must validate these limits against representative long-race fixtures and may reduce them before release. Raising a limit requires runtime/cost testing and a documented contract/configuration change.

The Worker rejects a missing or oversized declared length before reading the body, also enforces the compressed limit while reading, hashes those exact body bytes, and requires the size and hash to match prepare. It performs bounded gzip decompression, UTF-8/JSON parsing, schema validation, race-ID/version matching, sample/event count limits, finite numeric/range checks, and timestamp sanity checks before writing the original exact gzip bytes to R2. Validation must stop when the expanded-byte limit is crossed to prevent gzip bombs.

A successful write returns `204`. A lost response is not proof of failure: the client may retry the identical PUT or proceed to idempotent finalize. An incomplete R2 PUT produces no partial visible object.

#### Finalize

```http
POST /v1/races/{raceId}/upload/finalize
Authorization: Bearer <supabase-access-token>
Content-Type: application/json

{
  "rawFormatVersion": 1,
  "rawSha256": "64-lowercase-hex-characters"
}
```

Conceptual response:

```json
{
  "raceId": "8d64f32d-28d9-4df0-b83d-4818d229930f",
  "uploadState": "accepted",
  "syncState": "uploaded",
  "consumedFreeRace": true
}
```

Finalize derives the owner only from the validated token. It first checks for an accepted `races` row for that owner and race UUID. If its immutable accepted identity, raw version, and compressed digest match the finalize request, it returns the existing accepted result without rechecking entitlement or requiring a `race_uploads` row. A conflicting accepted row returns `race_conflict` (or a non-enumerating equivalent for another owner). Only when no accepted race exists does the Worker confirm the expected private R2 object and call the service-role-only acceptance transaction that requires the reservation. A lost response is an unknown outcome; retrying finalize with the same race UUID and immutable finalize fields is the recovery path. The client must never start a second race identity to resolve an ambiguous finalize response.

#### Status and errors

Prepare itself is the minimal reconciliation/status operation: an identical retry reports `prepared` or `accepted`. A separate status endpoint is not required initially.

Important status codes and sanitized categories are:

| Status | Category | Meaning |
| --- | --- | --- |
| `400` | `invalid_request` | Invalid UUID, metadata, headers, or request shape |
| `401` | `unauthorized` | Missing, malformed, expired, or invalid user token |
| `403` | `cloud_access_unavailable` | No currently valid entitlement/free allowance for a new acceptance |
| `404` | `upload_not_found` | No owned reservation; also used where ownership disclosure would be unsafe |
| `409` | `race_conflict` | Immutable race UUID is already bound to different content/metadata |
| `410` | `upload_expired` | Prepared upload expired and must be prepared again |
| `413` | `payload_too_large` | Compressed, expanded, sample, or event limit exceeded |
| `415` | `unsupported_media_type` | Content PUT is not the required `application/gzip` artifact |
| `422` | `invalid_race_payload` | Hash mismatch, malformed gzip/JSON, unsupported schema, or invalid telemetry |
| `429` | `rate_limited` | Bounded abuse/cost control |
| `502`/`503` | `upstream_unavailable` | Sanitized dependency failure; mutation outcome may be unknown |

Clients retry transport, `429`, and temporary `5xx` failures with bounded exponential backoff and jitter. They do not automatically retry permanent `4xx` validation/conflict failures. `401` requires session refresh. Finalize retries remain idempotent.

### R2 key and immutability

The Worker derives the key; the client never sends it:

```text
races/<user_uuid>/<race_uuid>/raw-v<format_version>-sha256-<compressed_sha256>.json.gz
```

Only opaque UUIDs and technical version/digest data appear in the key. Names, emails, Apple identifiers, boat names, club names, and dates are prohibited.

The validated object is written to its canonical key before database acceptance but remains logically staged: it is private and neither readable nor analyzable through application flows until an accepted `races` row references it. Including the compressed-byte digest in the key makes identical retry content converge and prevents changed content from overwriting the accepted object. Once accepted, the API exposes no operation that modifies that key.

The stored object preserves the exact request-body gzip bytes and records `Content-Type: application/gzip`, the verified compressed size, raw format version, SHA-256, and gzip compression as trusted R2 metadata. It does not rely on HTTP `Content-Encoding` transport decoding to preserve the hash invariant. SHA-256 is calculated over the exact stored compressed bytes. Payload schema validation occurs against the decompressed JSON.

Prepared sessions expire 24 hours after creation. A scheduled server-side cleanup runs at least daily and removes expired reservation rows and their unreferenced R2 objects within a further 24 hours, after rechecking that no accepted race references the key. Thus abandoned personal telemetry should normally be removed within 48 hours of prepare. Cleanup must be idempotent and safe against concurrent finalize.

### PostgreSQL lifecycle

The accepted `races` table remains accepted-race state, not an upload-progress table. Do not add `pending` or `uploading` to `races.sync_state`:

| `races.sync_state` | Meaning |
| --- | --- |
| `uploaded` | Raw object validated and successfully accepted; this is the only state that may have consumed one free race and is eligible to queue analysis |
| `processing` | Accepted raw object is being analyzed |
| `ready` | The current analysis result is available |
| `error` | The race remains accepted and immutable, but analysis failed; retry/reprocessing may be allowed separately |

Add a server-only, RLS-enabled `race_uploads` reservation table in a reviewed migration. Its minimal fields are: race UUID primary key, owner UUID, raw format version, compressed SHA-256, compressed size, server-derived object key, accepted structured metadata, `created_at`, and `expires_at`. Row existence means prepared/pending; object presence is verified in R2 rather than inferred from a fragile `uploading` flag. Normal clients receive no direct table privileges or policies and use only the API.

Add compressed `raw_size_bytes` to `races` for integrity, cost, and operational checks. Keep existing `raw_object_key`, `raw_format_version`, `raw_sha256`, timestamps, constraints, owner-only read policy, and private-object boundary. The acceptance RPC copies the prepared fields into `races`; it never accepts a client-supplied object key.

### Entitlement and exactly-once free-race consumption

Prepare may reject clearly ineligible users before storage, but finalize is authoritative because entitlement and counters can change during upload.

At finalize, the server permits a new race only when:

- `plan = free`, `access_source = free`, `status = active`, and `free_races_used < 3`; or
- `plan = pro`, `access_source = app_store`, `status = active`, and the server-maintained App Store state is currently valid; or
- `plan = pro`, `access_source = beta`, `status = active`, and `valid_until` is non-null and in the future.

Expired or revoked Pro does not authorize a new acceptance. The upload API does not silently convert it to Free; a separate reviewed entitlement flow must perform any tier transition. A blocked race stays local/queued and can be synchronized after valid access is restored.

Previously accepted races and stored results remain readable, exportable, and deletable by their authenticated owner after Pro expiry/revocation. Successful acceptance authorizes the normal initial analysis for that race to complete; a future policy for optional re-analysis is separate. Entitlement gates new cloud acceptance, not ownership of existing data. Account suspension or incident containment is a separate authorization control.

The authoritative `accept_race_upload` database operation is service-role-only and narrowly scoped. The Worker passes the owner derived from the validated token; it never accepts a client-supplied owner. In one PostgreSQL transaction it:

1. first checks for an accepted `races` row for that owner and race UUID;
2. returns that result immediately, without entitlement locking or counter mutation, when its immutable raw version/digest expectations match;
3. returns `race_conflict` (or a non-enumerating equivalent when ownership must not be disclosed) when an accepted row conflicts;
4. only when no accepted row exists, requires and locks the UUID reservation and checks its owner/version/digest/metadata;
5. locks the user's entitlement row with `SELECT ... FOR UPDATE`;
6. re-evaluates the source-specific entitlement rules;
7. inserts the unique `races` row with `sync_state = uploaded`;
8. increments `free_races_used` by one only for an eligible Free entitlement; and
9. removes/completes the reservation in the same transaction.

If concurrent finalizers wait on, or no longer find, a reservation, the operation rechecks the accepted race before returning an error. This makes a completed acceptance recoverable after its reservation is removed: a retry using the same race UUID returns the accepted result and cannot increment `free_races_used` twice.

The unique race primary key plus the locked entitlement row serializes concurrent finalize requests. The race insert and free-counter update commit or roll back together. Concurrent Free uploads cannot take the counter above three, retries cannot double-increment, and abandoned uploads never enter this transaction. Deleting an accepted race does not decrement or refund `free_races_used`, because the rule is the first three races ever successfully accepted, not three concurrently stored races.

R2 cannot participate in this database transaction. Therefore the object is verified and stored first. If R2 succeeds but database acceptance fails, the private unreferenced object remains recoverable by retry and is eventually removed by cleanup. If the database commits but the response is lost, idempotent finalize returns the existing accepted race. The API/analysis path never treats an R2 object without an accepted row as user-visible or analyzable.

### Security controls

- Validate the Supabase access token on every prepare, content, and finalize request; derive `user_id` only from the validated identity.
- Scope every reservation/race lookup by the authenticated UUID. Return non-enumerating errors for another user's UUID.
- Treat race UUID, digest, size, and metadata as untrusted inputs. UUIDs prevent accidental collision; they do not confer access.
- Derive object keys server-side and reject all client object-key input.
- Apply request-rate, compressed-byte, expanded-byte, sample/event-count, numeric-range, and processing-time bounds before expensive work.
- Validate gzip incrementally with a hard expanded-byte ceiling; never decompress or parse an unbounded body.
- Verify SHA-256 of stored compressed bytes and validate the decompressed schema before R2 write/acceptance.
- Never overwrite an accepted object or allow a conflicting digest/version for an accepted race UUID.
- Use service role only inside trusted Worker/database code. The iPhone receives no service role, R2 token, bucket credentials, object key, or generic database write path.
- Never log bearer tokens, secrets, request bodies, raw GPS, decompressed JSON, exact coordinates, or provider error bodies. Minimized logs may include request ID, opaque user/race UUID, phase, bounded byte count, format version, HTTP status, duration, and safe error category.
- A bearer token validated before content transfer may expire while that in-flight request completes; a later request requires a fresh/refreshable token. A `401` never causes local race deletion.
- Because no signed R2 URL is issued, temporary-URL leakage is not part of the first flow. Introducing signed/direct upload later requires a separate threat-model/ADR update.

Required tests include cross-user prepare/content/finalize attempts, UUID/key substitution, conflicting duplicates, concurrent free finalization at the limit, replayed finalize, lost-response retry, auth expiry between phases, missing/incomplete objects, R2-success/database-failure recovery, oversized bodies, misleading `Content-Length`, malformed gzip/JSON, gzip bombs, excessive samples/events, invalid coordinates/timestamps, checksum mismatch, cleanup/finalize races, log redaction, and absence of client table writes.

### Privacy, retention, deletion, and CRA

Raw telemetry, course/mark/start positions, race events, sensor quality, and any associated timestamps are personal data. The owner UUID, race UUID, upload reservation, digest, timing, size, and race summary metadata are pseudonymous personal/operational data. Process them only to provide user-requested sync, private storage, integrity, and analysis.

The first raw contract excludes local display names, email, Apple/TestFlight identity, advertising/device identifiers, contacts, unrelated sensor fields, and product analytics. App/build and sensor-source fields are included only when needed to interpret the recording. Product analytics remains a separate, unimplemented processing activity.

Accepted data follows the race/account retention and deletion rules. Race deletion must remove analysis artifacts, the raw R2 object, accepted metadata, and any pending upload reservation. Account deletion must enumerate both accepted and pending races/objects before identity removal, subject only to documented legal retention. Abandoned reservations/objects follow the 24-hour expiry and cleanup target above. Operational logs use the shortest justified retention and contain no payload/location data.

Before production use with end users, update the public privacy information and processing record with the implemented sync purpose, exact fields, processors, retention, deletion/export behavior, and lawful-basis assessment. Verify Supabase/Cloudflare regional, processor, transfer, backup, and deletion behavior.

CRA/security evidence for the feature includes the approved ADR and data-flow/threat model, versioned contracts and fixtures, authorization/RLS/privilege tests, concurrency/idempotency tests, payload and decompression-limit tests, dependency/secret review, R2 privacy checks, cleanup/deletion drills, deployment/migration records, monitored safe error categories, and vulnerability/incident handling updates.

### Minimum iPhone sync state

Recording state and cloud sync state remain separate. An active race is never uploaded, and no sync transition can stop or invalidate local recording. A completed local race uses only these persisted cloud-sync states:

| Local state | Meaning and transition |
| --- | --- |
| `recorded_local` | Completed and retained locally; not currently queued, for example before sign-in or user sync intent |
| `queued` | Eligible for a future attempt; also the destination after connectivity loss, app restart, token refresh need, rate limit, or temporary server failure, with bounded backoff metadata |
| `syncing` | A prepare, content PUT, or finalize request is currently in progress; this is transient and returns to `queued` if interrupted |
| `blocked_entitlement` | Server refused new acceptance because Free is exhausted or Pro is invalid; retain locally and retry only after entitlement/user action changes |
| `invalid` | Permanent raw-format/schema/content failure; do not loop automatically, retain locally, and present a safe user action/support path |
| `accepted` | Idempotent finalize confirmed the race exists as `races.sync_state = uploaded` in cloud |

Do not persist separate `prepared`, `uploading`, `finalizing`, or `interrupted` UI states initially. Persist the local-to-cloud ID association, immutable cloud race UUID, raw version/digest/size, prepared expiry where useful, last safe error category, attempt time, and backoff—not tokens, provider errors, or secrets. After an ambiguous content/finalize outcome, use the same issued UUID/artifact and reconcile through prepare/finalize rather than creating a duplicate. Offline recordings remain usable without cloud ID issuance; synchronization waits for authenticated connectivity.

### Analysis handoff

[ADR-004](adr-004-analysis-dispatch-lifecycle-and-cleanup.md) records the accepted queue technology, version targeting, leases/retries, Worker-only Analysis access and concrete cleanup configuration. It extends this handoff without changing race acceptance or Free accounting.

Analysis may be queued only after the acceptance transaction commits `races.sync_state = uploaded`. At that point the raw R2 object and its version/digest are immutable. An analysis worker receives only the accepted race UUID and analysis version, loads ownership/object metadata from PostgreSQL, and reads the private object through trusted server bindings.

Queue delivery must be retryable. Create or enforce uniqueness for `(race_id, analysis_version)` so retries cannot create duplicate analysis work. A missed queue notification is recovered by a reconciler that scans accepted `uploaded` races without the required analysis run. Analysis changes `sync_state` to `processing`, then `ready` or `error`; it never mutates the raw object. Analysis algorithms are outside this ADR.

### Contract and repository ownership

- **`anflyg/tackwise-contracts`:** owns the versioned raw-race JSON Schema, prepare/finalize request/response and error schemas, limits/constants, example fixtures, compatibility rules, and analysis input envelope.
- **`anflyg/tackwise-api`:** owns authentication/authorization, upload-session persistence, payload validation, R2 operations, the atomic acceptance RPC/migration, cleanup/reconciliation, sanitized logging, and analysis dispatch.
- **`anflyg/SailRaceApp`:** owns authoritative product/security/privacy decisions, preservation of the local race ID, persistence of the separate server-issued cloud UUID, authenticated creation-intent retry state, gzip/hash preparation, offline queue/backoff, and user-facing local sync state.
- **`anflyg/TackWiseAnalysis`:** consumes only authenticated accepted-race metadata/results. It does not upload raw iPhone telemetry or access R2 directly.

Raw format version, `/v1` API version, and analysis version are independent. A raw object is permanently labeled with `rawFormatVersion`; API breaking changes require a new API version; each analysis result records `analysisVersion` and the accepted raw version/digest it consumed. Readers must explicitly support or reject each raw version rather than guessing.

## Consequences

- The first flow adds an authenticated idempotent cloud-identity creation operation before the three upload operations, but no direct R2 credentials or database writes to clients.
- Mobile retries are deterministic, but a content retry restarts the bounded object; resumable multipart upload is deferred.
- A short-lived private orphan can exist between R2 write and database acceptance. It is never visible as a race and is bounded by idempotent recovery and scheduled cleanup.
- Free allowance is consumed only by the database acceptance transaction and exactly once per unique accepted race.
- Existing accepted data remains owner-readable after entitlement expiry/revocation, while new acceptance is blocked.
- New schema/RPC, API, R2, iPhone, and operational work must be delivered as separately reviewed PRs; this ADR performs none of it.

## Remaining decisions before coding

The sequenced work is recorded in the [first race upload implementation roadmap](../race-upload-implementation-roadmap.md).

- Validate the proposed 5 MiB compressed, 20 MiB expanded, and 50,000-sample limits against representative current-device recordings and Cloudflare Worker memory/CPU limits; the contracts PR must freeze the initial values before endpoint implementation.
- Define the exact raw-race v1 JSON Schema and decide which current app/build and sensor-source fields are strictly necessary for reproducible analysis.
- Confirm the production privacy notice/lawful basis, processor/transfer configuration, and operational log retention before enabling upload for end users.
- Implement the queue, scheduled-cleanup and reconciler decisions now recorded in [ADR-004](adr-004-analysis-dispatch-lifecycle-and-cleanup.md), preserving this ADR's lifecycle and retention guarantees. Runtime, migrations and production enablement remain separately reviewed work.
- Define and test attestation format and key lifecycle, creation-intent/replay storage and idempotency, local-to-cloud mapping retention, account lifecycle, old-client migration/rejection, restore behavior, and safe pruning. Preserve state until all unexpired attestations and external writes are safely handled. Deletion gates and R2 fencing remain mandatory; this identity decision does not resolve D5 safety or permit deletion activation.
