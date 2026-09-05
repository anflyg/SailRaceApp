# TackWise Cloud Data Model

**Status:** Proposed baseline for implementation. No production schema has been deployed yet.

## Goals

- Keep identity and authorization simple and auditable.
- Keep bulk GPS/telemetry out of PostgreSQL.
- Make race/account deletion deterministic.
- Support re-analysis of historic race files.
- Enforce user ownership in the database with Row Level Security (RLS), not only in application code.

## Identity

The canonical user identity is `auth.users.id` from Supabase Auth (UUID). Email address and Apple relay email, if present, are attributes only and must never be used as ownership keys.

## Proposed tables

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
| `plan` | text | `free` / future paid plan identifiers |
| `status` | text | active/expired/revoked |
| `valid_until` | timestamptz nullable | Paid entitlement expiry if applicable |
| `free_races_used` | integer | Server-maintained counter, max free allowance = 3 |
| `updated_at` | timestamptz | Server generated |

The client must never be authoritative for licence state or free-race counters.

## Free analysis rule

TackWise Analysis Free allows the first **three successfully accepted cloud races** for an account to be synchronized and analysed without a paid entitlement.

The server must make this decision atomically to prevent parallel requests from exceeding the free allowance. A failed/corrupt upload should not consume a free race unless a product decision explicitly changes this rule.

After free entitlement is exhausted:
- the iPhone may continue recording locally,
- additional cloud upload/analysis is rejected unless a valid paid entitlement exists,
- once entitlement becomes active, locally retained races may be synchronized.

## RLS baseline

RLS must be enabled on all user-owned tables.

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

## Service-role boundary

The Supabase service-role key must never be present in the iPhone app, browser bundle, GitHub repository or client-visible configuration. Only trusted server-side code may use it.

Server-side use of service role bypasses RLS, so every such operation must explicitly verify the authenticated user's ownership/entitlement before accessing user data.

## Indexes

At minimum plan indexes for:
- `races(user_id, started_at desc)`
- `analysis_runs(race_id, analysis_version)`
- `analysis_runs(user_id, created_at desc)`

## Deletion

Deleting a race must remove:
1. analysis results/objects,
2. raw R2 race object,
3. related PostgreSQL rows.

Deleting an account must enumerate and delete all user-owned cloud races/objects before or as part of account removal, subject only to documented legal retention.

## Open decisions before implementation

- Exact paid billing provider and entitlement source.
- Whether boats/courses are normalized tables or immutable snapshots embedded in race metadata.
- Exact metadata that belongs in PostgreSQL versus derived analysis output.
- Exact account-deletion grace period.
