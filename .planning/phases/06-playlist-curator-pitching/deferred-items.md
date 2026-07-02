# Phase 6 — Deferred Items

## 06-02: Admin sidebar nav links point at `/admin/*` but pages are served at the bare path

**Discovered during:** Task 3 (CuratorAdmin component + admin curators page + nav link)

**Issue:** `app/(admin)/layout.tsx`'s sidebar `<Link>`s use `href="/admin/checklist"` and
`href="/admin/tips"`, but because `(admin)` is a Next.js route group (parenthesized folder),
it is stripped from the URL — the actual pages are served at `/checklist` and `/tips`, not
`/admin/checklist` / `/admin/tips`. Clicking either existing sidebar link 404s. Confirmed via
`npm run build` route listing: `/checklist`, `/tips`, and (now) `/curators` all appear without
an `/admin` prefix.

**Why out of scope for this task:** This is a pre-existing bug affecting the Checklist Items
and Tips links, introduced in a prior phase (05), not by 06-02's changes. The 06-02 plan
explicitly instructs mirroring the existing link pattern ("styled identically to the existing
Checklist Items / Tips links"), and the plan's own automated verification (`grep -q
"/admin/curators" app/(admin)/layout.tsx`) requires the literal `/admin/curators` string —
fixing the href scheme would fail that check. Per the Scope Boundary rule, only issues directly
caused by the current task are auto-fixed; this is a systemic, pre-existing issue spanning 3
admin pages and is better addressed as a dedicated fix (either add an `/admin` route segment
wrapping the pages, or change all three sidebar links to their bare paths) in a follow-up task.

**Status:** Deferred — not fixed. New `Curators` link added in 06-02 mirrors the same (broken)
`/admin/curators` href for consistency with the two existing links, per plan instruction.
