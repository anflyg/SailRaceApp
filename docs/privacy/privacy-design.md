# Privacy Design

## Privacy-by-design/default rules

- Treat GPS and race location data as personal data.
- Keep race data private by default.
- Use opaque UUIDs for users and races.
- Do not put names or email addresses in object-storage keys.
- Minimize collection of identity information.
- Do not log personal/location data unless needed for a documented diagnostic purpose.
- Provide architecture paths for race deletion, account deletion and data export.
- Avoid public sharing, live tracking, marketing analytics or profiling by default; such features require a new privacy/security assessment.

## Data access

Authentication proves identity; authorization must independently prove that the authenticated user may access a specific race/object.

R2 objects are private and must only be served through an authorized mechanism.
