# Data Retention Policy

**Status:** Initial operational design policy. Exact public/legal wording must be finalized before commercial launch.

## Principles

- Do not retain personal data without a product, contractual, security or legal reason.
- Race history is part of the product value for active users and may be retained while the account remains active.
- Users must be able to delete individual cloud races.
- Account deletion must remove user-owned cloud data within a defined operational period, except data that must legally be retained.
- Backup expiry/deletion behaviour must be documented before production use.
- Logs should have short, justified retention and should avoid location data, tokens and secrets.

## Proposed baseline

### Active account

- Race metadata, raw telemetry and analysis results: retained until the user deletes the race/account or another documented product rule applies.
- Entitlement data: retained as required to operate the account/licence.

### Prepared but unaccepted race uploads

An upload reservation expires 24 hours after prepare. A scheduled cleanup must remove the expired reservation and any unreferenced private R2 object within a further 24 hours after rechecking that no accepted race references it. Interrupted clients may prepare/upload again from their retained local recording. Upload failure or entitlement rejection never deletes the local race and never consumes the free allowance.

[ADR-004](../architecture/decisions/adr-004-analysis-dispatch-lifecycle-and-cleanup.md) fixes initial beta cleanup at no earlier than `expires_at + 1 hour`, within bounded 15-minute maintenance, at most 25 reservations per invocation and 6 automatic attempts. Normal abandoned-data removal remains targeted within approximately 48 hours of prepare. Verify accepted state, exact identity and cleanup ownership before any object deletion; grace alone does not protect against concurrent finalize/late uploads. Preserve recovery state on provider uncertainty. Exhaustion or a missed target requires a safe operational alert and manual intervention, not unlimited retries or silent permanent retention.

Confirmed orphan recovery leaves a minimal server-only tombstone keyed by race UUID after removing the upload reservation. Because current migration 00012 does not associate that tombstone with durable user ownership, D2 must provide a minimized ownership association before deletion can be enabled; unlinked legacy tombstones fail closed and require reviewed reconciliation. Race UUIDs and ownership associations are pseudonymous personal data. Exclude object keys, hashes, telemetry/GPS, email, credentials, tokens and provider bodies. Follow ADR-006 for retention and removal: only a demonstrated enforceable fencing/non-resurrection mechanism permits tombstone removal; lease absence or operator review alone is insufficient. Cloud race IDs are server-issued UUIDv4 values, and the product owner accepts their astronomically small collision/reissue probability without a permanent global UUID denylist. This does not authorize stale requests to recreate identities or gates. If safety cannot be proven, preserve required integrity protection and leave deletion unresolved; exact bounded retention and safe-removal evidence remain open. Indefinite retention is not approved as the intended steady state.

### Analysis delivery state

Cloudflare Queues/DLQ holds only the minimal pseudonymous race/version envelope for transient delivery; PostgreSQL retains durable work and safe outcomes. Configure and document queue/DLQ and operational-log retention before enablement. Queue expiry must not lose work, and dead-letter contents must not be kept indefinitely as a substitute for durable job state. Analysis runs/results remain user-owned and deletable with the race, including historical versions.

### Individual race deletion

A deletion request should make the race unavailable promptly and trigger deletion of:
- PostgreSQL race metadata,
- analysis rows/results,
- raw R2 object,
- pending upload reservation and any unaccepted R2 object,
- orphan-recovery tombstone, once the ADR-006 safe-removal conditions are implemented and proven,
- derived R2 analysis objects.

Cross-service deletion failures must use finite automatic retries, remain observable, and escalate for manual completion after exhaustion. Preserve durable object references before deleting database rows; `ON DELETE CASCADE` must not destroy the only R2 references as the first cross-store step. [ADR-006](../architecture/decisions/adr-006-cross-store-race-and-account-deletion.md) records the detailed deletion design covering accepted rows, analysis runs, raw/derived R2, reservations/orphans and tombstones. Implementation and a demonstrated path covering these stores are required before beta rollout, including proof that tombstone removal cannot permit delayed inserts or stale/in-flight writes to recreate deleted state.

[ADR-006](../architecture/decisions/adr-006-cross-store-race-and-account-deletion.md) now defines the architecture for this workflow; implementation and the demonstrated deletion drill remain open. Keep deletion lifecycle/recovery state and exact object references only as long as required to complete or safely reconcile deletion. Remove an orphan-recovery tombstone only after all ADR-006 safety conditions are proven; otherwise retain it and do not reuse the UUID. This integrity need does not approve indefinite retention: exact periods, legal exceptions, backup behavior and safe-removal evidence require review before public production use.

### Account deletion

Target operational completion: within 30 days, subject to any separately documented applicable legal-retention exception. Account deletion covers `profiles`, `entitlements`, `entitlement_admin_audit`, Supabase Auth identity and related account state, as well as accepted/pending races and their PostgreSQL/R2 objects. Delete personal profile, entitlement, Auth and race data after preserving and resolving required R2 references; do not let Auth deletion or cascades destroy those references. Operational audit records such as `entitlement_admin_audit` require a minimized, access-restricted and separately justified retention period; delete or further minimize them when it expires, and do not retain broader personal data by association. This 30-day target is a current design choice and must be reviewed before public launch.

### Local unsynchronized races

Local-only iPhone races are under the app/device lifecycle and are not cloud-retained until synchronized. The product should clearly distinguish local data from cloud data when deletion/export functionality is implemented.

### Logs

Operational/security logs should use the shortest practical retention. Logs must not contain raw race tracks, auth tokens or secrets. Opaque user/race IDs may be used where needed for diagnostics and incident investigation.

ADR-004 analysis/maintenance logs use safe operation correlation/phase/category data only and exclude user UUIDs, queue envelopes, R2 keys, digests and provider bodies as well as telemetry and credentials. The older optional identifier allowance does not apply to these workflows.

## Backups

Before production use, document:
- what Supabase/other backups exist on the selected plan,
- backup retention periods,
- whether deleted records may persist temporarily in backups,
- how restore procedures prevent unintentionally resurrecting deleted user data.

## Review triggers

Reassess retention before introducing public sharing, coaching/team access, billing providers, marketing analytics or new categories of personal data.

## Planned analytics and entitlement retention

If product analytics is approved, retain only aggregated or minimized events for the shortest documented period needed to improve reliability and product use; exact periods, deletion, provider backup behavior and privacy-notice disclosure require approval first. Keep current entitlement state only while needed to provide or secure access. Transaction-verification and beta authorization need separate documented necessity and periods; do not retain raw Apple/TestFlight data for convenience. When beta-administration audit evidence is implemented, retain its minimized server-only records only while operationally necessary for entitlement/account lifecycle and security traceability. Review the precise retention schedule, access controls and account-deletion/legal-obligation treatment before wider commercial launch.
