# Delivery-Safe Files Build

## Objective

Complete the existing Metadata Studio delivery-copy workflow so every generated tagged MP3 or sidecar has a stable identity, source/output hashes, a frozen metadata snapshot, a machine-readable manifest and an accountable export receipt while the uploaded source audio remains untouched.

## Scope

- Preserve the existing source object and generate each delivery artifact at a unique, non-overwriting path.
- Compute SHA-256 hashes for the source audio and generated artifact.
- Freeze the exact metadata used for the artifact.
- Persist one append-only export record containing the manifest and receipt.
- Offer authenticated JSON downloads for the manifest and receipt.
- Upgrade the Metadata Studio actions so users can generate and download a tagged MP3 or sidecar and then retrieve its manifest and receipt.
- Keep DDEX transmission, recipient delivery, watermarking and partner acknowledgments out of scope.

## Files Expected to Change

- `lib/metadata/delivery-safe.ts`
- `lib/metadata/delivery-safe.test.ts`
- `supabase/migrations/142_metadata_delivery_exports.sql`
- `__tests__/migration-142.test.ts`
- `app/api/vault/[projectId]/tracks/[trackId]/metadata/embed/route.ts`
- `app/api/vault/[projectId]/tracks/[trackId]/metadata/sidecar/route.ts`
- `app/api/vault/[projectId]/tracks/[trackId]/metadata/deliveries/[deliveryId]/[document]/route.ts`
- `components/vault/MetadataStudio.tsx`
- focused route/component tests where the existing test harness supports them
- `.planning/quick/260901-delivery-safe-files-build/SUMMARY.md`
- `.planning/todos/pending/2026-09-01-delivery-safe-files-production-migration.md` if production still needs the owner-run migration

## Validation Plan

- Unit-test deterministic hashes, manifests, receipts and unique artifact paths.
- Text-test migration immutability, ownership/RLS and append-only controls.
- Run focused Metadata Studio and metadata tests.
- Run TypeScript, lint and the full Jest suite where practical.
- Run `git diff --check` on every scoped file.
- Review the final diff for source mutation, authorization and accidental secret exposure.

## Risks / Coordination Notes

- The worktree contains unrelated owner changes. Stage and commit only the explicit files in this plan.
- Migration 142 is human-gated under the repository's Supabase doctrine. Do not run `supabase db push`; document the production activation step.
- A database write must succeed before returning a generated delivery as complete. If persistence fails after upload, best-effort cleanup removes only the newly generated artifact, never the source.
- Historical delivery records are append-only. Corrections create a new delivery rather than rewriting an old manifest or receipt.
- Existing plain GET sidecar behavior remains available for compatibility, but the Metadata Studio UI uses the accountable POST generation flow.
