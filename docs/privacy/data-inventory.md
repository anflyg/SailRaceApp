# Personal Data Inventory

**Status:** Living baseline. Update before collecting new categories of personal data.

| Data | Purpose | Planned location | Retention / notes |
| --- | --- | --- | --- |
| Supabase user UUID | Account ownership and authorization | Supabase | Canonical internal identity; retained while account exists |
| Apple auth identifiers/session data | Authentication | Apple/Supabase | Do not log tokens; avoid duplicating identifiers unnecessarily |
| Apple relay/email address if supplied | Account communication only if needed | Supabase/Auth | Not a storage key or canonical identity |
| GPS/location telemetry | Race recording, user-requested synchronization and post-race analysis | Local iPhone + private Cloudflare R2 | Personal data; private by default; accepted data is user deletable; abandoned pre-acceptance objects follow bounded cleanup |
| GPS quality/sensor-source telemetry needed to interpret race data | Analysis/diagnostics | Local iPhone + private R2 | Collect only fields with documented product/diagnostic purpose |
| Race metadata | History, synchronization and analysis | Supabase/PostgreSQL | Linked only through opaque UUID ownership |
| Pending race-upload reservation | Idempotent, secure completion and cleanup of a user-requested sync | Server-only Supabase/PostgreSQL | Owner/race UUID, raw version, compressed digest/size, server-derived object key, minimal race metadata and expiry; remove after acceptance or bounded abandonment cleanup |
| Course/start/mark/wind snapshots recorded for a race | Reproduce and analyse race context | Private R2 and/or structured race metadata | May indirectly reveal location; treat as personal data with race |
| Analysis results | Performance analysis | Supabase/PostgreSQL and/or private R2 | User-owned data; deletable with race |
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
