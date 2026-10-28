# Personal Data Inventory

**Status:** Living baseline. Update before collecting new categories of personal data.

| Data | Purpose | Planned location | Retention / notes |
| --- | --- | --- | --- |
| Supabase user UUID | Account ownership and authorization | Supabase | Canonical internal identity; retained while account exists |
| Account admission gate | Prevent new cloud work after account closure and reject stale authenticated requests | Server-only Supabase/PostgreSQL | Account UUID and open/closed state are pseudonymous personal/operational data; no client access; retain only while needed for admission/deletion safety and remove only after safe recovery/retention review |
| Apple auth identifiers/session data | Authentication | Apple/Supabase | Do not log tokens; avoid duplicating identifiers unnecessarily |
| Apple relay/email address if supplied | Account communication only if needed | Supabase/Auth | Not a storage key or canonical identity |
| GPS/location telemetry | Race recording, user-requested synchronization and post-race analysis | Local iPhone + private Cloudflare R2 | Personal data; private by default; accepted data is user deletable; abandoned pre-acceptance objects follow bounded cleanup |
| GPS quality/sensor-source telemetry needed to interpret race data | Analysis/diagnostics | Local iPhone + private R2 | Collect only fields with documented product/diagnostic purpose |
| Race metadata | History, synchronization and analysis | Supabase/PostgreSQL | Linked only through opaque UUID ownership |
| Pending race-upload reservation | Idempotent, secure completion and cleanup of a user-requested sync | Server-only Supabase/PostgreSQL | Owner/race UUID, raw version, compressed digest/size, server-derived object key, minimal race metadata and expiry; remove after acceptance or bounded abandonment cleanup |
| Current synthetic test selection | Resume the explicitly selected fictional test across app restarts | Existing app-private iOS Library journal | Opaque local test UUID, owner UUID and format version only; no token, provider payload or GPS. Earlier attempts retain their checkpoints and immutable artifacts for existing recovery handling; selecting another test does not delete or reset them. |
| Cloud race creation intent/mapping (required by ADR-003; not implemented) | Idempotently issue a cloud race UUID for an existing local race | Server-only Supabase/PostgreSQL | Pseudonymous account/local/cloud identifiers and minimal creation state may be needed; exact fields, idempotency expiry, old-client handling, restore behavior and retention remain open and require minimization before implementation |
| Orphan-recovery tombstone | Prevent acceptance of a recovered orphan race UUID after its reservation is removed | Server-only Supabase/PostgreSQL | Race UUID is pseudonymous personal data; retain only minimal integrity/audit category, timestamps and a minimized durable ownership association until safe deletion, with no object key, digest, telemetry, GPS, email, credentials, tokens or provider bodies; unlinked legacy tombstones fail closed and require reviewed reconciliation; follow ADR-006 safe-removal conditions |
| Race/account deletion lifecycle and recovery state | Retryable deletion across PostgreSQL and private R2; prevent resurrection and preserve safe recovery | Server-only Supabase/PostgreSQL and trusted operational tooling | Minimal owner/race linkage, state, bounded attempts/timings/categories, and exact object references only while required to delete/reconcile; treat UUIDs/references as pseudonymous personal/operational data; remove references and state when safe under ADR-006 and the reviewed retention schedule; no indefinite retention is approved |
| Course/start/mark/wind snapshots recorded for a race | Reproduce and analyse race context | Private R2 and/or structured race metadata | May indirectly reveal location; treat as personal data with race |
| Analysis results | Performance analysis | Supabase/PostgreSQL and/or private R2 | User-owned data; deletable with race |
| Analysis delivery envelope and lifecycle state (ADR-004; implementation deferred) | Reliable processing of accepted races and recovery of missed/duplicate delivery | Minimal race UUID + analysis version in transient Cloudflare Queues/DLQ; durable runs/leases/finite attempts in server-controlled PostgreSQL | Pseudonymous data; no user UUID, telemetry, object keys or credentials in messages; exact queue/log retention configured before enablement; runs/results deleted with race/account |
| Licence/entitlement state | Enforce free, App Store and beta access | Supabase/PostgreSQL | Server-controlled product plan, access source, status/expiry and counter; minimize billing/beta data |
| Beta-entitlement administration audit evidence (when implemented) | Security traceability for operator beta grants/revocations | Server-only Supabase/PostgreSQL | Opaque event/user UUIDs, action, timestamp, relevant grant expiry and approved authority identifier only; no email, Apple/TestFlight identity, tokens, secrets or race data; retention requires review before wider launch |
| Operational logs | Reliability, security and incident investigation | Cloudflare/Supabase/application logs | Avoid GPS payloads, tokens, email and secrets; short justified retention |
| Minimized product analytics (if approved) | Improve reliability and usability | Separate, provider undecided | App version, feature use, operation outcome, safe error category and bounded duration/performance only; never raw race/GPS data |

