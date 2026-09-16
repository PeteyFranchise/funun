---
created: 2026-09-15T00:00:00Z
title: csvCell has no CSV-injection guard — distributor metadata export
area: security
files:
  - lib/metadata/export.ts
---

## Provenance

Surfaced during Phase 40 research (DAW marker export), 2026-09-15. **Not introduced by Phase 40**
— this is pre-existing in shipped code. Phase 40 deliberately does NOT fix it and carries an
acceptance criterion that `git diff --stat -- lib/metadata/export.ts` stays empty.

Recorded standalone so the gap survives independently of whether Phase 40 ships.

## The gap

`csvCell` in `lib/metadata/export.ts` implements RFC4180 quoting correctly but has no guard
against **CSV injection**: a cell whose first character is `=`, `+`, `-` or `@` is interpreted as
a formula by Excel, LibreOffice and Google Sheets when the file is opened. The OWASP mitigation
is to prefix such a value with a single quote.

## Why Phase 40 did not fix it here

Three reasons, and they are good ones:

1. **`buildCsv`'s only consumer is the distributor metadata export.** Prefixing an apostrophe to,
   say, an ISRC changes bytes that a third party parses. That is a delivery-affecting change
   wearing the costume of a security fix, and it belongs outside a phase whose scope is marker
   export.
2. **Phase 40 needs its guard to cover three formats**, including a tab-delimited file that
   carries a `.csv` extension and which spreadsheets will happily open. That guard belongs
   upstream in `sanitizeMarkerLabel`, not inside a cell-quoting function.
3. **Closing a gap in a shipped exporter deserves its own verification** against a real
   distributor import, not a drive-by in an unrelated phase.

## Residual risk — assess before acting

The exposure depends entirely on whether any **user-authored free text** reaches `buildCsv`. If
every field is a structured identifier (ISRC, UPC, ISWC, duration, territory code), the practical
risk is close to zero because those cannot begin with a formula character. If any field carries a
title, artist name, contributor name, or note, the risk is real — a track titled `=cmd|...` would
execute on open for whoever receives the delivery.

**Establish which before deciding urgency.** That audit is the first task, not the fix.

## Fix direction

Add the OWASP `'` prefix for values beginning `=`, `+`, `-` or `@`, applied before RFC4180
quoting. Order matters: normalise leading whitespace first, or a leading tab hides the formula
character from the check.

Then verify a real distributor import still parses the output, since the apostrophe is visible in
the delivered bytes.

## Related

Phase 40's own guard (`sanitizeMarkerLabel` in `lib/catalogue/take-export.ts`) is the pattern to
follow, including the whitespace-before-prefix ordering, which that plan calls out as
load-bearing.
