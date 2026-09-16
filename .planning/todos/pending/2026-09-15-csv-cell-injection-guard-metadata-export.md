---
created: 2026-09-15T00:00:00Z
title: Add CSV-formula-injection guard to csvCell in lib/metadata/export.ts
area: metadata
priority: near-term-planning
status: ready-for-gsd-discussion
files:
  - lib/metadata/export.ts
  - lib/catalogue/take-export-formats.ts
  - lib/catalogue/take-export-formats.test.ts
---

## The finding

`csvCell` in `lib/metadata/export.ts` implements RFC4180 quoting (wraps a value in double
quotes and doubles an embedded double quote when it contains a comma, a quote or a newline)
but has **no spreadsheet-formula-injection guard**. A cell value beginning with `=`, `+`, `-`
or `@` is written through unmodified, and Excel/LibreOffice/Google Sheets will interpret that
as a formula when the file is opened. This is a latent gap in **shipped** code — it predates
Phase 40 and was found by Phase 40's own research (40-RESEARCH.md, Pitfall 5) while building
this phase's own CSV exporter.

## The decision

Phase 40 did **not** fix it in `lib/metadata/export.ts`. Three reasons, in order:

1. **Delivery-affecting.** `buildCsv`'s only consumer is the distributor metadata export.
   Silently prepending an apostrophe to an ISRC, a UPC or a title changes bytes a third party
   parses on the other end — that is a delivery-state change, and Phase 40's operating
   boundaries explicitly put delivery state out of scope.
2. **Wrong layer for Phase 40's own guard.** Phase 40's own formula-injection protection
   (`sanitizeMarkerLabel` in `lib/catalogue/take-export.ts`) has to protect all three of its
   export formats, including a tab-delimited file with a `.csv` extension that spreadsheet
   software will happily open — so Phase 40's guard belongs upstream in the shared
   label-sanitisation step, not inside a cell-quoting function like `csvCell` or its sibling
   `csvField` (`lib/catalogue/take-export-formats.ts`).
3. **Deserves its own verified change.** Closing a gap in a shipped exporter that a real
   distributor parses deserves its own change with its own end-to-end verification against a
   real distributor import, not a change that rides along inside an unrelated new feature.

`lib/metadata/export.ts` is untouched by Phase 40 — verified by a clean
`git diff --stat -- lib/metadata/export.ts` as one of the phase's own acceptance criteria.

`take-export-formats.ts`'s `csvField` is a deliberate copy of `csvCell`'s RFC4180 quoting
rule (not an import), and does **not** carry a formula guard of its own either — Phase 40's
formula protection lives entirely in `sanitizeMarkerLabel`, applied once, upstream of all
three export formats. `take-export-formats.test.ts` asserts `csvField` and `csvCell` agree on
quoting only (a table of comma/quote/newline/plain/empty cases); the two are proven equal on
quoting, and neither is expected to carry a formula guard for that comparison to hold.

## The residual risk

Fields in the metadata export are structured — names, identifiers, titles — where a leading
formula character is implausible but not impossible, since an artist name, label name or
contact name is user-controlled free text.

## The suggested fix when this is picked up

Apply the same apostrophe-prefix guard `sanitizeMarkerLabel` and `csvCell`'s own
`CSV_FORMULA_LEAD` regex already use inside `csvCell`, then re-verify one real distributor
import end to end before shipping the change — the apostrophe is visible in the delivered
bytes, and that needs a real recipient-side check, not just a unit test, before it goes out
on a path a third party consumes.
