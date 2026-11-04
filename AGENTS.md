# TackWise / SailRaceApp Development Rules

## Source of truth

The current documentation under `docs/` is authoritative for product, architecture, security and privacy decisions. Historical concept documents may be retained for reference but must not override current repository documentation.

Before implementing a change, read the relevant files under `docs/product`, `docs/architecture`, `docs/security` and `docs/privacy`.

For changes affecting ADR-007, R2, Cloudflare Workers/Queues, deletion/recovery or their permissions, consult `docs/security/adr-007-verification-register.md` before proposing repeated checks. Revalidate affected control IDs only. Record new evidence in the same PR for this repository or a linked SailRaceApp documentation PR for other repositories. The register is not authorization for production deletion.

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

## Local Git / Codex / Xcode workflow

These rules apply to Codex, other agents, human handoffs and native builds. GitHub `origin/main` is the baseline for *merged* code; a local checkout, a PR branch, TestFlight and an Xcode build are distinct versions until explicitly synchronized and verified.

- **One task, one owned worktree:** Use a dedicated feature branch and preferably a Git worktree for parallel Codex tasks. Do not let VS Code, Codex sessions and Xcode mutate the same checkout concurrently. Reuse one explicit checkout for each native test; do not create or assume additional local clones.
- **Preflight before mutations:** Identify and report the absolute repository root, current branch, `HEAD`, `origin/main` base and `git status` including untracked files. Check for an active merge, rebase or cherry-pick. Before switching branches, merging/rebasing, running a destructive generator or Capacitor sync, assess whether local/native changes could be overwritten. A Git fetch alone does not update local code.
- **No surprise Git surgery:** Never merge, rebase, reset, clean, discard, force-push or stash the user's active/dirty worktree without explicit authorization for that exact operation. If a Git operation is already in progress, finish or safely resolve it first; do not stack a new one. Preserve independent local native edits and untracked files. A clean dedicated agent worktree may be updated as part of an explicitly scoped task.
- **Base freshness at handoff:** Before opening or handing off a PR, compare its merge base and current `origin/main`. Prefer starting from current main. If main has advanced, report the divergence and propose a safe integration path; never silently hand over stale UI assets or auto-merge into an occupied worktree. State the actual branch/commit being built and what changes are and are not included.
- **One native project path:** Xcode must open `ios/App/App.xcodeproj` in the *same worktree* from which `npm ci`, the web build and `npx cap sync ios` run. Verify the path before native testing. Inspect any local Xcode edits before sync; generated `Package.swift` and build assets can change. SwiftPM resolved files and downloaded binaries require native validation, not assumptions from npm tests.
- **Evidence before merge:** For native or plugin/lifecycle changes, keep the PR as draft until a real Xcode simulator **Build and Run** has succeeded, or clearly document the missing validation and obtain explicit release-owner approval for any exceptional path. Test on an actual device when hardware-backed Apple authentication, GPS, motion or recording behavior is in scope. Never claim native success based solely on TypeScript tests or `cap sync`.
- **Stage only intended files:** Inspect the full diff and staged paths, including untracked files, before commit/push/PR. Do not bulk-stage a worktree containing private keys, copied native configs, provisioning profiles or other local secrets. Keep credentials outside repositories where possible; ignore patterns are defense in depth, not proof of safety. Never commit identifying race/GPS data, tokens, certificates or Apple private keys.
- **Concise handoff:** State repository/worktree path, branch, base/head commits, PR, validation performed versus pending, local modifications, and the exact next safe action. Keep unrelated changes out of the PR. If a new team workflow or architecture rule is agreed, document it here or in the appropriate current repository, not only in chat.