## Data not required by default

TackWise should not collect by default:
- a real name,
- postal address,
- phone number,
- contacts,
- precise location outside race recording,
- advertising identifiers,
- marketing profiles,
- publicly shared race tracks.

Any new category requires an update to this inventory and a privacy/security assessment before implementation.

## Data ownership keys

Names and email addresses must never be used as object keys or authorization identifiers. User/race ownership is based on opaque Supabase/UUID identifiers.

## Analytics boundary and prerequisites

Product analytics is a separate processing activity, not a secondary use of the private race-analysis dataset. It must not include raw GPS coordinates, raw race payloads, race tracks, Apple identifiers, email, auth tokens, secrets, or a persistent advertising identifier. Before collection, document the exact event schema, provider/processor and transfers, lawful basis and any consent requirement, retention/deletion, access controls, and public privacy-notice update. Analytics involving profiling, marketing, cross-service/device tracking, advertising identifiers, or race/location reuse requires separate approval.

## First race sync minimization

The first raw cloud format contains only fields required to reproduce and analyze the recorded race. It excludes local display names, email, Apple/TestFlight identity, advertising/device identifiers, contacts, unrelated sensor data, and product analytics. App/build or sensor-source fields require a documented interpretation/compatibility purpose. The API logs only opaque IDs, phase, bounded size/version/timing, status, and safe error category; it never logs the payload or exact locations.

[ADR-004](../architecture/decisions/adr-004-analysis-dispatch-lifecycle-and-cleanup.md) further restricts analysis/maintenance logs to safe operation correlation/phase/category data and bounded operational counts/timings/status, excluding user UUIDs, queue envelopes, R2 keys, digests and provider bodies. Client summaries must be bounded and schema-validated without GPS sample streams, raw tracks or internal references; detailed results remain private and owner-authorized through Worker APIs.

## M2 client implementation boundary

The mock-backed client adds private local sync checkpoints (local/owner/cloud ID,
intent/expiry until mapped, artifact reference/digest/size, safe phase/retry/error
and acceptance receipt) and a separate immutable gzip retry artifact. Native files
use app-private persistent Library; browser synthetic tests use IndexedDB.
Bearer/refresh tokens are never persisted by this layer. Existing local recordings
are unchanged, and real GPS/account synchronization remains disabled. Local
artifact removal does not delete cloud data or remove a known accepted receipt.
Device backup/file protection and the real user-facing retention/deletion/export
policy must be verified before activation; no new indefinite retention is approved.
See [M2 boundaries and evidence](../architecture/m2-iphone-cloud-sync.md).

## M2 native authentication implementation

The app adds one device-only, nonsynchronizing Keychain session item: Supabase
UUID/access token/refresh token/expiry, project origin and opaque Apple credential
identifier (revocation checks only). Apple ID token/raw nonce/state exist only for
the active sign-in, not in persistence. No name/email scopes are requested;
returned profile fields are ignored. UserDefaults stores only non-secret
installation/logout-pending booleans. Logout replaces tokens with a signed-out
revision; local races/artifacts/receipts remain owner-bound and unchanged. First
auth access after reinstall purges orphaned Keychain tokens. No new cloud race
processing is activated. See [auth design and device prerequisites](../architecture/authentication.md).
