# First race upload implementation roadmap

**Status:** Planned work following [ADR-003](decisions/adr-003-first-race-upload-and-sync.md). No implementation is included in this document.

Each PR must include proportionate positive, negative, idempotency, security, and privacy tests. Production migration/deployment remains separately authorized from merging code.

| Order | Repository | PR purpose | Dependency | Suggested model | Reasoning |
| --- | --- | --- | --- | --- | --- |
| 1 | `anflyg/SailRaceApp` | Accept ADR-003 and align architecture/security/privacy documentation | None | Terra | High |
| 2 | `anflyg/tackwise-contracts` | Define raw-race v1 JSON Schema, API v1 upload contracts, safe errors, initial limits, compatibility rules, and valid/hostile fixtures | ADR-003; measured current recordings | Terra | High |
| 3 | `anflyg/tackwise-api` | Add reviewed `race_uploads`/`raw_size_bytes` migration and narrowly scoped, service-role-only atomic acceptance RPC with concurrency/RLS/privilege tests | Contracts PR | Sun | High |
| 4 | `anflyg/tackwise-api` | Add authenticated prepare/finalize application services and endpoints behind fake database/object-store adapters; cover ownership, entitlement, idempotency, lost responses, and sanitized logging | DB/RPC PR | Sun | High |
| 5 | `anflyg/tackwise-api` | Add bounded Worker content PUT, gzip/JSON/schema/hash validation, private R2 integration, immutable-key behavior, and adversarial payload tests | Contracts and API service PRs | Sun | High |
| 6 | `anflyg/tackwise-api` | Add scheduled abandoned-upload cleanup plus accepted-race analysis dispatch/reconciliation and operational evidence | R2/finalize PR | Sun | High |
| 7 | `anflyg/SailRaceApp` | Add stable cloud UUID migration, raw-v1 serializer/gzip/hash artifact, persistent local sync state, token refresh, retry/backoff, and UI status without changing race-critical recording | Contracts and deployed non-production API | Sun | High |
| 8 | `anflyg/TackWiseAnalysis` | Add authenticated accepted-race/result consumption only when analysis output contracts exist; never direct R2 access | Analysis handoff/contracts | Terra | Medium |
| 9 | `anflyg/tackwise-api` and infrastructure | Run non-production integration/security/load/deletion/cleanup tests, apply reviewed migration, deploy endpoints, verify private R2 and observability, then enable a bounded beta rollout | All implementation PRs | Terra | High |

Do not combine the production migration application, public rollout, and client enablement into an ordinary implementation PR. Each operational step requires explicit target/environment confirmation and rollback/recovery checks.

## Required release evidence

- Raw/API schema compatibility and representative long-race fixtures.
- Cross-user/RLS/privilege negative tests.
- Exactly-once free-counter concurrency proof.
- R2 private-access, immutable retry, and orphan-recovery tests.
- Compressed/expanded-size, malformed gzip/JSON, gzip-bomb, sample-count, and hash tests.
- Lost-response, token-refresh, offline queue, restart, and backoff tests on iPhone.
- Cleanup and race/account deletion drills across PostgreSQL and R2.
- Secret/client-bundle and payload/log-redaction review.
- Migration/deployment record, supported-version assumptions, monitoring, and incident-response readiness.
