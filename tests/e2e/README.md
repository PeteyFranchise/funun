# Phase 14 UAT - Playwright E2E

Automates the 9-item UAT checklist from PR #26 (playback room, stems/instrumental
uploads, Export Pack). Most of it runs against local `next dev`; two checks are
tagged `@live` because they only mean something on a real Vercel deployment.

## What maps to what

| # | Spec | Tag | Notes |
|---|------|-----|-------|
| 1 | `specs/01-stems-upload.spec.ts` | `@live` | >4.5MB stems ZIP, no 413, bytes go to Supabase not Vercel |
| 2 | `specs/02-instrumental-toggle.spec.ts` | local | upload instrumental, Master/Instrumental swap |
| 3 | `specs/03-export-pack.spec.ts` | `@live` | Download ZIP now under 10s, ZIP has audio + 2 PDFs |
| 4 | `specs/04-share-link.spec.ts` | local | share link downloads unauthenticated, 7-day helper text |
| 5,6 | `specs/05-06-cross-tenant.spec.ts` | local | User B hitting User A routes gets 404 |
| 7 | `specs/07-playback.spec.ts` | local | master plays from a signed URL |
| 8 | `specs/03-export-pack.spec.ts` | local | PDFs carry real credits + metadata |
| 9 | `specs/09-public-release.spec.ts` | local | public `/r/{id}` streams, hides owner-only UI |

WR-01 (export fails cleanly on a missing object) also lives in the export-pack
spec and runs only when `E2E_WR01_PROJECT_ID` is set.

## Setup

1. `npm install` and `npx playwright install chromium`.
2. `cp .env.test.example .env.test` and fill in: two account logins, the target
   `E2E_BASE_URL`, and the Supabase URL + service role key.
3. Make sure the target is NOT in demo mode (`NEXT_PUBLIC_VAULT_DEMO` unset/false),
   or the export/stems routes return 400 and everything false-fails.
4. `npm run e2e:seed` - creates two projects owned by User A (one full + public,
   one master-only upload target), uploads backing files, and writes
   `tests/e2e/.auth/seed.json`.

## Run

```bash
npm run e2e         # local-safe checks (2,4,5,6,7,8,9)
npm run e2e:live    # the @live checks (1,3) - point E2E_BASE_URL at the preview
npm run e2e:all     # everything
npm run e2e:report  # open the last HTML report
```

Specs skip themselves (rather than fail) when their creds or seed data are
missing, so a partial setup still runs what it can.

## Notes

- Login happens through the real `/signin` form in a setup project, which saves
  the exact Supabase auth cookies the server routes read. Credentials come from
  `.env.test`, never from committed files.
- `@live` specs mutate the upload-target project (they add stems/instrumental).
  Re-run `npm run e2e:seed` before an `@live` run to reset it.
- The stems ZIP and instrumental WAV fixtures are generated on demand into
  `tests/fixtures/.gen/` (gitignored); nothing large is committed.
