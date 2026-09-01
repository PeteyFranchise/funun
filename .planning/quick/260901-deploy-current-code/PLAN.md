# Deploy current Funūn code

## Objective

Release the current verified application changes on `main` to the linked Funūn Vercel production project.

## Scope

- Inventory all tracked and untracked work accumulated during the current product session.
- Include deployable application code, tests, migrations already applied to production, GSD reports, roadmap/doctrine documents, and intentional repository skills.
- Exclude local captures, generated output documents, scratch HTML, caches, and temporary files.
- Re-run release checks after the Supabase CLI dependency update.
- Commit and push `main`, monitor the Git-triggered Vercel deployment, and verify production health.

## Expected repository changes

- No new feature implementation is planned in this deployment task.
- This task may add only this deployment plan/summary; all other staged changes must already belong to the completed work being released.

## Validation

- Confirm local/remote migrations match through 149.
- Run TypeScript, lint, the full Jest suite, and `git diff --check`.
- Avoid a local Next build if the owner's development server is running; use the Vercel production build as the build gate in that case.
- Confirm the production deployment reaches READY and scan recent production errors.

## Risks and coordination

- The working tree contains many user/Claude/Codex changes; do not discard or overwrite any of them.
- Do not commit `output/`, `tmp/`, `public/_captures/`, or scratch preview artifacts.
- Migrations 141 and 147–149 are already applied remotely, so source control must include them in the release commit.
