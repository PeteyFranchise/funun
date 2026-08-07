# Split Sheet powered by Funūn — Approved Template Spec

**Status:** Approved structure (Pete, 2026-07-20). This file is the authoritative document spec for plan 17-09's renderer. It supersedes the ad-hoc layout shipped by 17-03.
**Source contract:** `/Users/peterzora/Desktop/Music/Music Contract Templates/Split_Sheet.doc` — "SONGWRITER/PUBLISHING SPLITS AGREEMENT" (Word 97 OLE, authored 2008-09-09, 229 words, 3 fixed co-writer blocks).
**Intake skill:** `.agents/skills/funun-contract-template-intake/` (repo-local, canonical).

> **Instance #1 of a repeatable artifact type.** Funūn will host a contract-template library (work-for-hire, producer agreements, sample clearances…). Every future template follows this same pipeline: source contract → `funun-contract-template-intake` skill → approved spec file like this one → renderer + DocuSeal field/role mapping → `vault_documents.type` value. See the ROADMAP "Contract Template Library" candidate for what generalizes and what is deliberately split-sheet-coupled.

## Contract audit (per the intake rubric)

**Document type:** split sheet — songwriter/publishing share confirmation.
**Collects:** date, composition title, artist, album title, record label, co-writer names + shares, and per-writer society / publishing designee / administrator / signature / date.
**Legally operative (KEEP NEUTRAL — preserved verbatim below):** the modification/amendment sentence and the acknowledgement/agreement sentence.
**Presentation (rebrandable):** the all-caps title, fixed 3-writer numbering, underscore fill-lines, ad-hoc whitespace.
**Dated/weak:** hardcoded to exactly 3 writers; no helper guidance; no master-ownership clarification; underscore lines instead of structured fields.

## Operative text — PRESERVED VERBATIM (do not reword)

> This Songwriter/Publishing split agreement may not be modified or amended except by writing and signed by all Co-writers named above.

> If the foregoing accurately represents the agreement between the Co-writers as to their respective ownership interests and shares of songwriting royalties payable in connection with the above-noted composition, please acknowledge your understanding and agreement by executing this contract in the appropriate space below.

Positional integrity check: both sentences contain positional references ("named above", "below") that remain accurate in the approved structure — the Split Breakdown table sits **above** the Agreement section, and the Writer Signature Details blocks sit **below** it. **No rewording required.**

## Approved document structure

1. **Title** — `Split Sheet powered by Funūn`
2. **Subtitle** — `Songwriter and Publishing Split Confirmation`
3. **Work Details** — Date · Composition Title · Artist Name · Album / Project Title · Record Label
4. **Split Breakdown** (table) — Writer Legal Name · Split Percentage · PRO / Society · Publishing Designee · Administrator (+ computed Total row)
5. **Agreement** — the two verbatim sentences above, in source order
6. **Writer Signature Details** — one block per writer: Co-writer Legal Name · PRO / Society · Publishing Designee · Administrator · Signature · Date
7. **Guidance Notes** — legal-name/PRO note, fallback guidance, master-ownership clarification

### Approved notes (verbatim)

- **Legal-name / PRO:** `Use your full legal name exactly as registered with your PRO. If you do not yet have a PRO, complete the field as "None yet" and update it later once affiliated.`
- **Master clarification:** `This split sheet confirms songwriting and publishing shares only. Master ownership and master revenue splits, if any, are not determined by this split sheet unless expressly stated in a separate written agreement.`

### Positioning guardrail

Funūn is the delivery/signing platform, **not a party** to the agreement. No document copy may imply the artist is signed to, published by, or represented by Funūn. "powered by Funūn" in the title and the existing confidential-use footer are the only brand marks.

## Data-model gap analysis

| Field | Source of truth today | Status |
|---|---|---|
| Composition Title | `split_sheets.song_name` | ✅ exists |
| Split Percentage | `split_sheet_parties.split_percentage` | ✅ exists |
| PRO / Society | `split_sheet_parties.pro` | ✅ exists |
| Date | — | ⚠️ derive (see open decision 5) |
| Artist Name | `artist_profiles.artist_name` when attached | ⚠️ needs capture when standalone |
| Album / Project Title | `vault_projects.title` when attached | ⚠️ needs capture when standalone |
| Record Label | `vault_projects.label` (migration 006) when attached | ⚠️ needs capture when standalone |
| **Writer Legal Name** | — | ❌ **new** (`name` today is professional/display name) |
| **Publishing Designee** | — | ❌ **new** |
| **Administrator** | — | ❌ **new** |

