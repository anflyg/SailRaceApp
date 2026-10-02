# TackWise Cloud Data Model

**Status:** Baseline table descriptions with ADR-003 upload additions implemented in API migration 00003. The ADR-004 analysis lifecycle and client-access changes below are accepted architecture, not yet migrated.

## Goals

- Keep identity and authorization simple and auditable.
- Keep bulk GPS/telemetry out of PostgreSQL.
- Make race/account deletion deterministic.
- Support re-analysis of historic race files.
- Enforce user ownership in the database with Row Level Security (RLS), not only in application code.
- Keep product analytics separate from the private race-analysis dataset.

## Identity

The canonical user identity is `auth.users.id` from Supabase Auth (UUID). Email address and Apple relay email, if present, are attributes only and must never be used as ownership keys.

## Deployed baseline tables

### `profiles`

One row per authenticated user.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | uuid PK/FK -> `auth.users.id` | Canonical owner ID |
| `created_at` | timestamptz | Server generated |
| `display_name` | text nullable | Optional, not required for identity |
| `account_status` | text | e.g. active/deletion_pending |

Do not duplicate Apple subject IDs, tokens or email unless there is a documented product need.

### `races`

One row per synchronized race.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | Opaque race ID generated client or server side |
| `user_id` | uuid FK -> `auth.users.id` | Owner |
| `started_at` | timestamptz | Race start |
| `ended_at` | timestamptz nullable | Race end |
| `duration_seconds` | integer nullable | Derived metadata |
| `distance_m` | numeric nullable | Derived metadata |
| `boat_id` | uuid nullable | Optional future boat reference |
| `course_id` | uuid nullable | Optional future course snapshot/reference |
| `raw_object_key` | text | Private R2 object key using opaque IDs only |
| `raw_format_version` | integer | Version of uploaded race format |
| `raw_sha256` | text | Integrity/idempotency support |
| `raw_size_bytes` | integer nullable | Added by migration 00003; positive for new accepted uploads, nullable for historic rows |
| `sync_state` | text | uploaded/processing/ready/error |
| `created_at` | timestamptz | Server generated |
| `updated_at` | timestamptz | Server generated |

No latitude/longitude sample stream is stored as rows here.

### `analysis_runs`

One row per analysis execution/version for a race.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | Opaque ID |
| `race_id` | uuid FK -> `races.id` | Analysed race |
| `user_id` | uuid FK -> `auth.users.id` | Denormalized owner for simple RLS |
| `analysis_version` | text | Algorithm/version identifier |
| `status` | text | queued/running/complete/error |
| `summary` | jsonb nullable | Small derived summary only |
| `result_object_key` | text nullable | Optional private R2 key for larger derived result |
| `created_at` | timestamptz | Server generated |
| `completed_at` | timestamptz nullable | Completion time |

### `entitlements`

Server-controlled entitlement state.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | uuid PK/FK -> `auth.users.id` | User |
| `plan` | text | Commercial/product tier: `free` or `pro` |
| `access_source` | text | Authorization source: `free`, `app_store`, or `beta` |
| `status` | text | active/expired/revoked |
| `valid_until` | timestamptz nullable | Paid entitlement expiry if applicable |
| `free_races_used` | integer | Server-maintained counter, max free allowance = 3 |
| `updated_at` | timestamptz | Server generated |

The client must never be authoritative for licence state or free-race counters.

## Deployed entitlement model

The deployed schema keeps one entitlement row and the existing counter. No separate billing, tester, event-history or client-device table is required initially. The server-only beta-administration audit table required by [ADR-002](decisions/adr-002-beta-entitlement-administration.md) is separate from product analytics and normal client access. The entitlement model separates commercial/product tier (`plan`) from why that tier is authorized (`access_source`):

| Field | Conceptual values / rule |
| --- | --- |
| `plan` | `free` or `pro` |
| `access_source` | `free`, `app_store`, or `beta` |
| `status` | `active`, `expired`, or `revoked` |
| `valid_until` | Expiry where applicable; mandatory for `access_source = beta` |
| `free_races_used` | Server-maintained free-race counter |
| timestamps | Server-generated `created_at` and `updated_at` timestamps |

