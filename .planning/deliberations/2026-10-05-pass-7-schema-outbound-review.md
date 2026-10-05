# Pass 7 — schema and outbound review (2026-10-05)

Read-only. No migrations run. **The corpus-wide column-privilege audit came back clean** — and
the pass found a money path nobody had looked at.

---

## The question this pass existed to answer: NO MORE SILENT NO-OPS

Migration 230's `REVOKE INSERT (work_id), UPDATE (work_id) ON tracks` was a silent no-op because
`tracks` carried the privilege at table level. **The concern was that it was not the only one.**

**It was.** Every other column-level control in the corpus — **35 of them** — has the required
preceding table-level revoke, and no later migration restores the privilege. Verified across
migrations 031, 035, 040, 043, 054, 058, 076, 080, 081, 083, 084, 093, 095, 106, 111, 113, 115,
145, 146, 160, 161, 162, 163, 164, 180, 184, 224 and 228.

084 is sound for the reason already established: migration 040 stripped that table's grants years
earlier. 230 is now compensated by 231's trigger, so it is a control-quality finding rather than
a live bypass.

**Production drift cannot be proven from a checkout.** The reviewer supplied two read-only
`information_schema` queries — a corpus-wide sweep and a targeted six-row proof for the 084 and
230 controls — which should be run once and the output kept as deployment evidence.

---

## NEW, and the most serious thing in this pass: `lyric_blocks` moves money and is client-writable

`ai_entries` is not alone. **Two other rights-bearing tables carry the same `FOR ALL` policy for
every work member:**

- **`lyric_blocks`** — migration 145 protects direct *text* updates, but **direct inserts,
  deletes, and changes to `author_user_id`, `author_kind`, performers and positioning remain
  possible.** `author_user_id` is documented in migration 135 as **"the fact that MOVES SPLITS."**
  A work member can therefore alter who authored a block, which by the project's own
  documentation changes who gets paid.
- **`work_versions`** — `FOR ALL` to every work member; recording provenance can be mutated or
  deleted outside the archive workflow, limited only by whatever FK happens to block a row.

**The contrast is instructive.** The schema already knows how to do this properly: `work_diary_events`
revokes client INSERT/UPDATE/DELETE; Song Passport values are service-written or protected by
append-only mutation-rejection triggers; master designations and release links reject UPDATE and
DELETE. The correct posture exists in this codebase — it was simply not applied to three tables.

---

## Both Pass 5 criticals confirmed independently

**Graduation can copy another target's identifiers.** Confirmed at `230:227-241`. Reach now
precise: **ISRC** is vulnerable whenever a Passport has multiple track targets; **UPC, label and
release date** whenever it has multiple project targets; **lyrics** is currently work-targeted so
not yet multiple, though the query is equally underspecified. Legacy discovery creates exactly
this shape — project-targeted UPC/date/label plus a track-targeted ISRC per track.

**`ai_entries` is rewritable.** Confirmed, and worse than reported: the diary trigger records
**INSERT only**, so updates and deletes leave no trace — while the code's own comment claims the
receipt is captured on *"a row nobody can edit afterwards."* That comment is false. And because
`resolveTrackAiProvenance()` returns `clear` on an empty list, **deleting every disclosure
produces a confident clearance.** The immutable diary does not save the gate, because the resolver
reads `ai_entries`, not the diary.

---

## New HIGH — the 230 backfill assumed a uniqueness constraint that does not exist

`230:146-151` joins `song_passport_release_links` by `track_id` assuming one matching chain. That
table is unique on `passport_id + master_designation_id` and on
`passport_id + vault_project_id + track_id` — **not on `track_id`.** Normal graduation produces
one link, so the applied backfill was almost certainly unambiguous, but nothing enforces it; two
Passports could link the same track and `UPDATE ... FROM` would pick nondeterministically.

A production check is supplied. Zero rows means the backfill had clean source data. The schema
still needs either `UNIQUE(track_id)` or an explicit policy for legitimate multi-link cases.

---

## Migration 231 — sound, with a side effect worth knowing

No browser-client spoof and no DML bypass found. `SECURITY DEFINER` does not change
`auth.role()`; no exposed function lets a client set `request.jwt.claims` or its role; migration
171 sets only `request.jwt.claim.sub`. Confirmed.

**But the FK's `ON DELETE SET NULL` also changes `work_id`.** If an authenticated owner deletes a
graduated work, the trigger can reject the FK-driven nulling and **abort the deletion**.
Fail-closed for provenance, and broader than the trigger's own message implies. Its wording should
say *trusted service-role or database session*, not imply PostgreSQL proves the caller is
specifically the graduation function.

---

## NULL is handled correctly. Empty is not.

No production caller reads `tracks.work_id` or invokes `resolveTrackAiProvenance()` yet, and a
null `workId` correctly short-circuits to `unresolved`. **But a non-null work with an empty entry
list returns `clear`.** There is no durable record separating *no AI was used*, *nobody answered*,
*disclosures were deleted*, and *the query returned an incomplete subset*.

Same epistemic defect as NULL-as-negative, one layer up — and combined with the mutable policy, it
is an exploitable clearance-laundering path rather than a theoretical one.

---

## Email — a send chokepoint, not a durable system

`lib/email/index.ts` is genuinely the only Resend instantiation. The artist-reopen broadcast has
unusually good claim leasing, stable idempotency and unsubscribe handling.

What is missing: no durable outbox, send-attempt ledger, provider message id, retry schedule,
backoff or dead-letter state. Idempotency keys are optional and most callers omit them. **Split
approval notifications and workspace invitations explicitly ignore delivery failure after
committing business state.** Bounce handling covers **HardBounce for curators only** — hard
bounces for account, collaborator, staff, workspace, split-sheet and waitlist mail are
acknowledged and discarded. No soft-bounce, complaint, delivered or suppression handling. No
global rate limit in `sendEmail()`. The bulk reopen route loops an unbounded result set inside one
request.

**No outbound SMS exists** — confirmed again, including `supabase/config.toml:152-180` where SMS
signup and the Twilio provider are disabled.

---

## Owner decisions this pass surfaces

- What constitutes a durable **negative** AI attestation — "no AI was used" as a recorded fact
  rather than an absence?
- Are AI disclosures permanently append-only, or may corrections supersede while preserving
  history?
- Which explicit Passport target is graduation meant to use?
- Is one release-link row per track an invariant? If so, enforce `UNIQUE(track_id)`.
- Which transactional email failures need a visible retry task rather than best-effort?
