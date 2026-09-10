# Release 16 — Internal Playbook Change Broadcast Summary

## What Changed

- Added an internal-only **What’s New** Playbook page with full-text client-side search, room and urgency filters, unread filtering, explicit read state, and clear cards for:
  - what changed;
  - why it matters;
  - effective date;
  - required action and due date;
  - source doctrine and exact revision.
- Added a **New Since Your Last Visit** section to My Playbook for unread, targeted updates.
- Added a revision-level authoring panel for Leadership and Playbook room leads. An update can target all Team Members with room access, one staff role, or one Team Member.
- Added urgent/important/standard priority, effective dates, optional action language, and optional required-reading conversion.
- Reused Playbook reading assignments and revision-specific acknowledgements for required updates; read-state remains discovery-only and is explicitly not treated as consent.
- Added internal notifications for eligible recipients.
- Added server-side room-access and audience filtering. Member, guest/signature-recipient, and Client Partner identities cannot enter the route or call its APIs.
- Added human-gated candidate migration 205 for immutable broadcasts and per-Team-Member read state. Its service-role-only publication function atomically creates the update, required-reading assignments, and notifications.
- Added graceful schema-off UI and API responses while candidate 205 remains unapplied.

## Validation Run

- `npm test -- --runInBand lib/playbook/change-broadcasts.test.ts lib/playbook/my-workspace.test.ts __tests__/migration-205-playbook-updates.test.ts` — passed, 3 suites / 11 tests.
- `npm run typecheck` — passed.
- Targeted ESLint over all Release 16 TypeScript and TSX files — passed with zero warnings.
- `npm test -- --runInBand` — passed, 545 suites / 6,365 tests.
- `npm run build` — passed; Next.js compiled and generated all 134 static pages, including `/admin/playbook/updates` and both update API routes.
- `git diff --check` — passed.
- React best-practices review — no blocking hook, accessibility, serialization, or rendering issues found.

## Remaining Risks / Follow-ups

- Candidate migration 205 was not moved into `supabase/migrations` and was not applied. Production remains intentionally unchanged until migrations 200–205 are reconciled and the owner explicitly approves the sequence.
- No commit, push, or deployment was performed.
- Update cards link to the currently published doctrine while clearly preserving the source revision number. Exact historical content remains available through the existing publication-history and revision-comparison system.
