# Contract Locker Template-System Blueprint

## Objective

Design the safest reusable implementation for moving counsel-approved contract templates from the repository research library into Funūn's Contract Locker, including structured generation, lawyer collaboration, e-signature, immutable execution evidence, and user-facing legal boundaries.

## Scope

- Map the current Contract Locker, `vault_documents`, workspace permission, DocuSeal, upload, verification, and template-generation architecture.
- Identify reuse opportunities and conflicts with the new governance policy.
- Define the target domain model, lifecycle states, permissions, API/UI boundaries, and rollout sequence.
- Record critical preconditions and migration compatibility requirements.
- Produce a planning blueprint only; do not change runtime code or database schema in this task.

## Files expected to change

- `.planning/deliberations/contract-template-system-implementation-blueprint.md` (new)
- `.planning/todos/pending/2026-09-01-lawyer-reviewed-contract-product-foundation.md`
- This quick task's `SUMMARY.md` after validation

## Validation plan

- Ground each major recommendation in an existing repository seam or an explicitly identified gap.
- Confirm the design keeps research sources out of runtime.
- Confirm only immutable, counsel-approved versions can be generated or sent for signature.
- Confirm professional-role labels do not grant attorney access or signing authority.
- Confirm signed-document state is webhook/evidence driven and stored privately.
- Check the blueprint against the owner-approved counsel model and existing workspace doctrine.
- Run `git diff --check` on task paths.

## Risks and coordination

- Existing unrelated worktree changes will not be touched.
- Final contract language, Terms of Service, attorney verification, privilege, and jurisdiction rules remain counsel decisions.
- Live Supabase migrations and provider operations are human-gated and outside this planning task.
- The current live-signable blanket-agreement draft is a critical governance conflict to address before expanding template generation.

