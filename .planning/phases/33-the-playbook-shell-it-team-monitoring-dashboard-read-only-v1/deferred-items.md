# Phase 33 — Deferred Items

Out-of-scope discoveries logged during execution, per the executor's Scope Boundary rule
(only auto-fix issues directly caused by the current task's changes).

## 33-08: CSS custom-property mismatch in 33-07's Playbook components

**Found during:** 33-08 Task 1/2 (VendorsGrid/QuickLinks/dashboard page implementation).

**Issue:** `components/playbook/StatusBanner.tsx`, `components/playbook/DigestPanel.tsx`, and
`components/playbook/ThresholdsPanel.tsx` (all committed in 33-07) reference CSS custom
properties using the mockups' literal names — `var(--hair)`, `var(--lavdim)`, `var(--card2)` —
rather than the actual token names defined by `components/admin/console-theme.ts`'s
`ADMIN_CONSOLE_CSS` (`--border`, `--ink-3`, `--panel-2`), which is the CSS scope the Playbook
actually renders inside (`.fncon`, applied once by `app/(admin)/layout.tsx`). `--card` and
`--lav` happen to resolve because they're coincidentally also declared at `:root` in
`app/globals.css`, but `--hair`, `--lavdim`, and `--card2` are not defined anywhere in either
scope — those three custom properties are invalid/unset wherever they're referenced, which
means the affected border colors and dimmed text colors in StatusBanner/DigestPanel/
ThresholdsPanel likely don't render as designed (e.g. panel borders may render transparent).

By contrast, `components/playbook/ItRoomTopBar.tsx` and `components/playbook/Rail2.tsx` (both
33-04) correctly use the `.fncon` token names (`--ink-2`, `--ink-3`, `--border`, `--green-fg`).

**Why not fixed here:** `StatusBanner.tsx`, `DigestPanel.tsx`, and `ThresholdsPanel.tsx` are not
in this plan's `files_modified` list (only `VendorsGrid.tsx`, `QuickLinks.tsx`, and
`app/(admin)/playbook/it/dashboard/page.tsx`) — per the Scope Boundary rule, pre-existing issues
in files outside the current task are logged, not fixed.

**This plan's own new files** (`VendorsGrid.tsx`, `QuickLinks.tsx`) use the correct `.fncon`
token names throughout, to avoid propagating the same gap into new code.

**Suggested follow-up:** a small fix-forward plan/patch to swap `--hair`→`--border`,
`--lavdim`→`--ink-3`, `--card2`→`--panel-2` in the three 33-07 files.
