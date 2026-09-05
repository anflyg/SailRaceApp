# GDPR Processing Record

**Status:** Initial engineering record; legal bases and final controller details require review before commercial launch.

## Core processing activities

### Account/authentication
Purpose: identify the user across TackWise services.
Data: Apple/Supabase identity data and opaque UUID.
Processors/providers: Apple, Supabase.

### Race synchronization and storage
Purpose: sync, backup, history and analysis requested by the user.
Data: race metadata and GPS/location telemetry.
Providers: Supabase, Cloudflare.

### Analysis
Purpose: calculate and present race-performance insights.
Data: race telemetry, course metadata and derived results.

## Principles

- Collect only what is required for defined product purposes.
- Document lawful basis, retention and data transfers before production use.
- Maintain appropriate processor agreements/configuration with service providers.
- Reassess when adding analytics, marketing, sharing or social functionality.
