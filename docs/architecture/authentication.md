# Authentication

## Decision

**Sign in with Apple is the only planned end-user authentication method for TackWise.**

Traditional username/password accounts are not to be implemented unless this architecture decision is explicitly revisited.

## Identity model

Apple establishes the user's identity. Supabase Auth manages the application session and maps the authenticated user to an opaque Supabase user UUID.

The Supabase UUID, not email address or name, is the canonical internal identity.

Apple Hide My Email must be supported without special dependence on the user's actual email address.

## Cross-product use

The same TackWise account is intended to identify a user in TackWise Race and TackWise Analysis. Watch identity handling depends on its final connectivity model.

## Security principles

- Do not log identity tokens or secrets.
- Enforce authorization independently of authentication.
- Never infer ownership from email address.
- Keep Apple/Supabase configuration and secrets outside source control.
