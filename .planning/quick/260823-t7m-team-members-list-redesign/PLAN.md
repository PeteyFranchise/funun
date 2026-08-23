---
slug: team-members-list-redesign
description: Rebuild the Team Members List view as spaced row-cards with aligned column headers (Team Member / Role / Phone / Status) + email/call icon buttons; bump Cards avatar; fix ROLE_ORDER to include Accounting + Marketing; adaptive read-only copy
date: 2026-08-23
files_modified:
  - components/admin/StaffAdmin.tsx
---

<objective>
Owner-approved redesign of the Team Members roster (mockup:
.planning/design/team-members-list-redesign-mockup.html). Build into the real
StaffAdmin, preserving ALL existing behavior (add flow, ⋯ menu, edit drawer,
remove dialog, resend/copy-link, search, filters, view persistence, canManage
gating, API calls).

Changes:
1. **BUG: ROLE_ORDER omits accounting + marketing** — that array (not ROLE_META)
   drives the add-form role cards, filter chips, and memberRoles(); the two new
   roles never render. Add them (after tms). This is why the form showed 7 roles,
   NOT browser cache.
2. **List view → spaced row-cards + aligned column headers**: a header row
   (Team Member / Role / Phone / Status) above cards that each use the SAME CSS
   grid so columns line up; email under the name; a clean Status column (colored
   dot + Joined/Invited + date); ✉/📞 icon buttons + the ⋯ menu in a right-aligned
   actions column. Keep the gap between cards. Wrap in overflow-x-auto.
3. **Cards view**: avatar bumped (lg 52→54px, per "make it larger"); add a
   phone + status meta block; ✉/📞 icon buttons in a footed row; ⋯ top-right.
4. **Read-only**: no explainer banner (there isn't one), ⋯ + Add hidden
   (canManage already gates), header copy → "The people who run Funūn. See who's
   on your team and how to reach them."
5. Remove now-unused CONTACT_BTN + renderContactMeta; add ICON_BTN + statusInfo.

Verify tsc + lint + jest + next build (stop dev first). NEVER touch launch.json.
</objective>
