---
created: 2026-08-23T00:00:00Z
title: Staff profile-picture (avatar) editing — upload + set + self-edit
area: admin / team members / storage
files:
  - components/admin/StaffAdmin.tsx
  - app/api/admin/staff/route.ts
  - app/api/admin/staff/[id]/route.ts
  - app/api/profile/avatar/route.ts  (existing artist pattern to adapt)
  - lib/storage
---

## Why
Staff can't set a profile picture today. `funun_staff.avatar_url` exists and the
`Avatar` component renders it when set, but there is **no upload flow for staff
anywhere** (only artists have one: `app/api/profile/avatar/route.ts` uploads to
Storage → public URL → saves). So this is net-new, not a toggle. Owner approved
building it as a follow-up to the Team Members list redesign (260823-t7m).

## Requirements (owner decisions, 2026-08-23)
1. **Leadership/TMS set the photo in the Add team member form** (at invite time)
   AND can **edit it via the ⋯ menu** (the edit-roles drawer).
2. **AE / non-manager self-edit: BOTH surfaces** (owner: "1 and 2"):
   - a staff **"My Profile" settings page** (mirrors artist `/settings`), and
   - **edit-your-own-row** in Team Members (self-scoped; the ⋯/edit appears on a
     member's own row even when `canManage` is false).
3. **Revertible to managers-only** (owner: "revert to 3 if this freedom is
   abused") — put self-edit behind a config/flag so it can be locked down to
   Leadership/TMS without a code change.

## Scope
- **Backend:** staff avatar-upload endpoint (image → Supabase Storage bucket →
  public URL), adapted from `app/api/profile/avatar`. Accept `avatar_url` on
  create (`POST /api/admin/staff`) and edit (`PATCH /api/admin/staff/[id]`) —
  verify the PATCH allow-list writes it (today it only SELECTs the column).
  Decide a storage bucket + path (keyed by user_id) + size/type limits + the
  add-form ordering wrinkle (account must exist before its avatar can be keyed
  to user_id — upload after create, or to a temp path then move).
- **Frontend:** avatar upload/preview control in the Add form and the edit
  drawer; self-edit entry points per (2).
- **Guard:** self-edit config flag per (3).

## Notes
- Reuse the `Avatar` component (already handles `avatar_url` → falls back to
  gradient initials).
- Security: validate content-type + size server-side; only the member themselves
  or Leadership/TMS may write a given user's avatar (defense-in-depth at the API,
  like the rest of /api/admin/staff).
