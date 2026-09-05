# Threat Model

**Status:** Initial stub.

## Assets

- user identity/session,
- GPS and race telemetry,
- race metadata and analysis results,
- licences/entitlements,
- API and service credentials.

## Trust boundaries

- iPhone app to cloud API,
- browser to cloud API,
- Apple identity provider to Supabase Auth,
- API/Workers to Supabase,
- API/Workers to R2.

## Initial threats to consider

- account/session theft,
- IDOR/broken object-level authorization,
- unauthorized R2 access,
- token leakage through logs or client bundles,
- injection or malformed input,
- dependency compromise,
- denial of service/cost abuse,
- accidental over-collection or disclosure of location data.

Update this file whenever new trust boundaries, public endpoints or sensitive data flows are introduced.