`ipi` and `role` exist in the schema but are **not** columns in the approved Split Breakdown. Retain in the DB (they feed CWR/PRO registration) but do not render — the approved five columns are exhaustive.

**Migration 063 (additive, human-gated push) must add:** `split_sheet_parties.legal_name`, `.publishing_designee`, `.administrator`; `split_sheets.artist_name`, `.album_project_title`, `.record_label`. All nullable — live mid-approval rows must not break. When a sheet is attached to a project, the three work-detail fields prefill from the project and remain editable; when standalone, they are captured in the builder.

## DocuSeal field / role mapping

**One signer block ⇄ one writer**, positionally indexed:

| Writer index | DocuSeal role | Text tags emitted in that writer's block |
|---|---|---|
| 0 | `Party1` | `{{Signature;role=Party1;type=signature}}` · `{{Date;role=Party1;type=date}}` |
| 1 | `Party2` | `{{Signature;role=Party2;type=signature}}` · `{{Date;role=Party2;type=date}}` |
| n | `Party{n+1}` | …same pattern |

- Role strings come from the existing `partyRoleTag(index)` helper (17-03) — the single shared contract between the PDF's text tags and the mint route's `submitters[].role`. Do not duplicate the string anywhere.
- **`type=date` is NEW.** The source contract has `Date:______` beside every signature; 17-03's renderer emitted only signature tags. Without it the executed document has no per-signature date, which the source requires.
- `submitters[].external_id` = `split_sheet_parties.id` (DocuSeal's documented binding pattern).
- `submitters[].metadata` = `{ split_sheet_id, initiator_id, party_id }` for webhook correlation.
- Submission name carries context for the embedded signing header: `Split Sheet powered by Funūn — {composition title}`.
- Writer count is dynamic (source was fixed at 3); tags are generated per party, so 2-writer and 6-writer sheets work identically.

**Assumption flagged for confirmation:** the PRO / Publishing Designee / Administrator values inside each signature block render as **static text**, not editable DocuSeal fields — because those values were already agreed during the approval stage (P17-01). A signer who disagrees objects and voids (P17-02) rather than silently editing the executed document. See open decision 3.

## Wording normalized for layout (presentation only)

| Source | Approved | Rationale |
|---|---|---|
| `SONGWRITER/PUBLISHING SPLITS AGREEMENT` (title) | Title `Split Sheet powered by Funūn` + subtitle `Songwriter and Publishing Split Confirmation` | Approved branding; source phrase survives in the subtitle |
| `COMPOSITION TITLE:` / `ARTIST:` / `ALBUM TITLE:` / `RECORD LABEL:` | Work Details labels (`Composition Title`, `Artist Name`, `Album / Project Title`, `Record Label`) | Sentence case; `Artist` → `Artist Name`, `Album Title` → `Album / Project Title` per approved structure |
| `CO-WRITERS:` + `(1) Name:___ Share___` | Split Breakdown table | Table replaces underscore lines; `Name`→`Writer Legal Name`, `Share`→`Split Percentage` |
| `Society: _____` | `PRO / Society` | Source word "Society" retained, "PRO" prepended for artist familiarity |
| `(1) Co-writer: ___` | Per-writer signature block, `Co-writer Legal Name` | Source label "Co-writer" retained |
| `Sig._____ Date:______` | `Signature` / `Date` with DocuSeal tags | Underscores → e-sign fields |

**No operative sentence was altered.** Only labels, casing, and layout changed.

## Helper text placement

The seven approved helper strings (Artist Name, Album/Project Title, Record Label, Writer Legal Name, PRO/Society, Publishing Designee, Administrator) are **input guidance**, not document content. They belong in the Funūn builder UI (`SplitSheetBuilder`) beside each input. The executed PDF is a signed legal record — helper prompts on it would be noise. Only the three approved **Notes** (section 7) print on the document.

## Blockers

1. **FONT — hard blocker.** The title `Split Sheet powered by Funūn` contains `ū`, which today renders as `Funkn` (the shipped Unicode bug). **Plan 17-08 must land before this document can be rendered correctly.** Same applies to any writer with a non-Latin-1 legal name — precisely the field this document exists to state accurately.
2. **Migration 063** — the six new fields above; human-gated push.

## Resolved decisions (Pete, 2026-07-20) — all six closed

1. **Prepared-by line: YES.** Print `Prepared by: {initiator name} · sent through Funūn` in Work Details. Rationale: the document is the artifact that survives into a chain-of-title review years later; the email does not. "sent through Funūn" preserves the platform-not-a-party guardrail. Pete's note: the splits themselves are settled by the approve/counter process, so the preparer line is provenance, not authorship of the numbers — it must not read as "this person decided the splits."
2. **Subtitle stays `Confirmation`.** The operative text retains "agreement"/"contract" verbatim, so the binding language is unchanged; the softer subtitle is presentation and accurate (parties confirm shares already agreed).
3. **Signature-block fields are LOCKED TEXT — with two additions:**
   - **(3a) Auto-populate from Funūn data.** PRO / Society, Publishing Designee, and Administrator prefill from the signer's existing Funūn data rather than being retyped. Prefill chain: signer is a Funūn user → `artist_profiles`; else matched collaborator → `collaborators`; else manual entry in the builder. **Availability check performed:** `pro` ✅ and `publisher` ✅ (→ Publishing Designee) exist on BOTH `artist_profiles` (migration 020) and `collaborators` (migration 018). **`administrator` exists on NEITHER** — see the new-field requirement below. Legal name: `artist_profiles` stores `legal_first_name`/`legal_middle_name`/`legal_last_name`/`legal_name_suffix` (migration 021), so Writer Legal Name composes from those; `collaborators` has no legal-name column.
   - **(3b) Pre-signature review prompt.** Display copy near the signature action telling the signer to verify their own details before completing. Suggested wording (adjust in build): `Check that your legal name, PRO, publishing designee, and administrator are correct before you sign. If anything is wrong, decline and let the sender know — these details flow into your PRO and publisher registrations.` It must point at the objection/void path (P17-02), NOT offer inline editing — editing mid-execution is exactly what locked text prevents.
4. **Standalone work details are OPTIONAL.** Print an em-dash when absent. Never block a signature over an album title that may not exist yet; the approved helper text already tolerates "TBD". Values backfill if the sheet is later attached to a project.
5. **Date = execution date**, stamped when the final signature lands. Guarantees the document is never dated earlier than the signatures beneath it, and matches the legally meaningful date (when the agreement took effect). Per-signer date lines still record individual signing dates.
6. **Legal name + p/k/a.** Render `Jessica Ramirez (p/k/a Nova)` when a professional name exists and differs; legal name alone otherwise. `p/k/a` is standard industry notation — registration accuracy plus human recognizability.

## Revised new-field requirement (migration 063)

Decision 3a changes the field list. Migration 063 must add, all nullable/additive:

**On `split_sheet_parties`** (the values as agreed for THIS sheet — snapshotted, since profile data can change after signing):
`legal_name`, `publishing_designee`, `administrator`

**On `artist_profiles`** (so the prefill in 3a is possible at all):
`administrator` — **the only prefill source that does not exist today.** Without it, "auto-populate from Funūn settings" is impossible for that field and every signer would retype it. Also surface it in the artist's rights/settings UI alongside the existing `pro` / `ipi` / `publisher` / `mlc_id` fields, and follow migration 040's column-privilege doctrine for the new column.

**On `collaborators`** (optional, recommended): `administrator`, so non-user collaborators picked via CollaboratorPicker prefill too.

**Settings UI — CONFIRMED IN SCOPE (Pete, 2026-07-20).** Adding the column is not enough; artists need somewhere to enter it once. Three coordinated edits, all following the existing `publisher` field as the exact precedent:
- `components/profile/ProfileForm.tsx` — add an Administrator input in the same rights group as PRO / IPI / Publisher / MLC ID, with the approved helper text: `Enter your publishing administrator if you have one. If you do not have one yet, enter "None".`
- `app/api/profile/route.ts` — add `'administrator'` to the `EDITABLE_FIELDS` allowlist (it sits directly after `'publisher'` at line ~32). Without this the field silently fails to save — the allowlist is mass-assignment protection, so an unlisted field is dropped, not rejected loudly.
- `app/(artist)/settings/page.tsx` — surface it wherever the rights block renders.

Verification for this piece: an artist can set Administrator in settings, and a new split sheet prefills it for that artist without retyping.

**On `split_sheets`:** `artist_name`, `album_project_title`, `record_label` (per decision 4, all optional).

**Snapshot rule:** party fields are copied onto the split sheet at creation and never re-read from the profile afterward — an executed document must not silently change because someone edited their profile later.
