# TackWise Product Suite

**TackWise - Race smarter.**

## Purpose

TackWise is a sailing race support and analysis platform that helps sailors prepare for a race, execute the start and race, record sailing data and improve through post-race analysis.

The suite consists of:
- **TackWise Race** - iPhone app used before and during racing.
- **TackWise Watch** - sailing-focused watch/companion device.
- **TackWise Analysis** - web-based post-race analysis.
- **TackWise Cloud** - shared identity, sync and storage infrastructure.

## Core product principles

### Offline-first racing

Race-critical functions must work without Internet access. Cloud services are for sync, backup, history, analysis and licensing, not for executing a race.

### Clear separation of responsibilities

Race and Watch are optimized for fast, high-contrast use while sailing. Analysis is optimized for detailed post-race investigation on a larger screen.

### Shared identity

End users authenticate with **Sign in with Apple**. Traditional password accounts are not planned. The same TackWise identity is used across Race and Analysis, with an opaque Supabase user UUID as internal identity.

### Security and privacy by design

TackWise follows security-by-design and privacy-by-design/default. GPS and race location data are treated as personal data. CRA and GDPR evidence is built incrementally as the product evolves.

## Commercial model for Analysis

TackWise Analysis Free provides normal analysis for the **first three races** for an account. Additional cloud analysis requires an active licence. Races may continue to be recorded locally in TackWise Race without a licence and may be synchronized later after licensing.

## Product relationship

```text
                    TACKWISE
                 Race smarter.
                      |
        +-------------+-------------+
        |             |             |
        v             v             v
  TackWise Race  TackWise Watch  TackWise Analysis
     iPhone       watch/device         Web
        |             |             |
        +-------------+-------------+
                      |
                 TackWise Cloud
```

Detailed requirements are maintained in the individual product documents. This file defines the high-level product boundaries.
