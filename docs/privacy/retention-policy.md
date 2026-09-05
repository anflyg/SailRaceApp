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

### Individual race deletion

A deletion request should make the race unavailable promptly and trigger deletion of:
- PostgreSQL race metadata,
- analysis rows/results,
- raw R2 object,
- derived R2 analysis objects.

Cross-service deletion failures must be retried and observable.

### Account deletion

Target operational completion: within 30 days, subject to any data that must legally be retained. This 30-day target is a current design choice and must be reviewed before public launch.

### Local unsynchronized races

Local-only iPhone races are under the app/device lifecycle and are not cloud-retained until synchronized. The product should clearly distinguish local data from cloud data when deletion/export functionality is implemented.

### Logs

Operational/security logs should use the shortest practical retention. Logs must not contain raw race tracks, auth tokens or secrets. Opaque user/race IDs may be used where needed for diagnostics and incident investigation.

## Backups

Before production use, document:
- what Supabase/other backups exist on the selected plan,
- backup retention periods,
- whether deleted records may persist temporarily in backups,
- how restore procedures prevent unintentionally resurrecting deleted user data.

## Review triggers

Reassess retention before introducing public sharing, coaching/team access, billing providers, marketing analytics or new categories of personal data.
