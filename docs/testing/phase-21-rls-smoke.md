# Phase 21 — Cross-Account RLS Smoke Test

**Tester:** Thomas · **Requested by:** Pete

## What this verifies

Phase 21 shipped cross-account project sharing. The code is merged and migrations **078**
(`project_members` table + RLS rewrite) and **079** (auto-membership trigger) are **live in
production**. But the RLS *behavior* has only been confirmed at the schema level (service-role,
which bypasses RLS) — it has **not** been exercised against real accounts. This test closes that gap.

**In plain terms, we're proving:** a collaborator can see a project shared with them, a viewer
can't edit it, a non-member can't see it at all, and being added to a *sent* split sheet
automatically grants the right access — while a *draft* sheet grants nothing.

## Where to test

Use the **Vercel preview** on this PR (link in the PR's checks/comments). It runs Phase 21's code
against the same live Supabase database, so it exercises the real RLS policies. (You can also test
against production once it's deployed — same DB either way.)

## Accounts you'll need

- **Account A** — owns a test project (create one in the Sound Vault if needed).
- **Account B** — the collaborator granted access to A's project.
- **Account C** — a third account that is NOT a member (for the "can't see it" checks).

> **Note on roles:** `viewer` access can be granted entirely in-app (see §2, the auto-membership
> path). Testing `co-owner`/`editor` currently needs a one-line DB insert (there's no UI to promote
> members yet — that's a deliberate deferral). If you don't have DB console access, do the parts
> you can and note which rows need a seeded membership — Pete/Claude can insert those and hand back.

---

## 1. Owner + non-member baseline (in-app, no DB needed)

- [ ] **Account A** sees its own project and can open/edit it exactly as before (tracks, art, dates).
- [ ] **Account C** (non-member) does NOT see Account A's project anywhere in their vault, and hitting
      its URL directly does not load it.

## 2. Auto-membership → viewer (migration 079, in-app)

This is the primary real-world path: being a writer on a **sent** split sheet auto-grants a viewer seat.

- [ ] **Claim-then-party:** With Account B signed up (verified), add B as a writer on a split sheet
      that is **linked to Account A's project** and **sent for signature** (not a draft). → Account B
      now sees the project in their **"Shared with me"** vault lane, badged with their role (viewer).
- [ ] **Draft gate (must grant nothing):** Add B as a writer on a **still-draft** linked sheet. →
      Account B sees **nothing** — no shared project appears. (This is the critical no-leak check.)
- [ ] **Idempotency:** Re-save / re-send that sheet. → No duplicate membership; B still has exactly
      one viewer seat.
- [ ] **Party-then-claim** (if testable): a collaborator added by email who has NOT signed up yet has
      no access; once they sign up with that email, the shared project appears.

## 3. Access matrix — the project (migration 078)

Grant Account B a role on Account A's project. `viewer` comes from §2; for `co-owner`/`editor` use:
`INSERT INTO project_members (project_id, user_id, role, added_by) VALUES ('<A-project-id>','<B-user-id>','editor','<A-user-id>');`

| Role (Account B) | Sees project (SELECT) | Can edit (UPDATE) | Can delete |
|---|:---:|:---:|:---:|
| Owner (Account A) | [ ] Yes | [ ] Yes | [ ] Yes |
| Co-owner | [ ] Yes | [ ] Yes | [ ] **No** |
| Editor | [ ] Yes | [ ] Yes | [ ] **No** |
| Viewer | [ ] Yes | [ ] **No** | [ ] **No** |
| Non-member (Account C) | [ ] **No** | [ ] **No** | [ ] **No** |

## 4. Access matrix — child tables (migration 078)

Repeat for a row attached to A's project in **each** of `tracks`, `vault_assets`, `vault_documents`,
`tool_outputs`:

| Role (Account B) | Sees the row | Can edit the row |
|---|:---:|:---:|
| Owner | [ ] Yes | [ ] Yes |
| Co-owner / Editor | [ ] Yes | [ ] Yes |
| Viewer | [ ] Yes (view only) | [ ] **No** |
| Non-member | [ ] **No** | [ ] **No** |

- [ ] `tracks` passes  [ ] `vault_assets` passes  [ ] `vault_documents` passes  [ ] `tool_outputs` passes

## 5. Guest-list + stability (migration 078)

- [ ] Account A (owner) sees the full member list for the project (including B's row).
- [ ] Account B as **viewer/editor** sees **only their own** membership row, not other members'.
- [ ] No authenticated user can directly INSERT/UPDATE/DELETE a `project_members` row via the app
      (expect a permission error) — the only write path is the auto-membership trigger + owner backfill.
- [ ] No `42P17` "infinite recursion" error appears on ANY authenticated read for ANY role above.
- [ ] Backfill: `SELECT COUNT(*) FROM vault_projects` == `SELECT COUNT(*) FROM project_members WHERE role='owner'`.

---

## Results

**Overall:** ☐ Pass  ☐ Pass with notes  ☐ Fail

**Environment tested:** ☐ this PR's Vercel preview  ☐ production
**Date / tester:**

**Any failing cell — describe (role, table, expected vs actual):**

>

**Notes / anything odd:**

>

When done, check the boxes above, fill in Results, and drop a comment on this PR (or ping Pete). If
everything passes, Phase 21's deferred verification item is cleared.