This permits future monthly/yearly Pro products or alternative billing without coupling the product tier to a provider.

| Plan | Access source | Required state | Cloud sync and analysis | Counter treatment |
| --- | --- | --- | --- | --- |
| `free` | `free` | `status = active` and fewer than 3 accepted cloud races | Allowed | Increment atomically only after successful acceptance |
| `pro` | `app_store` | `status = active` and server-verified entitlement is currently valid | Allowed | Never consume or depend on the counter |
| `pro` | `beta` | `status = active`, `valid_until` is non-null, and `valid_until` is in the future | Allowed only during the authorized beta period | Never consume or depend on the counter |

`valid_until` is evaluated by the server. Beta access is always time-bounded: it expires when its required expiry passes and may be revoked before then. `access_source = app_store` is not granted from a client claim: later server-side App Store transaction/subscription verification must establish and refresh it.

The current `/v1/me` API contract returns `plan`, `access_source`, `status`, `valid_until`, and `free_races_used`; it does not expose billing transactions, beta evidence, or other operational details.

## Free analysis rule

TackWise Analysis Free allows the first **three successfully accepted cloud races** for an account to be synchronized and analysed without a paid entitlement.

The server must make this decision atomically to prevent parallel requests from exceeding the free allowance. A failed/corrupt upload should not consume a free race unless a product decision explicitly changes this rule.

After free entitlement is exhausted:
- the iPhone may continue recording locally,
- additional cloud upload/analysis is rejected unless a valid `plan = pro` entitlement has an authorized `access_source`,
- once entitlement becomes active, locally retained races may be synchronized.

Expired or revoked Pro does not authorize a new race acceptance. Previously accepted races and stored results remain readable, exportable, and deletable by their authenticated owner, and the normal initial analysis for an already accepted race may complete. Entitlement gates new cloud acceptance, not ownership of existing data; optional re-analysis policy is separate.

## Race-upload lifecycle

[ADR-003](decisions/adr-003-first-race-upload-and-sync.md) keeps `races` as accepted-race state. Migration 00003 implements the server-only `race_uploads` reservation table for prepared but unaccepted uploads using the race UUID, owner UUID, raw version, compressed SHA-256 and size, server-derived object key, accepted structured metadata, and expiry timestamps. It receives no direct normal-client access.

`races.sync_state = uploaded` means the private raw object was validated and the PostgreSQL acceptance transaction committed. This is the only state that may consume one free race. `processing`, `ready`, and `error` describe analysis after acceptance; no `pending` or `uploading` race state is added. Migration 00003 adds `raw_size_bytes` for integrity and operational controls.

The service-role-only acceptance operation locks the reservation and entitlement, returns matching accepted retries idempotently, inserts the unique accepted race, increments the free counter only when required, and completes the reservation in one transaction. R2 is populated before this transaction; unreferenced private objects remain invisible and are retried or removed by bounded cleanup.

## RLS baseline

RLS must be enabled on all user-owned tables.

The baseline owner-select policies below are database defense in depth, not the future Analysis browser contract. [ADR-004](decisions/adr-004-analysis-dispatch-lifecycle-and-cleanup.md) requires Worker-only authenticated owner-scoped APIs. Current table-level visibility includes `raw_object_key` and `result_object_key`; remove/restrict internal-field access in a reviewed forward migration before Analysis client rollout. No privilege change is performed by these documents.

### `profiles`
- `SELECT`: `auth.uid() = user_id`
- `UPDATE`: `auth.uid() = user_id` for explicitly user-editable columns only
- no direct client `INSERT`/`DELETE` unless implemented through a controlled flow

