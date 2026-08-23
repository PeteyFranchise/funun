---
slug: team-members-list-redesign
status: complete
date: 2026-08-23
files_modified:
  - components/admin/StaffAdmin.tsx
---

# Team Members list redesign — SUMMARY

Owner-approved redesign (mockup: `.planning/design/team-members-list-redesign-mockup.html`).

## What shipped
- **List view** → spaced row-cards under **aligned column headers** (Team Member /
  Role / Phone / Status). Email sits under the name; a clean two-line Status
  column (colored dot + Joined/Invited + date); **email/call icon buttons + the
  ⋯ menu** in a right-aligned actions column. Wrapped in `overflow-x-auto`
  (`LIST_COLS` shared by the header + every card so columns line up).
- **Cards view**: avatar bumped to **54px**, a phone + status meta block, and
  email/call icon buttons; ⋯ stays top-right.
- **BUG FIX: `ROLE_ORDER` omitted `accounting` + `marketing`** — that array (not
  `ROLE_META`) drives the add-form role cards, filter chips, and `memberRoles()`,
  so the two roles never rendered despite being defined in `ROLE_META`,
  `ALL_STAFF_ROLES`, the theme, and migration 121. Added them. **This — not
  browser cache — is why the add form showed only 7 roles.**
- Read-only (non Leadership/TMS) header copy → "The people who run Funūn. See
  who's on your team and how to reach them." No explainer banner.
- Removed unused `CONTACT_BTN` + `renderContactMeta`; added `ICON_BTN` +
  `statusInfo`.

## Preserved (unchanged behavior)
Add flow, ⋯ menu, edit-roles drawer, remove dialog, resend/copy-invite-link,
search, role filters, List/Cards persistence, `canManage` gating (Leadership +
TMS), and every API call.

## Verification
tsc · lint · jest **2519 passed** · `next build` EXIT 0. No test was coupled to
the roster structure or the role count.

## Deploy
Fast-forwarded to `main`. Staff should hard-refresh (Cmd+Shift+R) — the roster
is a client bundle.

## Follow-up (separate, approved to build next)
**Profile-picture editing** — net-new (staff avatars can't be set today; only
artists have an upload flow, `app/api/profile/avatar`). See
`.planning/todos/pending/2026-08-23-staff-avatar-editing.md`.
