---
status: testing
phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
source: [40-VERIFICATION.md]
started: 2026-09-16T02:45:00Z
updated: 2026-09-16T02:45:00Z
---

## Current Test

number: 2
name: Audacity label track imports correctly
expected: |
  Import a Funūn-exported Audacity label track into Audacity against any audio file. Label count
  equals the comment count the room showed; a range comment appears as a region with the same
  in/out points; a point comment appears at a single position, not a zero-length artifact.
awaiting: user response

## Tests

### 1. Audition byte-level format verification — NO LONGER A GATE (withheld 2026-09-16)

expected: Run the eight-step procedure in `docs/catalogue/AUDITION-MARKER-FORMAT.md` against a
real Adobe Audition install.

result: WITHHELD — Audition removed from the UI before shipping, per E-12. Not a pending test.

why_human: Nobody on this phase has Audition installed. The format is corroborated by three
independent third-party sources but has never been checked against the software itself.
`grep -c INFERRED` currently returns 6 in the serializer and 7 in the doc, with **zero CONFIRMED
markers anywhere**.

why_it_matters: **This is the one test where a silent pass is the dangerous outcome.** Audition's
second column is a DURATION where Audacity's is an END TIMESTAMP. If that were wrong, the file
would import *successfully* with every range marker in the wrong place — no error, no warning,
just a take annotated at the wrong moments. Plan 40-08's own text is blunt: "If it has not been
run, the phase is not green."

fallback: E-12 permits shipping CSV + Audacity alone. Removal costs exactly one array entry in
`components/catalogue/TakeMarkerExport.tsx` and one number in
`__tests__/writer-room-take-marker-export-ui.test.ts`.

gotcha: The sample **must** be generated with `npm run export:audition-sample --silent`. Without
`--silent`, npm's run-banner is written into stdout and corrupts the byte comparison the whole
procedure depends on.

### 2. Audacity label track imports correctly

expected: Import a Funūn-exported Audacity label track into Audacity against any audio file. Label
count equals the comment count the room showed; a range comment appears as a region with the same
in/out points; a point comment appears at a single position, not a zero-length artifact.

result: [pending]

why_human: No Audacity instance in this environment. Pinned byte-for-byte against Audacity's own
manual and covered by exact-string unit tests, but never imported live.

### 3. Two separate controls are visible and distinct

expected: On a take in the Writer's Room, two visually distinct controls — *Export comments* and
*Export my pins* — matching the action row's quiet 10px vocabulary. Neither offers the other's
content.

result: [pending]

why_human: No jsdom in this repo; rendering and interaction state are unobservable by any test here.

### 4. A real comments export downloads correctly

expected: On a take with unresolved comments, the browser saves a file whose name contains the song
title and the take's vN, containing one marker per unresolved comment with the author's **display
name**, not their @handle.

result: [pending]

why_human: No live request has been made against either export route — no test database, no jsdom.

### 5. An all-resolved take refuses in place

expected: No file is saved; the exact 409 sentence renders in place with the correct count.

result: [pending]

why_human: Requires a live 409 rendered in a real browser. This is the check that proves refusals
never land a file full of JSON on someone's desktop — the reason refusals are 409 rather than 200.

### 6. The skipped-repositioning count appears

expected: After exporting a take containing a repositioning-flagged comment, the
`X-Funun-Skipped-Reposition` header renders as the correct `skippedRepositionNote()` sentence.

result: [pending]

note: If no such take exists, **record this as unverified rather than passed.**

why_human: The helper's import is proven; the runtime header read is not.

### 7. Pins export, with pins and without

expected: A file with `my-pins` in its name when pins exist; the no-pins 409 sentence and no file
when none do.

result: [pending]

why_human: Same jsdom and live-request limitation.

### 8. Mobile wrapping

expected: At phone width, with both format labels visible (Audacity, CSV — Audition is withheld),
both controls wrap cleanly rather than overflowing.

result: [pending]

why_human: Visual and responsive judgment; no jsdom.

## Summary

total: 8
passed: 0
issues: 0
pending: 7
withheld: 1
skipped: 0
blocked: 0

## Gaps
