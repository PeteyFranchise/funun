# Adobe Audition marker file — what we know, what we're guessing, and how to check

Status: **corroborated, not confirmed.** Nobody who has worked on this phase has Audition
installed. Read this if you do — this document exists to get you from "I have Audition open" to
"I know whether Funūn's export is correct" in eight steps, with the exact commands to run at each
one.

If you have never seen phase 40 before: Funūn lets a writer export a take's comments as a marker
file a DAW can import. Audition is one of three target formats (the other two — Audacity and CSV —
are fully confirmed and already shipping). Audition's is the one format nobody here could
personally verify, because doing so requires Adobe Audition, and this environment doesn't have it.

## 1. What Funūn writes

The serializer is `lib/catalogue/take-export-audition.ts`, specifically `renderAuditionMarkers()`.
Plainly, in one place:

- The file has a `.csv` extension, but the delimiter is a **TAB**, not a comma. This is the single
  most surprising fact about the format — Audition's own export is tab-delimited-with-a-`.csv`-name.
- Six columns, in this exact order, with a header row:
  `Name	Start	Duration	Time Format	Type	Description`
- Times are written as `M:SS.mmm` — minutes with no leading zero, a colon, two-digit seconds, a
  dot, three-digit milliseconds. `0:09.000` means nine seconds. `1:30.000` means one minute thirty
  seconds.
- The `Time Format` column always holds the literal word `decimal`. Despite the name, the Start and
  Duration values are **not** plain decimal seconds — they're the `M:SS.mmm` strings above. Omitting
  `decimal` is reported to cause import errors, so it's written unconditionally.
- The `Type` column always holds the literal word `Cue`.
- `Description` is always written as an empty sixth field — a trailing tab, not an omitted column.

And the one paragraph that bites hardest: **the third column, `Duration`, is a LENGTH, not an end
time.** Every other format in this phase (Audacity, CSV, the database row itself) stores an end
timestamp. Audition is the one outlier. A point marker's Duration is `0:00.000`. A range marker
from 1:12.000 to 1:18.000 has a Duration of `0:06.000` — six seconds, not "1:18.000 written into the
Duration column." Writing the end time into Duration produces a file that imports without error and
puts every range marker at the wrong length. There is no error message for this — it looks fine
until someone notices the marker is ten times too long.

## 2. How we know this

Nobody who worked on this phase ran Audition and watched it write a file. The shape above comes
from three independent third-party sources that agree with each other:

- **A community forum thread** (community.adobe.com, Audition discussions) that quotes a literal
  exported header row and two example rows, including the explicit statement "the variables aren't
  comma separated, they're tab separated."
- **`csvtocue.py`** (`github.com/zombak/csvtocue`), an open-source CUE-sheet converter that
  hard-codes tab-splitting (`oneline.split("\t")`) against real Audition exports and unconditionally
  discards row zero as a header.
- **`markers2markdown`** (`github.com/nonoesp/markers2markdown`), an open-source chapter-markdown
  generator whose `index.js` does the same tab-split and indexes `Description` at array position 5
  — which only holds true if there are exactly six columns in exactly this order. This independently
  cross-validates the column count and order the forum thread claims.

None of these three is Adobe. None of them is a person on this project who has run Audition. They
agree with each other, which is why the format is buildable and testable right now rather than
blocked — but "three sources agree" is not the same claim as "someone watched Audition write this
file," and this document exists to close that gap.

## 3. What is inferred, not observed

Three specific facts are marked `INFERRED` in the source module
(`lib/catalogue/take-export-audition.ts`) because no corroborating source directly observed them.
Each is repeated here, with the consequence if it's wrong:

- **Encoding.** INFERRED: UTF-8. Adobe applications on Windows sometimes default to UTF-16 for
  exported text files. If wrong: accented or non-Latin display names in a marker label could
  mis-render, or Audition could fail to import the file cleanly.
- **Line endings.** INFERRED: CRLF (`\r\n`), with the file ending in one. If wrong: the import may
  see a trailing blank row, or Audition may refuse the file outright.
- **The `Type` literal for a RANGE marker.** INFERRED: `Cue` — the same literal seen in every
  observed example. But every corroborating example found in research was a **point** marker; none
  showed a range marker's row. This is inferred on the strength of Adobe's own documentation, which
  states the only difference between a point marker and a range marker is that a range marker
  carries a duration — nothing in that statement says the `Type` column changes. If wrong: a range
  marker could import as a point, or fail to import at all.

There's a smaller, related open question that doesn't get its own `INFERRED` tag because both
choices are defensible: whether Audition's own export writes a trailing tab for an empty
`Description` field, or ends the line right after `Type` with no sixth field at all. Funūn always
writes six tab-joined fields, on purpose — both third-party parsers above index fields
**positionally**, so an unexpected extra empty field is far less likely to break either of them than
a missing one would be.

## 4. The procedure that settles it

Do this one step at a time. Record what each step actually outputs before moving to the next —
don't skip ahead assuming a later step will confirm or deny what an earlier one already told you.

**Before step 3: the npm banner gotcha.** Plan 40-03 (the plan that built this serializer) found
that on this repo's npm (11.12.1), a plain `npm run <script>` prints its own run-banner —
`"> funun@2.0.0 export:audition-sample\n> tsx scripts/print-audition-sample.ts\n\n"` — to **stdout**
before the script's own output. If you redirect that into a file, the banner text lands inside it
and corrupts the exact byte comparison this whole procedure exists to perform. Use
`--silent`, or bypass npm entirely with `npx tsx`. Step 3 below states both forms; use either, never
the plain `npm run export:audition-sample > file` form.

