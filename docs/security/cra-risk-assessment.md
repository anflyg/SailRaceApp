# CRA Cybersecurity Risk Assessment

**Status:** Initial living document.

## Product scope

TackWise includes an iPhone racing application, associated cloud synchronization/backend and a web analysis service. Applicability and conformity obligations must be reassessed before commercial release and as CRA implementation guidance evolves.

## Initial risk areas

- account/session compromise,
- broken per-user authorization exposing another sailor's data,
- exposure of GPS/location data,
- leaked API keys/tokens/secrets,
- insecure public object storage,
- vulnerable third-party dependencies,
- malicious or malformed uploaded race files,
- tampering with analysis or sync data,
- insufficient update/vulnerability handling.

## Design mitigations already selected

- Sign in with Apple rather than custom password storage,
- opaque internal UUIDs,
- private R2 objects,
- separation of raw telemetry and structured metadata,
- offline-first race function so cloud availability is not race-critical,
- incremental dependency and security review.

## To maintain

For material releases, update assets, threats, risk rating, mitigations, residual risks, support/update assumptions and evidence/tests.
