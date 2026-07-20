# Font Provenance — Noto Sans (SIL Open Font License)

Vendored to fix ESIGN-15 / P17-08: `@react-pdf/renderer`'s standard-14
fonts (Helvetica/Helvetica-Bold) use WinAnsi encoding and silently
corrupt any character outside Latin-1 (`ć` dropped, `ū` mangled — see
`.planning/phases/17-split-sheet-esign/17-PROVIDER-VERIFICATION.md`,
bug #1). These two files are the unmodified upstream static TrueType
instances. Registered once in `lib/vault/pdf/fonts.ts`.

## NotoSans-Regular.ttf

- **Source URL:** https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf
- **Retrieved:** 2026-07-20
- **SHA256:** `478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823`
- **fontkit-reported family / subfamily:** `Noto Sans` / `Regular`
- **Modification statement:** Unmodified upstream binary — not renamed, not subsetted, not re-hinted. Unmodified redistribution keeps this outside the OFL Reserved Font Name restriction.

## NotoSans-Bold.ttf

- **Source URL:** https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf
- **Retrieved:** 2026-07-20
- **SHA256:** `1df075a380fc7cb898acf64c1f7b3b4dd780de3caa860178bf929de35817a913`
- **fontkit-reported family / subfamily:** `Noto Sans` / `Bold`
- **Modification statement:** Unmodified upstream binary — not renamed, not subsetted, not re-hinted. Unmodified redistribution keeps this outside the OFL Reserved Font Name restriction.

## License

`assets/fonts/OFL.txt` (SIL Open Font License 1.1) is committed alongside
these files as required by the license. Sourced from
https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/OFL.txt
(mirrors the license text distributed with the upstream Noto release;
identical body to the license published at https://scripts.sil.org/OFL).

## Verification performed at vendoring time

Both files were opened with `fontkit` (already a transitive dependency
of `@react-pdf/renderer`) and confirmed to:

- Report family name `Noto Sans` and the expected subfamily (`Regular` / `Bold`).
- Contain no `fvar` table — both are static instances, not variable fonts. `@react-pdf/renderer`'s weight-based font selection is unreliable against variable sources, so static instances are required.
- Report a glyph (`hasGlyphForCodePoint`) for every codepoint in the
  required-coverage set used by `lib/vault/pdf/fonts.test.ts`: U+0107
  (ć), U+016B (ū), U+00F1 (ñ), U+00E9 (é), U+00F3 (ó), U+00FC (ü),
  U+0161 (š), U+017C (ż), U+011F (ğ), U+00B7 (·), U+2014 (—), U+2019 (’).
