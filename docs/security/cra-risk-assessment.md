# CRA Cybersecurity Risk Assessment

**Status:** Living technical risk baseline. CRA applicability, conformity route and final legal obligations must be reassessed before commercial release and as implementing guidance evolves.

## Product scope

TackWise includes:
- TackWise Race on iPhone,
- cloud synchronization/backend services that support the product,
- TackWise Analysis web service,
- future TackWise Watch integration where applicable.

Race-critical operation remains offline-first; cloud availability is not required to execute or record a race.

## Initial security objectives

- only the correct user can access a race,
- raw location telemetry is private by default,
- client compromise must not expose server-wide credentials,
- malformed uploads cannot create unbounded processing/cost,
- supported versions can receive security fixes,
- security-relevant dependencies and trust boundaries remain documented,
- material vulnerabilities/incidents can be assessed and handled through a defined process.

## Key risk areas

| Risk | Initial treatment |
| --- | --- |
| Account/session compromise | Sign in with Apple/Supabase; no custom password storage; token hygiene |
| Broken per-user authorization | RLS plus explicit server-side ownership checks |
| GPS/location disclosure | Private R2, opaque keys, no normal-log telemetry |
| Leaked service credentials | Server-side only, never client/source control, rotate on compromise |
| Vulnerable dependencies | Minimize, pin/update, vulnerability review |
| Malicious/oversized race upload | Auth, size/schema limits, bounded processing, integrity checks |
| Sync/data tampering | Immutable race UUID, SHA-256 metadata, idempotency/version validation |
| Free-tier/cost abuse | Server-authoritative entitlement, atomic counter, rate/resource controls |
| Inability to patch | Maintain supported dependencies and release/update process |
| Cloud outage | Offline-first race functionality limits operational impact |

## Design mitigations already selected

- Sign in with Apple as the only planned end-user authentication method,
- Supabase UUID as canonical identity,
- opaque user/race IDs,
- private Cloudflare R2 objects,
- Supabase RLS for user-owned relational data,
- separation of raw telemetry and structured metadata,
- service-role credentials restricted to trusted server-side code,
- offline-first race execution,
- versioned raw race format and analysis versions,
- incremental security/privacy documentation.

## Security evidence to build incrementally

For material releases maintain evidence for:
- authentication and authorization tests,
- RLS policy tests including cross-user negative tests,
- R2 non-public access checks,
- secret/client-bundle review,
- dependency vulnerability review,
- malformed/oversized upload tests,
- deletion/export behavior,
- incident/vulnerability handling procedure,
- supported-version/update assumptions.

## CRA reporting readiness

The incident-response process must distinguish ordinary defects from security incidents and vulnerabilities that may trigger regulatory reporting obligations. Current reporting contacts, deadlines and competent reporting channels must be verified against current EU/Swedish guidance whenever an actual reportable event is suspected.

## Reassessment triggers

Reassess this risk assessment before:
- public/live sharing,
- team/coach cross-user access,
- payment/billing integration,
- new public APIs,
- new sensitive/personal-data categories,
- major authentication/storage migration,
- commercial production release,
- substantial product modification affecting established security assumptions.
