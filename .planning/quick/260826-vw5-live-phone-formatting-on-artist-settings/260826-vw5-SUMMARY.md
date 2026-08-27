---
quick_id: 260826-vw5
title: Live phone formatting on artist Settings
status: complete
branch: feat/contact-phone-formatting
completed: 2026-08-26
tags: [profile, settings, phone, i18n, validation]
key-files:
  created:
    - lib/phone.ts
    - lib/phone.test.ts
  modified:
    - lib/staff/phone.ts
    - components/profile/RightsContractsSections.tsx
    - app/api/profile/route.ts
decisions:
  - "NANP helpers re-homed to lib/phone.ts; lib/staff/phone.ts is now a pure re-export so staff semantics and tests stay byte-identical"
  - "formatContactPhone returns any non-+1 '+' country code exactly as typed — never reformatted, re-spaced, or truncated"
  - "+1 detection requires a digit after the '+1' so a controlled input does not clear under the artist mid-keystroke"
  - "trimStart (not trim) in the international branch so a trailing space stays usable as a live separator; the API trims on store"
  - "API sanitize() normalizes and never rejects — profile phone is optional, partial and foreign values are legitimate"
metrics:
  commits: 1
  tests_added: 13
  tests_total: 2993
---

# Quick 260826-vw5: Live phone formatting on artist Settings

Artist Settings phone now masks live as you type, with a guard that returns
international numbers exactly as typed instead of silently mangling them into
plausible-looking wrong US numbers.

## What shipped

**1. `lib/phone.ts` (new)** — `phoneDigits`, `formatPhone`, `isValidPhone`
moved here verbatim from `lib/staff/phone.ts`. Same semantics, same behavior.
They now serve two domains, so living under `lib/staff` (with `lib/profile`
reaching in) would have been backwards coupling.

**2. `lib/staff/phone.ts`** — reduced to a pure re-export of those three.
Staff behavior untouched; `lib/staff/phone.test.ts` is unmodified and still
passes as-is.

**3. `formatContactPhone(raw)` in `lib/phone.ts`** — the international guard.
A trimmed value starting with `+` that is not a `+1` NANP number is returned
as typed. Everything else goes through the NANP mask. Pure, never throws, safe
on empty input, idempotent.

**4. `components/profile/RightsContractsSections.tsx`** — the artist phone
input's `onChange` runs `formatContactPhone`, so it masks live.

**5. `app/api/profile/route.ts`** — new `contact_phone` branch in `sanitize()`
applying the same function, empty → `null`, matching neighboring branches. No
400 rejection: phone is optional and artists may legitimately save partial or
foreign numbers. Normalize, never reject.

## Why the guard exists

`lib/staff/phone.ts` is NANP-only by construction — strip to digits, drop a
leading `1`, cap at 10. Hand it `+44 20 7946 0958` and it returns
`(207) 946-0958`: a plausible-looking, silently **wrong** number, with no error
surfaced. That is acceptable for staff (Funūn's own US team, entered by an
admin) and not acceptable for artists, who can be anywhere and whose phone
number feeds contracts and split sheets. The pinned regression test is that
`+44 20 7946 0958` comes back byte-identical.

## Tests — `lib/phone.test.ts` (13 new)

US 10-digit mask · progressive mid-type masking · leading `1` dropped ·
explicit `+1 313 613 4284` masked as NANP · **`+44 20 7946 0958` unchanged** ·
other country codes (`+33`, `+81`, `+971`, `+86`) unchanged at every length ·
no truncation past 10 digits for international · trailing separator space
preserved · empty and whitespace-only safe · idempotent on already-formatted
US, international, and partial input · raw claim-prefill `3136134284` formats
correctly · `+1` mid-type does not eat the keystroke.

## Gates

| Gate | Result |
| ---- | ------ |
| `npx tsc --noEmit` | 0 errors from source (see deviation) |
| `npm run lint -- --max-warnings=0` | clean |
| `npx jest` | 277 suites, **2993 passed** (2980 baseline + 13) |

`npm run build` deliberately not run — a dev server is live on :3000 and a
build clobbers `.next`.

## Deviations

**1. `trimStart` instead of `trim` in the international branch.** The brief
said "return as typed (trim only)". Full `trim()` swallows a trailing space in
a controlled input, so an artist typing `+44 20 ` would have the separator
eaten on every keystroke and could never space out an international number —
which contradicts the brief's own hard rule that international numbers are
never re-spaced. `formatContactPhone` therefore trims only the leading side,
and `app/api/profile` applies `.trim()` when storing so the persisted value is
still clean. Covered by the "preserves a trailing space" test.

**2. `+1` alone is returned as typed, not masked to empty.** Strict "`+1` is
NANP" would mask `+1` → `''`, clearing the field the instant the artist typed
the `1` and making a `+1` number impossible to enter. The detection regex
requires at least one digit after the `+1`. Covered by the "does not eat the
keystroke" test.

**3. No format-on-load for existing raw values.** The brief asked only for
`onChange` wiring. A stored raw `3136134284` renders readably as-is, masks on
first keystroke, and is normalized by the API on next save. Formatting at mount
would risk marking a pristine form dirty in `useSettingsForm`, which is a
larger change than this task.

## Out of scope / could not verify

`npx tsc --noEmit` emits two pre-existing errors, both from
`.next/types/app/tmp-error-check/page.ts`, pointing at
`app/tmp-error-check/page` — a route that does not exist in the repo and was
never committed. These are stale generated artifacts in `.next`, unrelated to
this change, and would clear on the next build. Not fixed here: out of scope,
and clearing it would require the forbidden `npm run build`. Zero errors come
from source files.

Live browser behavior of the mask was not visually verified — the change was
validated by unit test only.

## Commits

- `df2746c` — feat(settings): live phone masking that does not mangle international numbers

## Self-Check: PASSED

- `lib/phone.ts` — FOUND
- `lib/phone.test.ts` — FOUND
- `lib/staff/phone.ts` — FOUND (re-export)
- commit `df2746c` — FOUND
- no file deletions in the commit — verified