1. **In Audition, create three markers** on any audio file: a point marker at `0:09.000`, a second
   point marker at `1:30.000`, and a range marker starting at `1:12.000` and running for six
   seconds (ending at `1:18.000`). Name them anything you like — the names don't need to match
   Funūn's sample, since step 7 explains why.

2. **Export the marker list to CSV** from Audition's own Markers panel export function. Save it
   somewhere you can find again — for example `~/Downloads/audition-export.csv`.

3. **Produce Funūn's bytes for the same three markers.** Run exactly one of:
   ```
   npm run export:audition-sample --silent > /tmp/funun-audition.csv
   ```
   or
   ```
   npx tsx scripts/print-audition-sample.ts > /tmp/funun-audition.csv
   ```
   Do not run `npm run export:audition-sample` without `--silent` and redirect that — see the
   gotcha above.

4. **Compare encoding.** Run:
   ```
   file /tmp/funun-audition.csv
   file ~/Downloads/audition-export.csv
   ```
   Note anything either report says about UTF-16 or a byte-order mark (BOM). This answers the
   Encoding question in section 3.

5. **Compare line endings and the trailing tab.** Run:
   ```
   od -c ~/Downloads/audition-export.csv | head -5
   ```
   Look for `\r  \n` (CRLF) versus `\n` alone (LF) at the end of each line, and whether a `\t`
   appears immediately before that line terminator on each row (the trailing-tab question from
   section 3). This answers the Line endings question.

6. **Confirm the column count.** Run:
   ```
   awk -F'\t' '{print NR": "NF}' ~/Downloads/audition-export.csv
   ```
   Every line — including the header — should report `6`. If any line reports 5, Audition may be
   omitting the trailing empty `Description` field rather than writing it.

7. **Diff the structure.** Run:
   ```
   cmp /tmp/funun-audition.csv ~/Downloads/audition-export.csv
   ```
   This will very likely report a difference, and that's expected on the first attempt — marker
   NAMES will differ from Funūn's sample (`Point marker one`, `Point marker two`, `Range marker`)
   unless you typed matching names in step 1. Note the byte offset `cmp` reports and look at what's
   actually different: if it's only inside the `Name` column text, the structure matches. If the
   difference falls in `Start`, `Duration`, `Time Format`, or `Type`, that's a real structural
   mismatch worth investigating with `od -c` on both files side by side.

8. **Re-import and confirm the range marker's length.** Import `/tmp/funun-audition.csv` into a
   FRESH Audition session (not the one you exported from). Confirm three markers appear, that the
   two point markers sit at 9 seconds and 1 minute 30 seconds, and that the range marker is **six
   seconds long** — not sixty-six seconds, not the difference between the wrong numbers. This is the
   single check that would catch Duration being written as an end timestamp instead of a length.

### What each outcome means

- **Everything matches** (structure identical in steps 4–7, correct import in step 8) → ship the
  Audition option as built. Go to section 6 below and mark each `INFERRED` claim `CONFIRMED` with
  today's date, in both this document and the source module's comments.
- **A localized mismatch** in encoding (step 4), line endings or the trailing tab (steps 5–6), or
  the `Type` literal for the range marker (visible in step 7's diff, or step 8's import behavior) →
  this is a correction to `renderAuditionMarkers` or `auditionTime` in
  `lib/catalogue/take-export-audition.ts`, informed by the real bytes you just captured. Do not
  guess at the fix before this point — see the prohibition in section 5.
- **Anything broader** — the file doesn't import at all, or multiple things disagree at once — is
  the signal to remove the option rather than debug it live. See section 5.

## 5. If it fails

There are exactly two remediations, in order of preference:

1. **Correct the serializer against the real bytes.** Fix `renderAuditionMarkers` or
   `auditionTime` in `lib/catalogue/take-export-audition.ts` to match what step 7 or step 8 showed
   you, update its byte-exact tests (`lib/catalogue/take-export-audition.test.ts`) to match, and
   re-run this procedure from step 3.

2. **Remove the option.** This is E-12's explicitly pre-approved fallback, and it costs exactly one
   line plus one number:
   - Delete the Audition entry from the `FORMAT_OPTIONS` array in
     `components/catalogue/TakeMarkerExport.tsx`.
   - Revert the expected entry count in `__tests__/writer-room-take-marker-export-ui.test.ts` from
     3 back to 2.

   The serializer, its tests, and the sample script all stay in the tree either way — nothing about
   removing the UI option requires deleting `lib/catalogue/take-export-audition.ts`. The format can
   follow later once whatever went wrong is understood.

No speculative fix should be made before this procedure has been run against real bytes. A guess
made now, without a real Audition export in hand, is exactly the failure mode this document exists
to prevent.

## 6. Marking a claim CONFIRMED

If the procedure in section 4 fully matches, change each `INFERRED` marker — in this document's
section 3 and in `lib/catalogue/take-export-audition.ts`'s header comment — to `CONFIRMED
(YYYY-MM-DD)`, naming the date the procedure was run. Leave the reasoning in place; only the
confidence label changes. Do not leave a claim ambiguous between the two states — an inferred fact
that quietly reads as confirmed, with no one having actually checked it, is worse than an inferred
fact that still says so.
