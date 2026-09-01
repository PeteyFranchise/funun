# Deploy current Funūn code — release summary

## Release contents

- Writer's Room direct audio upload, mobile audio compatibility, visible four-action empty state, and zero-byte capture protection.
- Existing-member Writer's Room admission and collaborator identity reconciliation.
- Collaborator roster deduplication, archived-card filtering, member-aware invitations, and single-CTA collaborator onboarding.
- Correct artist capability provisioning on signup.
- Green Room discovery by name, handle, username, and privacy-safe exact email.
- Sound Vault custody doctrine Playbook content and the current product/legal/metadata roadmap artifacts.
- Supabase CLI pinned to version 2.116.0 for consistent team tooling.
- Applied migration source files 141 and 147–149, matching production history through 149.

## Release validation

- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `npm test -- --runInBand` — 345 suites and 3,740 tests passed.
- `npm run build` — optimized Next.js production build completed successfully, including static generation of 119 pages.
- `git diff --check` — passed.
- Supabase local/remote migration list — matched through migration 149.

## Deployment hygiene

The release excludes local email previews, generated Word/PDF deliverables, browser captures, scratch HTML, and temporary document-rendering files. Those paths are now explicitly ignored to prevent accidental production inclusion.

## External gate

Pushing this release commit to `main` triggers the linked Funūn Vercel production deployment. The production READY state, live smoke checks, and post-deploy error scan are recorded in the deployment handoff rather than fabricated before the external build finishes.
