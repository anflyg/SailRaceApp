# TackWise / SailRaceApp Development Rules

## Source of truth

The current documentation under `docs/` is authoritative for product, architecture, security and privacy decisions. Historical concept documents may be retained for reference but must not override current repository documentation.

Before implementing a change, read the relevant files under `docs/product`, `docs/architecture`, `docs/security` and `docs/privacy`.

## Security and privacy

TackWise is developed using security-by-design and privacy-by-design/default principles.

Mandatory rules:
- Treat race GPS/location data as personal data.
- Never use email addresses or personal names as storage keys.
- Use opaque UUIDs for users and races.
- Enforce strict per-user authorization for all user-owned data.
- Never expose raw race objects in R2 publicly.
- Never log auth tokens, secrets or personal/location data unnecessarily.
- Minimize stored personal data.
- All user-owned cloud data must be deletable.
- Keep external dependencies to the minimum reasonably required.
- Flag security-, CRA- or GDPR-relevant architectural changes before implementing them.
- Build CRA/GDPR compliance evidence incrementally during development.

## Authentication

- Sign in with Apple is the only planned end-user authentication method.
- Do not implement traditional password accounts.
- Do not use email as canonical identity.
- Supabase user UUID is the internal TackWise identity.
- Support Apple Hide My Email without relying on the actual email address.

## Architecture

- Race-critical iPhone functionality is offline-first.
- Cloud availability must not be required during a race.
- Raw race telemetry belongs in Cloudflare R2.
- Structured metadata belongs in Supabase/PostgreSQL.
- Cloudflare provides DNS, Pages, Workers and R2.
- Early-stage infrastructure target: USD 0-10/month where practical without weakening security or maintainability.

## Change discipline

Before a security-sensitive or architecture-changing implementation:
1. Explain the proposed change.
2. Identify security and privacy implications.
3. Identify CRA/GDPR implications.
4. Preserve established design decisions unless the task explicitly changes them.
