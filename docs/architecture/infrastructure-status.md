# TackWise Infrastructure Status

**Status:** Current setup baseline, 2026-09-05.

## Domain and DNS

- Primary domain: `tackwise.se`.
- Registrar: STRATO.
- DNS provider: Cloudflare Free.
- Assigned Cloudflare nameservers:
  - `arch.ns.cloudflare.com`
  - `zelda.ns.cloudflare.com`
- Nameserver propagation is in progress. Do not enable Cloudflare DNSSEC until Cloudflare reports the zone as Active and the registrar-side DS configuration is understood.

## Cloudflare

Planned responsibilities:
- authoritative DNS,
- `analysis.tackwise.se` web delivery,
- `api.tackwise.se` API/Workers,
- private R2 object storage for raw race telemetry.

Early-stage cost target remains USD 0-10/month where practical without weakening security or maintainability.

## Supabase

- Project: Tackwise.
- Plan: Free.
- Region: West EU (Ireland).
- Compute: Nano.
- Intended responsibilities: Sign in with Apple integration, Supabase Auth sessions, PostgreSQL metadata, licence/entitlement state and analysis metadata/results.

## Apple

- Existing personal Apple Developer account is already used for the TackWise Race beta/TestFlight app.
- Do not migrate or replace the existing Apple setup solely for cloud work.
- Sign in with Apple is the only planned end-user authentication method.
- Web authentication will use a Services ID associated with the existing app identity when `analysis.tackwise.se` is ready.

## Not yet configured

- `analysis.tackwise.se` deployment.
- `api.tackwise.se` Worker/API.
- R2 production bucket.
- Supabase database schema/RLS policies.
- Apple Services ID and web callback configuration.
- Cloudflare DNSSEC after zone activation.
