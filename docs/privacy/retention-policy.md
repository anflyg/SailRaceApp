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

Confirmed orphan recovery leaves a minimal server-only tombstone keyed by the race UUID after removing the upload reservation. This UUID is pseudonymous personal data. The tombstone prevents a delayed or concurrent privileged insert from accepting a race whose object was proven absent or deleted. Retain only the integrity outcome and minimal audit fields; exclude object keys, hashes, telemetry/GPS, email, credentials, tokens and provider bodies. Retention must be justified by this integrity need, and indefinite retention is not approved. The cross-store race/account deletion design must specify when and how tombstones can be safely removed without permitting delayed inserts or stale/in-flight writes to resurrect the race. No UUID reuse is allowed while its tombstone exists; a reuse policy requires separate review.

### Analysis delivery state

Cloudflare Queues/DLQ holds only the minimal pseudonymous race/version envelope for transient delivery; PostgreSQL retains durable work and safe outcomes. Configure and document queue/DLQ and operational-log retention before enablement. Queue expiry must not lose work, and dead-letter contents must not be kept indefinitely as a substitute for durable job state. Analysis runs/results remain user-owned and deletable with the race, including historical versions.

### Individual race deletion

A deletion request should make the race unavailable promptly and trigger deletion of:
- PostgreSQL race metadata,
- analysis rows/results,
- raw R2 object,
- pending upload reservation and any unaccepted R2 object,
- orphan-recovery tombstone, once the cross-store deletion design establishes safe removal conditions,
- derived R2 analysis objects.

Cross-service deletion failures must use finite automatic retries, remain observable, and escalate for manual completion after exhaustion. Preserve durable object references before deleting database rows; `ON DELETE CASCADE` must not destroy the only R2 references as the first cross-store step. A separate detailed deletion design and demonstrated path covering accepted rows, analysis runs, raw/derived R2, reservations/orphans and tombstones are required before beta rollout. It must define the tombstone removal point so delayed race inserts and stale/in-flight writes cannot recreate deleted state.

### Account deletion

Target operational completion: within 30 days, subject to any data that must legally be retained. Account deletion must enumerate accepted and pending race objects/reservations before identity removal. This 30-day target is a current design choice and must be reviewed before public launch.

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
