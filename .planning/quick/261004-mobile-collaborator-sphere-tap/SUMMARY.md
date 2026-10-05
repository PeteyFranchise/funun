# Mobile Collaborator Sphere Tap Fix — Summary

## What changed

- Changed collaborator avatars from hidden decorative `div` elements into named buttons.
- Added a tap-without-drag gesture: movement beyond eight pixels remains a sphere drag, while a stationary release opens and pins the selected collaborator's details.
- Kept desktop hover behavior and added keyboard focus plus Enter/Space activation.
- Added persistent tap selection, switching when another avatar is tapped and clearing when the sphere background is tapped.
- Prevented touch pointer entry from impersonating hover and made drag completion restore the pinned card or close an unpinned card.
- Disabled native selection, image dragging, long-press touch callouts, context menus, and selection starts inside the sphere.
- Updated visible and accessible copy from hover-only language to `tap or hover`.
- Added a focused regression assertion to the existing marketing artifact tests.

## Validation run

- `npm test -- --runInBand scripts/marketing-artifact.test.ts` — 108 tests passed.
- `npm run marketing:verify` — passed with zero artifact violations.
- `npm run marketing:assets:check` — passed: 50 assets, 7 fonts, 53 browser-observed assets.
- Mobile browser preview at 390×844 — tap opened and pinned Nia Adeyemi's card; drag preserved the pinned selection; no browser console errors.
- The existing artifact test extracted the inline script and passed its positive-control-backed `node --check` syntax test.
- `git diff --check` passed for the changed task files.

## Remaining risk

- The in-app browser's mobile viewport reproduces responsive dimensions but is not a physical iOS Safari long-press environment. The standard `-webkit-touch-callout`, selection, context-menu, and image-drag protections are present; a final real-device smoke test remains advisable after deployment.

## Coordination note

Claude had unrelated in-progress edits in the same marketing files. This change was confined to the collaborator-sphere CSS, copy, JavaScript behavior, one focused artifact test, and this uniquely named quick-task record.

## Workflow note

Native `/gsd-quick` invocation was unavailable in this Codex session, so the AGENTS.md manual quick-task fallback was used.
