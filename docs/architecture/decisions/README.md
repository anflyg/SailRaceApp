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

When a decision changes, document why and what migration/consequences are required rather than silently changing implementation.
