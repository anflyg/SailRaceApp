# Architecture and Design Decisions

Use this directory for durable decisions that constrain future implementation.

Accepted decisions currently include:
- race-critical operation is offline-first,
- Sign in with Apple only for end-user authentication,
- Supabase UUID as canonical internal user identity,
- Supabase/PostgreSQL for structured metadata,
- Cloudflare R2 for raw race telemetry,
- Cloudflare for DNS/Pages/Workers,
- security-by-design and privacy-by-design/default,
- early cloud cost target of approximately USD 0-10/month.
- privacy-minimized product analytics separated from private race data,
- Apple StoreKit/App Store In-App Purchase as the preferred initial consumer billing path,
- server-controlled beta entitlement rather than client-reported TestFlight status.
- operator-only, audited and narrowly scoped beta entitlement administration.
- authenticated Worker-mediated prepare/upload/finalize race sync with PostgreSQL-authoritative acceptance and exactly-once free-race accounting.
- [ADR-004: Analysis dispatch, lifecycle, reconciliation and abandoned-upload cleanup](adr-004-analysis-dispatch-lifecycle-and-cleanup.md): Cloudflare Queues with PostgreSQL-authoritative work, versioned analysis, Worker-only owner APIs, bounded retries and safe cleanup; implementation deferred.
- [ADR-005: Analysis result v1 identity and storage](adr-005-analysis-result-v1-identity-and-storage.md): bounded summary, deterministic canonical result bytes and private immutable R2 identity; implementation deferred.

When a decision changes, document why and what migration/consequences are required rather than silently changing implementation.
