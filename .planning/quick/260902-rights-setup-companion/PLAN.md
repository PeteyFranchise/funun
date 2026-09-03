# Rights Setup Companion

## Objective

Turn the new onboarding promise—“we’ll help you stay on top of it”—into a supportive, non-blocking rights checklist in Artist Settings, with a durable seven-day reminder that can return in Sound Vault when due.

## Scope

- Derive four profile-level setup items from existing authoritative fields: confirmed legal identity, PRO status, IPI/CAE where applicable, and publishing status.
- Count an explicit unaffiliated PRO choice as handled and make IPI not applicable in that state.
- Offer an explicit self-published choice using the existing publisher field.
- Add the approved companion to the existing `/settings` Rights & contracts tab without redesigning the page.
- Persist “Remind me later” as a private, server-owned timestamp set seven days ahead.
- Show a quiet Sound Vault reminder only when that timestamp becomes due and setup is still incomplete.
- Keep the entire system advisory: no Writer's Room, songwriting, membership, or release-readiness authorization may depend on it.

## Files Expected to Change

- `supabase/migrations/158_rights_setup_companion.sql`
- `types/index.ts`
- `lib/profile/rights-setup.ts`
- `lib/profile/rights-setup.test.ts`
- `components/settings/RightsSetupCompanion.tsx`
- `components/settings/RightsSetupCompanion.test.tsx`
- `components/profile/RightsContractsSections.tsx`
- `app/api/rights-setup/remind/route.ts`
- `app/api/rights-setup/remind/route.test.ts`
- `components/onboarding/RightsSetupReminder.tsx`
- `components/onboarding/RightsSetupReminder.test.tsx`
- `app/(artist)/vault/page.tsx`
- `__tests__/migration-158.test.ts`
- `.planning/quick/260902-rights-setup-companion/SUMMARY.md`

## Validation Plan

- Pure tests cover blank, partial, unaffiliated, self-published, complete, snoozed, and due states.
- Render tests cover supportive copy, field actions, explicit status choices, and no blocking/readiness language.
- API tests prove authentication, a server-owned seven-day timestamp, and verified-user scoping.
- Migration tests prove the reminder field is private and has no browser grants.
- Run focused Jest and ESLint, TypeScript, full lint, full Jest, and `git diff --check`.

## Risks / Coordination Notes

- Migration 157 is operator-verified live; migration 158 is forward-only and remains human-gated.
- Existing profile field semantics are reused instead of creating a duplicate rights store.
- `pro = 'none'` is the existing explicit unaffiliated value. `publisher = 'Self-published'` is an ordinary editable profile value.
- A NULL reminder timestamp means “do not surface a Vault reminder,” preventing surprise reminders for established accounts.
- The owner may keep a live dev server; do not run `npm run build` because it can corrupt the shared `.next` directory.