### `races`
- `SELECT`: `auth.uid() = user_id`
- direct client `INSERT`: only if the architecture intentionally allows it and `user_id = auth.uid()`; preferred upload flow is through the TackWise API/Worker so entitlement, object storage and metadata are coordinated
- `UPDATE`: owner may update only explicitly permitted metadata; server controls processing/integrity fields
- `DELETE`: owner may request deletion, but final cross-store deletion should run through a server-side deletion workflow that also removes R2 objects and analysis rows

### `analysis_runs`
- `SELECT`: `auth.uid() = user_id`
- no direct client insert/update/delete; server/service role only

### `entitlements`
- `SELECT`: `auth.uid() = user_id`
- no direct client writes; trusted server/billing flow only

### `race_uploads`
- no direct normal-client select/insert/update/delete
- RLS enabled with no `anon` or `authenticated` privileges/policies
- trusted server access only, always scoped to the validated Supabase UUID

## Service-role boundary

The Supabase service-role key must never be present in the iPhone app, browser bundle, GitHub repository or client-visible configuration. Only trusted server-side code may use it.

Server-side use of service role bypasses RLS, so every such operation must explicitly verify the authenticated user's ownership/entitlement before accessing user data.

## Analytics boundary

Product analytics, if approved, is not part of `races`, `analysis_runs`, R2 raw objects, or the entitlement row. It uses a separately documented minimized event model and must not reuse raw race telemetry, GPS coordinates, race payloads, Apple identifiers, email, sessions, tokens or secrets.

## Indexes

At minimum plan indexes for:
- `races(user_id, started_at desc)`
- `analysis_runs(race_id, analysis_version)`
- `analysis_runs(user_id, created_at desc)`

The baseline `analysis_runs(race_id, analysis_version)` index is non-unique. ADR-004 requires a forward migration enforcing `UNIQUE (race_id, analysis_version)`; an application check is insufficient.

## Planned analysis lifecycle under ADR-004

- Retain `analysis_runs` and its `queued | running | complete | error` statuses. Enforce that its denormalized `user_id` agrees with `races.user_id`; the baseline's independent foreign keys do not establish that agreement.
- Add `races.required_analysis_version`. Only its matching run can drive `sync_state`; multiple historic versions coexist without altering current race state.
- Start with `analysis-v1`, independent of raw/API/result format versions. Persist consumed raw identity, separate dispatch/processing lease ownership, finite attempt budgets, retry times, processing timestamps and safe terminal outcomes through reviewed RPCs.
- Store a bounded schema-validated summary without raw tracks/GPS streams. A larger private immutable result requires result format version, digest, byte size and server-only reference. Exact fields/metrics remain later contract work.
- Keep object references, leases and provider diagnostics outside the client DTO. Future public-schema Data API objects need explicit least-privilege grants/revokes in the same migration.

See [ADR-004](decisions/adr-004-analysis-dispatch-lifecycle-and-cleanup.md) for accepted values, cleanup concurrency and gates. Exact SQL/RPC definitions remain step 6C; do not edit historical migrations.

## Deletion

Deleting a race must remove:
1. analysis results/objects,
2. raw R2 race object,
3. any pending upload reservation/object for that race,
4. related PostgreSQL rows.

Deleting an account must enumerate and delete all accepted and pending user-owned cloud races/objects before or as part of account removal, subject only to documented legal retention.

Before beta, separately design and demonstrate retryable, observable cross-store deletion with finite automatic attempts and manual escalation. Preserve durable object references; do not start with `ON DELETE CASCADE` when it would destroy the only R2 references. Delayed analysis work must honor deletion state.

## Open decisions before implementation

- Exact paid billing products/pricing and entitlement source.
- Server-side App Store verification and exact paid product behavior.
- Raw-race/API schemas and initial upload limits, following [ADR-003](decisions/adr-003-first-race-upload-and-sync.md).
- Analytics event model, legal basis, provider and retention.
- Whether boats/courses are normalized tables or immutable snapshots embedded in race metadata.
- Exact metadata that belongs in PostgreSQL versus derived analysis output.
- Exact account-deletion grace period.
