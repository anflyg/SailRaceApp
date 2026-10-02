# First race upload implementation roadmap

**Status:** Sequenced work following [ADR-003](decisions/adr-003-first-race-upload-and-sync.md) and [ADR-004](decisions/adr-004-analysis-dispatch-lifecycle-and-cleanup.md). Step 6A records accepted architecture; steps 6B–6G remain implementation/evidence work. No implementation is included in this document.

Each PR must include proportionate positive, negative, idempotency, security, and privacy tests. Production migration/deployment remains separately authorized from merging code.

| Order | Repository | PR purpose | Dependency |
| --- | --- | --- | --- |
| 1 | `anflyg/SailRaceApp` | Accept ADR-003 and align architecture/security/privacy documentation | None |
| 2 | `anflyg/tackwise-contracts` | Define raw-race v1 JSON Schema, API v1 upload contracts, safe errors, initial limits, compatibility rules, and valid/hostile fixtures | ADR-003; measured current recordings |
| 3 | `anflyg/tackwise-api` | Add reviewed `race_uploads`/`raw_size_bytes` migration and narrowly scoped, service-role-only atomic acceptance RPC with concurrency/RLS/privilege tests | Contracts PR |
| 4 | `anflyg/tackwise-api` | Add authenticated prepare/finalize application services and endpoints behind fake database/object-store adapters; cover ownership, entitlement, idempotency, lost responses, and sanitized logging | DB/RPC PR |
| 5 | `anflyg/tackwise-api` | Add bounded Worker content PUT, gzip/JSON/schema/hash validation, private R2 integration, immutable-key behavior, and adversarial payload tests | Contracts and API service PRs |
| 6A | `anflyg/SailRaceApp` | Accept ADR-004 and align architecture/security/privacy documentation — this PR | ADR-003 and merged API PR #13 |
| 6B | `anflyg/tackwise-contracts` | Strict analysis input envelope, types, compatibility rules and positive/hostile fixtures; only raceId + analysisVersion | 6A |
| 6C | `anflyg/tackwise-api` | Forward lifecycle migration/RPCs: unique race/version, owner consistency, required version, durable leases/attempts, cleanup coordination and explicit privileges; define the reviewed restriction of internal table visibility | 6A, 6B |
| 6D | `anflyg/tackwise-api` | Bounded abandoned-upload cleanup with finalize/late-PUT concurrency safety, uncertain-delete recovery and temporary fail-closed gate | 6C and R2/finalize implementation |
| 6E | `anflyg/tackwise-api` | Cloudflare Queue dispatch and scheduled reconciliation with PostgreSQL authority, finite retries/DLQ behavior and analysis gate | 6B, 6C, 6D maintenance coordination |
| 6F | `anflyg/tackwise-api` | Separate route-less consumer lifecycle, processing leases, duplicate/stale-worker protection and gated processor boundary; no invented algorithms/results | 6B, 6C, 6E |
| 6G | `anflyg/tackwise-api` with suite evidence in `anflyg/SailRaceApp` | Isolated operational evidence: delivery uncertainty, lease recovery, cleanup/deletion failures, safe logs and measured CPU/memory/R2 behavior | 6D–6F; separately authorized non-production resources |
| 7 | `anflyg/SailRaceApp` | Add stable cloud UUID migration, raw-v1 serializer/gzip/hash artifact, persistent local sync state, token refresh, retry/backoff, and UI status without changing race-critical recording | Contracts and deployed non-production API |
| 8 | `anflyg/TackWiseAnalysis` | Consume stable Worker-only owner-scoped race/status/summary/result APIs; never direct R2 or internal Supabase table access | Strict output contracts, implemented result APIs and reviewed internal-column privilege restriction |
| 9 | `anflyg/tackwise-api` and infrastructure | Run non-production integration/security/load/deletion/cleanup tests, apply reviewed migration, deploy endpoints, verify private R2 and observability, then enable a bounded beta rollout | All implementation PRs |

Do not combine the production migration application, public rollout, and client enablement into an ordinary implementation PR. Each operational step requires explicit target/environment confirmation and rollback/recovery checks.

## Step 6 boundaries and Analysis handoff

The API at merged PR #13 implements upload preparation/content/finalize behind `RACE_UPLOADS_ENABLED`; this is not upload enablement. Preserve migration 00004/keepalive, the heartbeat `0 */4 * * *` and `preview_urls = false`. ADR-004 adds planned maintenance `*/15 * * * *`, a route-less consumer and the separate analysis/cleanup gates. Step 6A adds none of these runtime bindings, schedules or flags.

The ADR is the source for initial beta values: 5-minute dispatch lease, 20-minute processing lease, 6 dispatch attempts, 5 processing attempts, 24-hour reservation lifetime, cleanup at `expires_at + 1 hour`, maximum 25 reservations per invocation and 6 cleanup attempts. Finite retry exhaustion requires durable safe errors and manual intervention; normal abandoned-data cleanup remains targeted within approximately 48 hours of prepare.

After 6G, complete the following before step 8 integration:

1. `anflyg/tackwise-contracts`: define strict, bounded analysis summary/result and client DTO contracts; exact sailing metrics remain a contract/product decision.
2. `anflyg/tackwise-api`: implement analysis processing and authenticated owner-scoped race list, metadata, status and result APIs; review the forward migration restricting internal object/lease/provider fields from direct client table reads.
3. `anflyg/TackWiseAnalysis`: consume those stable APIs only, without object keys, R2 access or service credentials.

The detailed cross-store race/account deletion design and demonstrated deletion path are separate work required before beta rollout. Operational evidence for the consumer lifecycle does not replace measurements of the eventual algorithms/results or authorize enabling an unfinished processor.

## Required release evidence

- Raw/API schema compatibility and representative long-race fixtures.
- Cross-user/RLS/privilege negative tests.
- Exactly-once free-counter concurrency proof.
- R2 private-access, immutable retry, and orphan-recovery tests.
- Analysis uniqueness/owner consistency, current-version-only race transitions, duplicate/missed/unknown dispatch, lease expiry/stale completion and finite retry/DLQ recovery tests.
- Compressed/expanded-size, malformed gzip/JSON, gzip-bomb, sample-count, and hash tests.
- Lost-response, token-refresh, offline queue, restart, and backoff tests on iPhone.
- Cleanup and race/account deletion drills across PostgreSQL and R2.
- Cleanup/finalize/re-prepare/late-content-PUT concurrency proof, uncertain R2 deletion recovery and retention-target monitoring; preserve durable references across partial failures.
- Exact-true gate tests, strict minimal queue envelopes, no browser internal fields, and consumer CPU/memory/R2 measurements before enablement.
- Secret/client-bundle and payload/log-redaction review.
- Migration/deployment record, supported-version assumptions, monitoring, and incident-response readiness.
