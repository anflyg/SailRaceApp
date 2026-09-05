# Personal Data Inventory

**Status:** Living baseline. Update before collecting new categories of personal data.

| Data | Purpose | Planned location | Retention / notes |
| --- | --- | --- | --- |
| Supabase user UUID | Account ownership and authorization | Supabase | Canonical internal identity; retained while account exists |
| Apple auth identifiers/session data | Authentication | Apple/Supabase | Do not log tokens; avoid duplicating identifiers unnecessarily |
| Apple relay/email address if supplied | Account communication only if needed | Supabase/Auth | Not a storage key or canonical identity |
| GPS/location telemetry | Race recording and post-race analysis | Local iPhone + private Cloudflare R2 | Personal data; private by default; user deletable |
| GPS quality/sensor-source telemetry needed to interpret race data | Analysis/diagnostics | Local iPhone + private R2 | Collect only fields with documented product/diagnostic purpose |
| Race metadata | History, synchronization and analysis | Supabase/PostgreSQL | Linked only through opaque UUID ownership |
| Course/start/mark/wind snapshots recorded for a race | Reproduce and analyse race context | Private R2 and/or structured race metadata | May indirectly reveal location; treat as personal data with race |
| Analysis results | Performance analysis | Supabase/PostgreSQL and/or private R2 | User-owned data; deletable with race |
| Licence/entitlement state | Enforce first-three-free and paid access | Supabase/PostgreSQL | Server controlled; minimize direct billing data |
| Operational logs | Reliability, security and incident investigation | Cloudflare/Supabase/application logs | Avoid GPS payloads, tokens, email and secrets; short justified retention |

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
