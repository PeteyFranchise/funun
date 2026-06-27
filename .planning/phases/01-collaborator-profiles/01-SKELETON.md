# Walking Skeleton — Funūn Collaborator Profiles (Wave 2, Phase 1)

**Phase:** 1
**Generated:** 2026-06-26

> Funūn is an existing, mature Next.js 15 + Supabase application. The "walking skeleton" here is the **thinnest end-to-end slice of the new collaborator feature** — a real DB table, a real CRUD API, and a real UI interaction (create → view → edit → delete a collaborator) — delivered in Plan 01. Every later vertical slice (composer-row auto-fill, split-sheet auto-fill, approval + invite flows) is built on the table, API, type, and CollaboratorPicker established here without renegotiating these decisions.

## Capability Proven End-to-End

A signed-in user can create a collaborator on the `/collaborators` page, see it rendered as a card with a live IPI status badge, edit it, and delete it — backed by a real `collaborators` Supabase table with RLS, served through `GET/POST /api/collaborators` and `PATCH/DELETE /api/collaborators/[id]`.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 App Router (existing) | Project standard; server components fetch, client components mutate |
| Data layer | Supabase PostgreSQL + `@supabase/supabase-js` (existing) | Project's established data layer; RLS enforces per-user isolation |
| New table key | `user_id` REFERENCES `auth.users` (NOT `artist_id`) | Matches every existing table; lets non-artist users (industry pros) maintain a roster (D-20). The STATE.md note saying `artist_id` is stale — CONTEXT.md D-20 is authoritative |
| API shape | Route handlers with `createApiClient()` + `EDITABLE_FIELDS` allowlist | Mirrors `app/api/profile/route.ts` exactly; mass-assignment defense via `sanitizeCollaborator()` |
| Auth boundary | `supabase.auth.getUser()` 401 gate on every route except public `/approve` and `/join` | Established middleware + route pattern; public token pages use `createServiceClient()` to read past RLS |
| Token generation | Node built-in `crypto.randomBytes(32).toString('hex')` | 256-bit entropy, no new dependency; used for approval + invite tokens |
| Email | `lib/email/index.ts` `sendEmail()` (Resend wrapper) | No-ops safely when unconfigured; reused for IPI/invite/approval mail |
| Modal/form UX | Follow `EditProjectForm` (`useState` toggle + inline form + `router.refresh()`) | Consistent with the existing design system; no new modal primitive |
| Directory layout | `components/collaborators/*`, `components/split-sheets/*`, `lib/collaborators/`, `lib/split-sheets/`, API under `app/api/collaborators` and `app/api/split-sheets`, public pages at `app/approve/[token]` and `app/join/[inviteToken]` | Mirrors existing domain-folder convention (vault, contracts, antenna) |
| Reusable picker | `CollaboratorPicker` built in Plan 01, fetches `GET /api/collaborators` on mount | Single component reused by both Wave 2 slices (MetadataStudio composer rows and split-sheet party rows) |

## Stack Touched in Phase 1 (Plan 01)

- [x] Project scaffold — existing app; no framework init needed
- [x] Routing — new real route `/collaborators` (artist layout) + nav entry; middleware protection updated
- [x] Database — real `collaborators` table with a real read (`GET`) AND real writes (`POST`/`PATCH`/`DELETE`); migration 018 pushed to the live DB ([BLOCKING] schema-push gate)
- [x] UI — interactive create/edit/delete modal wired to the API with `router.refresh()`
- [x] Deployment — runs under the existing local/dev `npm run dev` full-stack; verified via the Plan 01 human checkpoint

## Out of Scope (Deferred to Later Slices / Later Phases)

- **Composer-row auto-fill into MetadataStudio** — Plan 02 (this phase, Wave 2)
- **Standalone split-sheet builder + auto-fill** — Plan 03 (this phase, Wave 2)
- **Token approval loop + collaborator invite + public pages** — Plan 04 (this phase, Wave 3)
- **Collaborator self-edit portal** — deferred to a future phase (Phase 1 `/join` is view-only, D-09)
- **Dropbox Sign live e-sign / SMS confirmation** — deferred (blocked on paid account)
- **Songtrust API / SoundExchange direct filing** — Wave 2 Phase 3 is guide-and-link only; automation deferred (BD/partner pending)

## Subsequent Slice Plan

Each later plan/phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Plan 02 (Wave 2):** Composer rows in MetadataStudio auto-fill from the roster; missing-IPI chip + readiness warning + save-to-profile nudge (COLLAB-03)
- **Plan 03 (Wave 2):** Standalone SplitSheetBuilder with per-party collaborator auto-fill, even-split + 100% validation, industry entry point (COLLAB-03)
- **Plan 04 (Wave 3):** Token-based split approval (approve/counter), initiator notifications, collaborator invite + view-only `/join` profile (COLLAB-03, COLLAB-04)
- **Phase 2:** Document lifecycle — signed-PDF upload, signer status, readiness gate fix (builds on collaborators as signer source)
- **Phase 3:** Rights guidance — copyright / PRO / SoundExchange / Songtrust checklists (builds on collaborator rights identity)
