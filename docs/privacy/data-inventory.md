# Personal Data Inventory

**Status:** Initial inventory.

| Data | Purpose | Planned location | Notes |
| --- | --- | --- | --- |
| Supabase user UUID | Account ownership | Supabase | Canonical internal identity |
| Apple auth identifiers/session data | Authentication | Apple/Supabase | Do not log tokens |
| Email relay/address if provided by Apple | Account communication if needed | Supabase/Auth | Do not use as storage key |
| GPS/location telemetry | Race recording and analysis | Local iPhone + private R2 | Personal data |
| Race metadata | History and analysis | Supabase/PostgreSQL | Linked to opaque user UUID |
| Analysis results | Performance analysis | Supabase/PostgreSQL or derived storage | User-owned data |
| Licence state | Entitlement | Supabase/PostgreSQL | Minimise billing data held directly |

Update the inventory before collecting new categories of personal data.
