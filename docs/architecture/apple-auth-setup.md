# Sign in with Apple Setup Plan

**Status:** Preparation checklist. Do not change the working TestFlight setup merely to complete cloud configuration.

## Existing state

- TackWise Race already uses an existing personal Apple Developer account for beta/TestFlight distribution.
- The existing app identity/Bundle ID is the parent identity for future Sign in with Apple configuration.
- `analysis.tackwise.se` is the intended web analysis endpoint.
- Supabase Auth will broker TackWise sessions and map Apple identity to the canonical Supabase user UUID.

## Design decision

Sign in with Apple is the only planned end-user authentication method.

Do not add password accounts as a fallback merely for web convenience.

## Preparation steps

Before implementation, record the existing TackWise Race:
- Bundle ID,
- App ID / Identifier,
- Apple Developer Team ID.

These identifiers are configuration data, but secrets/keys generated later must not be committed to Git.

## Apple Developer configuration when domain is ready

1. Confirm Sign in with Apple capability is enabled for the TackWise Race App ID.
2. Create a Services ID for TackWise Analysis web authentication.
3. Associate the Services ID with the TackWise Race primary App ID.
4. Configure the web domain and return URL required by the Supabase Apple OAuth integration.
5. Create the minimum required Apple signing/key material for the OAuth client secret flow.
6. Store key material only in the relevant secret manager/service configuration, never in source control or client bundles.

Exact callback URLs must be taken from the active Supabase project configuration rather than guessed in advance.

## Supabase configuration

When Apple-side configuration is ready:
1. enable Apple provider in Supabase Auth,
2. enter the Apple Services ID/client identifier and required secret material,
3. configure permitted site/redirect URLs for TackWise Analysis,
4. test both normal Apple email sharing and Hide My Email,
5. verify repeated login maps to the same Supabase user UUID,
6. verify logout/session expiry behavior,
7. verify the iPhone and web experience resolve to the same TackWise identity model.

## Security tests before production

- No Apple private key/client secret in browser or iPhone JavaScript bundle.
- OAuth state/nonce validation handled by supported Apple/Supabase flow.
- Redirect URLs restricted to intended TackWise domains/environments.
- Session tokens never written to application logs.
- Authorization/RLS tested separately from successful authentication.
- Account deletion flow includes cloud data deletion and Apple/Supabase identity handling.

## Environment separation

Do not reuse production callback URLs or secrets for untrusted preview deployments. If development/staging auth is introduced, document its own allowed return URLs and key handling.

## Future organisation migration

A later conversion of the Apple Developer membership from Individual to Organization may be considered before commercial launch. It is not a prerequisite for the current architecture and must not break the established App ID/Sign in with Apple relationship.
