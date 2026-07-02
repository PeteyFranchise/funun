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

**Status:** Partially resolved in 06-03 (Task 3). The `/curators` bare path was required as a
LOCKED artifact for this plan's artist-facing directory (`app/(artist)/curators/page.tsx`,
PITCH-01), which collided directly with the admin curators page silently occupying that same
bare path — a real Next.js duplicate-route build failure, not a cosmetic issue. Fixed via
`git mv "app/(admin)/curators/page.tsx" "app/(admin)/admin/curators/page.tsx"`: the page now
lives at a literal `admin/` segment nested inside the `(admin)` route group, so it resolves to
`/admin/curators` (matching the sidebar `href` exactly, and still inheriting
`app/(admin)/layout.tsx`'s shared sidebar/auth-gate wrapper unchanged) while `/curators` is
freed for the artist-facing page. `Checklist Items` and `Tips` still resolve to their bare
paths (`/checklist`, `/tips`) — those two are unchanged and remain deferred for the dedicated
follow-up fix described above (moving all three under a real `/admin` segment, or changing all
three sidebar hrefs to bare paths, in one pass).
