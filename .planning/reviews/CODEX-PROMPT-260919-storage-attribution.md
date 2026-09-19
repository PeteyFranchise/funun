---
type: review-prompt
reviewer: codex
created: 2026-09-19
status: complete
subject: storage attribution model + upload-intent rollout
source:
  - .planning/todos/pending/2026-09-14-storage-upload-admission-bypass.md (audit M-01)
  - .planning/quick/260916-storage-usage-detection-cron/SUMMARY.md (migration 227)
---

# Codex review prompt — storage attribution and the upload-intent rollout

## Why this exists

Applying migration 227 (the M-01 detection stopgap) surfaced four "unattributed"
storage objects. Chasing what they actually were turned into a finding that
reframes M-01 itself: **upload intents are not unbuilt design work — six
upload-intent routes already exist in this codebase**, including one for
`track-audio`, the very bucket M-01 says needs converting.

That raises a question bigger than the errand: if intents are already everywhere,
why is the blanket Storage grant still in place, and is path-based attribution
the right accounting model at all when the database already knows every owner?

This prompt asks Codex to settle it by reading the code rather than by my
inference. **Several claims in the prompt are explicitly flagged as unverified so
Codex challenges the framing instead of inheriting it** — the failure mode of a
review prompt is that it launders the author's assumptions into an
authoritative-sounding answer.

## The prompt — copy from here

```text
# Review request: storage attribution and the upload-intent rollout in Funūn

You are reviewing a Next.js 15 + Supabase codebase (repo root = the Funūn app).
Read the code before answering. Verify every claim below — several are my
inferences from a shallow pass and may be wrong. Say so plainly where I'm wrong.

## Background

Audit finding M-01 says: Supabase Storage RLS grants authenticated users direct
INSERT/UPDATE under any path beginning with their own user id, and a direct
browser write never invokes `claim_upload_admission` in
`lib/security/upload-admission.ts`. So the server's daily-count, byte-quota and
concurrency limits do not bind a direct upload. Todo:
`.planning/todos/pending/2026-09-14-storage-upload-admission-bypass.md`.

A stopgap shipped 2026-09-19 (migration 227 +
`app/api/cron/storage-usage-check/route.ts`): a daily cron totals bytes per
account from `storage.objects`, grouping by the FIRST PATH SEGMENT, and alerts
above a 25 GB warning band. Detection, not prevention.

## What I verified against production and the code

1. `storage.objects` currently holds ~0.047 GB total. Four objects sit under a
   non-UUID prefix: `ideas/{ideaId}/{recordingId}.webm`.
2. `lib/ideas/schema.ts:89` `buildIdeaRecordingPath()` builds that path. Idea
   recordings are keyed by IDEA, not by user — unlike the `{userId}/...`
   convention the rest of the app uses.
3. Ownership IS recorded, in the database, not the path:
   `supabase/migrations/169_ideas_inbox.sql` — `ideas.user_id` (NOT NULL),
   `idea_recordings.created_by`, and `idea_recordings.audio_size`.
4. SIX upload-intent routes already exist, each issuing
   `createSignedUploadUrl(path, { upsert: false })` with a server-chosen path:
   - `app/api/ideas/[ideaId]/recordings/upload-intent/route.ts`
   - `app/api/vault/[projectId]/tracks/[trackId]/audio/upload-intent/route.ts`
   - `app/api/works/[workId]/versions/upload-intent/route.ts`
   - `app/api/works/[workId]/recording-sessions/[sessionId]/clips/upload-intent/route.ts`
   - `app/api/works/[workId]/recording-sessions/[sessionId]/handoffs/upload-intent/route.ts`
   - `app/api/admin/playbook/media/upload-intent/route.ts`
5. At least one client still writes direct:
   `components/vault/StemsUpload.tsx:200` calls `.storage.from(BUCKET).upload()`.
   Also grep-positive for `.storage.from(`: `components/vault/TrackList.tsx:309`,
   `components/playbook/PlaybookMediaUploader.tsx`,
   `components/catalogue/RecordOverBeatStudio.tsx`. NOTE: `uploadToSignedUrl` is
   the correct second half of the intent pattern and also matches that grep, so
   this list conflates governed and ungoverned writes. Disambiguate it properly.

## What I suspect but did NOT verify — check these

A. The ideas intent route rate-limits (80 per 15 min per user) and caps per-file
   size at `MAX_BYTES` (50 MB in `lib/catalogue/audio-mime.ts`), but I saw no
   `claim_upload_admission` call. If true, that path permits roughly 4 GB per
   15 minutes per user with no aggregate byte quota at all — so the intent
   pattern may govern WHO and WHERE without governing HOW MUCH. Check all six
   routes for this.
B. The M-01 todo is written as though upload intents are unbuilt design work.
   Given six of them exist, I believe the real blocker to revoking the blanket
   Storage grant is a small number of remaining direct-write clients, not a
   design gap. Confirm or refute.
C. There may be path conventions beyond `{userId}/...` and `ideas/...` that I
   missed — I only listed the top 100 entries at the root of four buckets.

## The questions I actually want answered

1. **Is path-based attribution the right model at all?** Migration 227 infers
   the owner by parsing the first path segment. The database already knows the
   owner for every governed upload. Should storage accounting be DB-driven,
   with `storage.objects` used only for RECONCILIATION — i.e. the real signal
   being "objects the database does not account for"? Argue the tradeoff; note
   that the original rationale for reading the bucket was precisely that a
   bypassing upload is one the app does not know about.
2. **Full inventory.** Which write paths are governed by an intent, and which
   write direct? For each ungoverned one, what specifically must change before
   `track_audio_insert_own` / `track_audio_update_own` and the equivalent
   `vault-assets` / `vault-contracts` policies can be revoked?
3. **Do the intents enforce quota, or only authorization?** Per-route answer on
   whether `claim_upload_admission` is invoked, and what an authenticated user
   could consume through each route in an hour if they tried.
4. **Orphan reconciliation design.** Concretely: what should compare bucket
   contents against the owning tables, how should it run given `storage.objects`
   is not PostgREST-readable, and what should it do about a hit? Include the
   completion-callback race — an object uploaded via a signed URL whose
   `/complete` call never arrives.
5. **Sequencing.** The todo insists intent-aware clients ship BEFORE the grants
   are revoked. Given what you find, propose the actual ordered rollout, calling
   out anything that breaks if done in the wrong order.

## Constraints

- Migrations are human-gated. Propose SQL; do not claim anything is applied.
- Production is at migration 227.
- `main` is protected; work ships via PR.
- Alert content must be summary-only — no raw user records or file paths
  (internal rule T-32-06).
- Do not propose changes to `ideas/` path shape casually: recordings are
  collaborative (`idea_members`), which is why they are keyed by idea.

## Output format

Return your entire report in ONE copy-paste-ready fenced code block so I can
paste it back into Claude Code without reformatting. Inside that block use
markdown. Structure it as:

- VERDICT — 3 sentences max: is the current attribution model sound?
- CORRECTIONS — every claim of mine above you found to be wrong, with evidence
- INVENTORY — a table: write path | governed by intent? | quota enforced? | file
- ANSWERS — one section per numbered question
- RECOMMENDED SEQUENCE — ordered steps, each with what breaks if skipped
- CONFIDENCE — what you verified by reading code vs what you inferred

Cite `file:line` for every factual claim. Where you are guessing, say so.
```

## Copy to here

## Response

**Received 2026-09-19 — TRUNCATED.** The report arrived through VERDICT, CORRECTIONS,
INVENTORY and Answers 1-2. **Answers 3, 4 and 5, plus RECOMMENDED SEQUENCE and
CONFIDENCE, were cut off** and must be requested again.

### Dispositions — verified in-code before acceptance

Four high-impact claims were re-checked against the repository and production
rather than accepted on the report's authority. **All four hold.**

| # | Claim | Disposition | Evidence |
|---|---|---|---|
| C1 | 227 misattributes work/room/track ids as accounts | **ACCEPTED — defect confirmed** | `lib/catalogue/audio-mime.ts:125-137` states the no-owner-prefix choice is deliberate; production cross-reference returned 2 real accounts, 5 work ids, 1 unknown out of 8 |
| C3 | Only 1 of 6 intent routes calls upload admission | **ACCEPTED** | Only `vault/[projectId]/tracks/[trackId]/audio/upload-intent` matches; the other five score zero |
| C6 | `StemsUpload` holds both remaining direct writes | **ACCEPTED** | `components/vault/StemsUpload.tsx:118` (TUS, `x-upsert: true`) and `:200` (`.upload`, `upsert: true`) |
| C7 | Revoking the policies also breaks authenticated server routes | **ACCEPTED — materially changes sequencing** | `assets/route.ts:97`, `profile/avatar/route.ts:85`, `contracts/verify/route.ts:94` all write storage through `createApiClient()` |

C9 is correct and worth keeping: Codex did **not** query production. The
0.047 GB figure and the misattribution cross-reference are this repo's own
probes, not the reviewer's.

### The finding that outranks the rest

C1 is not a labelling nit. Writer's Room uploads land under `{workId}/...`, so a
heavy user's bytes fragment across many work ids and no group need cross 25 GB.
**The detector misses precisely the user it was built to catch.** Recorded on
`.planning/quick/260916-storage-usage-detection-cron/SUMMARY.md`.

### Still outstanding

- The truncated sections — orphan reconciliation design and the ordered rollout
  are the two most decision-relevant parts and neither arrived.
- A decision on whether to repair 227 in place (group by bucket + resolve owners
  through the database) or go straight to the ledger model Codex recommends.

---

# Continuation prompt — sent 2026-09-19 to recover the truncated sections

The first report died **mid-SQL-block**, which is the worst place to cut: it
reads as complete until you look for the closing fence. The continuation
therefore ends with an explicit instruction to stop at a section boundary and
name what remains rather than truncate again.

It also feeds Codex two things it did not have: confirmation that four of its
claims were independently re-verified in-code, and the production
cross-reference data — it said plainly that it never queried production, and
that honesty is worth rewarding with the data rather than letting it keep
guessing.

## The prompt — copy from here

````text
# Continuation: the rest of the storage attribution review

You reviewed Funūn's storage attribution model and upload-intent rollout earlier.
Your report was TRUNCATED after Answer 2 — the policy-removal SQL block was cut
mid-block and nothing after it arrived. This asks for the remainder.

Do not repeat VERDICT, CORRECTIONS or INVENTORY. They came through intact and
have been accepted into the repo.

## Your findings were independently re-verified — four for four

Before acting on your report I re-checked your highest-impact claims in-code
rather than accepting them. All held:

- C1 (227 misattributes non-account UUIDs) — CONFIRMED, and see the production
  data below, which you did not have.
- C3 (only one of six intent routes calls upload admission) — CONFIRMED. Only
  `vault/[projectId]/tracks/[trackId]/audio/upload-intent` references it; the
  other five score zero.
- C6 (`StemsUpload` holds both remaining browser-direct writes) — CONFIRMED at
  `components/vault/StemsUpload.tsx:118` (TUS, `x-upsert: true`) and `:200`
  (`.upload()`, `upsert: true`).
- C7 (revoking the policies also breaks authenticated server routes) — CONFIRMED
  at `app/api/vault/[projectId]/assets/route.ts:97`,
  `app/api/profile/avatar/route.ts:85`, `app/api/contracts/verify/route.ts:94`.

Your C9 was correct and worth keeping: you did not query production. I did.

## Production data you did not have

Every UUID first segment returned by `storage_usage_over_threshold(0)` was
cross-referenced against `auth.users` and `public.works`:

```
segments migration 227 reports as ACCOUNTS: 8
  real accounts: 2 | work ids: 5 | unknown: 1
```

The largest row — 36,450,479 bytes across 5 objects — is a WORK ID. One segment
matched neither table and is genuinely unidentified. Total storage across all
prefixes is ~0.047 GB, against a 25 GB warning band, so nothing is close to
alerting today.

The operational consequence I drew from this, which I want you to confirm or
refute: because Writer's Room uploads land under `{workId}/...`, a heavy user's
bytes fragment across many work ids and no single group need ever cross the
threshold — so the detector systematically misses the exact user it exists to
catch, rather than merely mislabelling output.

## What I still need — pick up at Answer 3

3. **Do the intents enforce quota, or only authorization?** Your INVENTORY gave
   rate limits per route. Complete it: for each of the six intent routes, what
   could a single authenticated user cause to be stored in one hour if they
   deliberately tried, in bytes? State assumptions. Then say which of those
   numbers you consider unacceptable for a beta with a handful of users.

4. **Orphan reconciliation design.** Concretely:
   - what compares bucket contents against owning tables,
   - how it runs given `storage.objects` is not PostgREST-readable,
   - how it handles the completion-callback race — an object uploaded via a
     signed URL whose `/complete` call never arrives,
   - how it distinguishes a genuine orphan from an in-flight upload,
   - and what it should DO on a hit (alert only? quarantine? delete after a
     grace period? who decides?).

5. **Sequencing.** The ordered rollout, given C7 means server routes must move
   to the service client before any policy is revoked. Each step with what
   breaks if it is skipped or reordered.

## Three questions added since your report

6. **Repair 227 in place, or skip to the ledger?** Two candidate paths:
   (a) a migration 228 that groups by `(bucket_id, first_segment)` and resolves
   ownership through the database — `works.user_id`, `ideas.user_id`, playbook
   rooms, and `{userId}/...` paths as themselves; or (b) leave 227 as a raw
   byte-counter, mark it explicitly not-a-detector, and build the ledger as part
   of the intents work. Recommend one and give the SQL for whichever you pick.
   Note that 227 is already applied to production, so (a) means a new migration,
   not an edit.

7. **Whose storage is a collaborative work's?** `works` has an owner and
   `work_versions` records an uploader; `ideas.user_id` and
   `idea_recordings.created_by` are the same split. For quota and billing,
   should bytes attribute to the container owner or the uploader? Give the
   argument both ways and a recommendation — including what happens when a
   collaborator is removed, and when a work is transferred or deleted.

8. **Restate the policy-removal SQL in full.** Your Answer 2 block was cut off
   after `COMMIT;`. Include any accompanying grants or replacement policies, not
   just the DROPs, and say explicitly what must already be true before it is
   safe to run.

## Constraints, unchanged

- Migrations are human-gated. Propose SQL; never claim anything is applied.
- Production is at migration 227, and 227 IS applied — a fix is a new migration.
- `main` is protected; work ships via PR.
- Alert content is summary-only — no raw user records or file paths (T-32-06).
- Do not casually propose reshaping `ideas/` or `{workId}/` paths. Both are
  deliberate: see the comment at `lib/catalogue/audio-mime.ts:125-137`
  explaining that an owner-prefixed path would make migration 004's storage
  policies reject a legitimate collaborator.

## Output format

Return the entire response in ONE copy-paste-ready fenced code block so I can
paste it back into Claude Code without reformatting. Markdown inside. Structure:

- CONFIRM-OR-REFUTE — the fragmentation consequence I drew above, in 3 sentences
- ANSWERS — one section per question 3 through 8
- RECOMMENDED SEQUENCE — ordered steps, each with what breaks if skipped
- CONFIDENCE — what you verified by reading code vs what you inferred

Cite `file:line` for every factual claim. Where you are guessing, say so. If you
cannot fit it all, stop at a section boundary and say which sections remain
rather than truncating mid-block.
````

## Copy to here

## Second response — received 2026-09-19, TRUNCATED AGAIN

Arrived: CONFIRM-OR-REFUTE, and Answer 3 complete (per-route hourly table, the
fail-open caveat, the beta-acceptability list). **Cut off mid-`CREATE TABLE`
inside Answer 4's `storage_object_ledger` DDL.** Still missing: the rest of
Answer 4, Answers 5-8, RECOMMENDED SEQUENCE, CONFIDENCE.

### Dispositions — Answer 3

| # | Claim | Disposition | Evidence |
|---|---|---|---|
| A3-1 | Five intent routes fail **open** on a limiter error | **ACCEPTED — highest value-per-effort finding in the review** | `lib/security/rate-limit.ts:48,51` return `options.failClosed === true`, so an unset flag yields `false` = not limited. None of the five passes it |
| A3-2 | Routes validate a declared 50 MB the storage layer never enforces | **ACCEPTED** | `track-audio` ceiling is 262,144,000 bytes (`supabase/migrations/041_track_audio_stems_config.sql:16`); the signed URL receives only path and `upsert` |
| A3-3 | The size gate is post-hoc and caller-triggered | **ACCEPTED** | `.../clips/complete/route.ts:46-48` does remove an oversized object — but only when `/complete` is called, which an abuser simply omits |
| A3-4 | Fragmentation defeats the detector | **ACCEPTED** (already confirmed independently) | Production cross-reference: 2 real accounts, 5 work ids, 1 unknown |

### Where I would soften Codex's framing

The hourly ceilings (clips at ~125 GB/h, ideas at ~84 GB/h) are **authorization
limits, not achievable throughput** — bandwidth binds long before them, and a
typical residential connection cannot approach those numbers. Codex labelled
them upper bounds under stated assumptions, which is honest, but the figures
read more alarming than the realistic exposure for a beta.

The unconditional part is the sharper finding and needs no attacker at all:
**every one of these routes validates a size the storage layer never enforces.**
Declare 50 MB, store 250 MB. That is true of every upload, every day, right now.

### The finding that breaks the codebase's own stated contract

`lib/security/rate-limit.ts:11-14` states the policy in its own header:

> Low-cost onboarding checks retain the default fail-open behavior so a limiter
> outage does not lock out legitimate signups. Abuse-sensitive or fan-out writes
> pass `failClosed: true`, preventing a database/limiter outage from turning
> into an unlimited messaging channel.

Five upload-intent routes are abuse-sensitive writes. None passes the flag. This
is not a reviewer's preference being asserted over the codebase — it is the
module's documented contract not being met at five call sites.

**Not yet fixed, deliberately.** Codex's own open question is whether failing
closed there creates a worse failure mode: a limiter outage blocking all uploads
platform-wide. That tradeoff should be answered before shipping a one-word
change to five routes.

## Third prompt — write the file instead of printing it

Two truncations, both mid-code-block, despite an explicit instruction to stop at
a section boundary. That is the signature of a **transport limit rather than a
generation choice**, so no further formatting instruction will help. Codex runs
in the repo with write access; the fix is to stop pasting altogether.

### The prompt — copy from here

````text
# Write the remainder to a file instead of printing it

Your last two responses were cut off mid-code-block — first inside the
policy-removal SQL, then inside the `storage_object_ledger` CREATE TABLE. This
is a transport limit on my side, not something you can fix by formatting, so
stop returning the report in chat.

**Write it to `.planning/reviews/CODEX-RESPONSE-260919-storage-attribution.md`
in the repo.** Create the file. Do not print its contents back to me — just
confirm the path and the section headings you wrote.

## What has already landed and must NOT be repeated

- VERDICT, CORRECTIONS, INVENTORY
- Answer 1 (attribution model), Answer 2 (what must change per bucket)
- CONFIRM-OR-REFUTE of the fragmentation consequence
- Answer 3 complete, including the per-route hourly table, the fail-open
  caveat, and the beta-acceptability list

I independently re-verified from Answer 3 and all of it holds:
`lib/security/rate-limit.ts:41-52` returns `options.failClosed === true` on
error, none of the five routes passes it, `track-audio` is capped at
262,144,000 bytes (`supabase/migrations/041_track_audio_stems_config.sql:16`),
and the clips completion route does remove oversized objects but only when it
is called (`.../clips/complete/route.ts:46-48`).

## What the file must contain

- **Answer 4, complete.** Your `storage_object_ledger` DDL was cut after
  `REVOKE ALL`. Restate it in full, then the rest: what compares bucket to
  ledger, how it runs given `storage.objects` is not PostgREST-readable, the
  completion-callback race, distinguishing a genuine orphan from an in-flight
  upload, and what happens on a hit — alert, quarantine, or delete after a
  grace period, and who decides.
- **Answer 5** — ordered rollout, given server routes must move to the service
  client before any policy is revoked.
- **Answer 6** — repair 227 via a new migration 228, or skip to the ledger.
  Recommend one, with the SQL. 227 is already applied; a fix is a new migration.
- **Answer 7** — container owner vs uploader for billing, both arguments plus a
  recommendation, including collaborator removal and work transfer/deletion.
- **Answer 8** — the full policy-removal SQL, including any replacement
  policies or grants, and what must be true before it is safe to run.
- **RECOMMENDED SEQUENCE** — ordered steps, each with what breaks if skipped.
- **CONFIDENCE** — what you verified by reading code vs what you inferred.

## One addition, given what Answer 3 established

You found five routes failing open on a limiter error, which the limiter's own
header comment says abuse-sensitive writes must not do. Treat that as its own
item: is adding `failClosed: true` to those five call sites sufficient on its
own, or does failing closed there create a worse failure mode — a limiter
outage blocking all uploads platform-wide? Say which you would ship first, that
or the quota work, and why.

## Constraints, unchanged

- Migrations are human-gated. Propose SQL; never claim anything is applied.
- Production is at 227, and 227 IS applied.
- `main` is protected.
- Alert content is summary-only — no raw user records or file paths (T-32-06).
- `{workId}/...` and `ideas/...` paths are deliberate; see
  `lib/catalogue/audio-mime.ts:125-137`.

Write the file, then reply with only the path and the headings.
````

### Copy to here

### Third response

**Received 2026-09-19 as a file — COMPLETE.**
`.planning/reviews/CODEX-RESPONSE-260919-storage-attribution.md`, 610 lines,
Answers 4-8 plus Recommended Sequence and Confidence, nothing truncated.

**Writing the file rather than pasting it was the fix.** Two prior attempts died
mid-code-block regardless of formatting instructions, because the limit was in
the transport, not the generation. Worth reusing: a long review belongs in the
repo, not in a chat message.

### Spot-check dispositions

| Claim | Disposition | Evidence |
|---|---|---|
| `works.user_id` has no sanctioned transfer path | **ACCEPTED — stronger than stated** | `196_owner_immutable_guard_custody_exemption.sql:66-74` says it "stays immutable to EVERYONE, owner and superuser alike", with the vault_projects exemption scoped by `TG_TABLE_NAME` and text-locked by a test |
| Three C7 routes still write storage caller-scoped | **ACCEPTED** (re-confirmed) | `assets/route.ts:97`, `profile/avatar/route.ts:85`, `contracts/verify/route.ts:94` |
| Five call sites omit `failClosed` | **ACCEPTED** (re-confirmed) | Counted zero across all five |

### What the report gets right that is easy to get wrong

- It **declines to add a replacement broad policy** after the DROPs, on the
  grounds that another path-prefix policy simply recreates M-01.
- It **declines a table-wide `REVOKE ... ON storage.objects FROM authenticated`**,
  because that reaches unrelated and future buckets rather than the three under
  review.
- It **keeps SELECT and DELETE policies in place**, correctly observing they
  cannot create new storage consumption, so they are not part of closing M-01.
- It marks its own production-evidence boundary: the segment counts came from
  this repo's probes, not from any query it ran.

### Decisions this leaves with the owner

1. **Ship `failClosed: true` first?** Codex says yes — small, independently
   reviewable, and its failure mode is reversible upload unavailability on five
   surfaces rather than unbounded cost. It also says explicitly: do not call it
   the quota fix, because the healthy-limiter bounds survive it untouched.
2. **Container owner vs uploader** — **DECIDED 2026-09-19: adopt Codex's
   recommendation in full.** Container owner carries the byte budget and
   retention; uploader carries count/velocity admission. Both dimensions, not
   one. `owner_user_id` and `uploader_user_id` are therefore both required on
   the ledger and are not interchangeable — quota sums group by the former,
   admission keys on the latter. Rationale and consequences (collaborator
   removal, the not-yet-existing work transfer, and Storage deletion outliving
   relational cascades) are recorded on
   `.planning/todos/pending/2026-09-14-storage-upload-admission-bypass.md`.
3. **Retention intervals** for quarantine and deletion are left open by design
   and need an owner-approved number.

## The owner decision this review cannot make

Question 7 is not Codex's to answer. **When a work has collaborators, whose
storage is it — the container owner's or the uploader's?** The schema already
keeps both (`works.user_id` vs `work_versions`; `ideas.user_id` vs
`idea_recordings.created_by`), so either is buildable. It is a billing and
fairness decision, and it should be made deliberately rather than inherited from
whichever column the first query happened to join on.

---

# Fourth prompt — is any of this proportionate?

Sent 2026-09-19, after `failClosed` merged (#85) and the ownership model was
locked (#86).

## Why this one is different

Codex has already produced a 16-step Recommended Sequence. Asking "what should
we do next" would only get that restated, which is worthless. **This prompt asks
whether 16 steps is the proportionate response** to this risk at this stage — a
pre-revenue beta, a handful of known users, 0.047 GB of storage, one person
building it.

It explicitly invites the reviewer to **argue for less work**. A reviewer that
only ever adds items is easy to produce and hard to act on; one that says which
three steps matter and which eleven can wait against a named trigger is the
useful kind. The deferral is asked for **against observable triggers rather than
dates** — a user count, a byte threshold, open signup — because a date-based
deferral is just a guess that expires.

It also sends Codex to settle the one unknown its own confidence section flagged:
whether Supabase signed upload URLs can be bound to a content length. That
question gates the cheapest fix for the size gap, and it is the difference
between "lower the bucket ceiling" and "build a sweeper".

Two of its steps are already done, so the prompt states that plainly — step 1
shipped, step 4 was decided by the owner — to stop it re-recommending completed
work.

**The file-write instruction leads the prompt rather than closing it**, because
that is the instruction that kept being missed when it sat at the bottom.

## The prompt — copy from here

````text
# FIRST: write your answer to a file, do not paste it

Write your entire response to
`.planning/reviews/CODEX-RESPONSE-260919-what-is-worth-doing.md` in this repo.
Create the file. **Do not print its contents back to me** — reply with only the
path and the section headings you wrote.

Your last two reports were cut off mid-code-block by a paste limit on my side.
Writing the file worked. Do that again, before anything else.

---

# What is actually worth doing — and what is not

You reviewed Funūn's storage attribution and upload-intent rollout and produced
a 16-step Recommended Sequence in
`.planning/reviews/CODEX-RESPONSE-260919-storage-attribution.md`.

**Do not restate that sequence.** This asks a different question: whether a
16-step program is the proportionate response, and which parts are worth doing
now versus deferring for a long time.

## What has changed since your report

1. **Your step 1 shipped and is merged.** `failClosed: true` is on all five
   upload-intent call sites, with 29 tests — 14 helper-level (RPC-errors,
   RPC-rejects, and factory-throws as separate branches) and 15 route-level
   (flag passed; limited verdict returns 429 and mints no signed URL; unlimited
   verdict does reach `createSignedUploadUrl`). Proven to bite by removing the
   flag from one route. The sixth intent route is untouched and a test asserts
   it still contains no `checkRateLimit`.
2. **Your step 4 is decided.** Owner ruling: container owner carries the byte
   budget and retention; uploader carries count and velocity admission. Both
   dimensions. `owner_user_id` and `uploader_user_id` are both required on the
   ledger and are not interchangeable.
3. **Nothing else has changed.** Production is still on migration 227 with the
   misattribution defect. `StemsUpload` still has both direct writes. The three
   server routes still write storage caller-scoped.

## The context you have been reasoning without

This is a **pre-revenue beta with a handful of known users**, built and operated
by **one person**. Total Storage is 0.047 GB. There is no evidence of abuse and
no untrusted public signup at scale.

Your Answer 3 called several hourly figures "unacceptable for a beta." I want
you to re-examine that against the constraint that every hour spent here is an
hour not spent on the product, and that the realistic adversary today is a
known, paying, identifiable user rather than an anonymous internet.

## What I want

1. **Argue for less, if less is defensible.** Of the 14 remaining steps, which
   would you cut or defer for six-plus months, and what is the actual cost of
   deferring each? Be concrete about what goes wrong and how you would find out.
   A reviewer that only ever adds work is less useful than one that says which
   parts do not earn their place yet.

2. **The four candidates, ranked, with reasoning I can check:**
   - the declared-vs-actual size gap (routes validate 50 MB; `track-audio`
     accepts 250 MB; the signed URL is not size-bound)
   - migration 228, the detector repair
   - the storage ledger
   - policy revocation, the actual close of M-01

   For each: what risk it removes, roughly what it costs to build and verify,
   and what it unblocks or blocks. If the right answer is "none of these for
   now", say that and defend it.

3. **Settle the size-gap unknown.** Your confidence section flagged that
   signed-upload size binding needs provider verification. Determine what
   Supabase Storage actually supports on the deployed version: can a signed
   upload URL be bound to a content length, and if not, what is the cheapest
   mechanism that makes declared size enforceable rather than advisory? Consider
   a lowered per-bucket `file_size_limit`, a completion-required sweep, or
   anything else the platform makes available. Say which parts you verified
   versus inferred — do not guess at provider behaviour and present it as fact.

4. **The sweeper question.** Much of the exposure comes from callers who obtain
   a signed URL, upload, and never call `/complete`, so the size check never
   runs. Is a periodic sweep that deletes uncompleted objects past a grace
   period a cheaper substitute for most of the ledger's value? What does it fail
   to catch that a ledger would catch, and is that gap worth the difference in
   build cost?

5. **A stop-and-reassess trigger.** Rather than a schedule, give me the
   observable condition that should make each deferred item become urgent — a
   user count, a byte threshold, a product change such as open signup. I want to
   defer against a trigger, not against a date.

## Constraints, unchanged

- Migrations are human-gated. Propose SQL; never claim anything is applied.
- Production is at 227, and 227 IS applied. A fix is a new migration.
- `main` is protected.
- Alert content is summary-only — no raw user records or file paths (T-32-06).
- `{workId}/...` and `ideas/...` path shapes are deliberate; see
  `lib/catalogue/audio-mime.ts:125-137`.

## Structure for the file

- BOTTOM LINE — in 5 sentences, what you would do next and what you would not
- DEFER LIST — each cut step, why, and the cost of cutting it
- RANKED FOUR — the four candidates with risk removed, build cost, dependencies
- SIZE GAP — what the platform actually supports, verified vs inferred
- SWEEPER VS LEDGER — the tradeoff, concretely
- TRIGGERS — observable conditions that end each deferral
- CONFIDENCE — verified by reading code vs inferred vs needs provider testing

Cite `file:line` for factual claims. Where you are guessing, say so.

Write the file. Reply with the path and the headings only.
````

## Copy to here

## Fourth response

_Expected as a file at
`.planning/reviews/CODEX-RESPONSE-260919-what-is-worth-doing.md`. Triage
unchanged: re-verify each claim in-code before accepting it, and be as willing
to challenge a recommendation to do less as one to do more._

---

# Fourth response — received 2026-09-19 as a file, complete

`.planning/reviews/CODEX-RESPONSE-260919-what-is-worth-doing.md`.

**It argued for less, which is what was asked and the harder answer to give.**
Bottom line: run none of the four candidates now; spend two to four hours
fixing the cron to report a global byte total and growth delta; stop.

## Dispositions

| Claim | Disposition | Evidence |
|---|---|---|
| A signed upload URL cannot be bound to a content length | **ACCEPTED — verified independently** | `node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts:381-383` types the parameter as `options?: { upsert: boolean }`. Installed version is 2.109.0. There is no length parameter to pass |
| Strict pre-upload size enforcement is blocked by bucket layout | **ACCEPTED** | `track-audio` is capped at 250 MB specifically so stems ZIPs fit (`041_track_audio_stems_config.sql:6-25`) while ordinary audio is 50 MB (`lib/catalogue/audio-mime.ts:13`). Lowering the bucket breaks stems; splitting stems into its own bucket first is the only strict route |
| A sweeper substitutes for most of the ledger's *present* value | **ACCEPTED** | The current question is "do abandoned bytes accumulate", not "can we bill exactly". Its own miss-list is honest, including that it cannot recover `uploader_user_id` for work- and idea-scoped paths because those paths deliberately do not encode it |

## The flaw in the trigger table, and why it still holds

**Several triggers require tooling that is itself deferred behind that trigger.**
"Stale unreferenced objects exceed 10 objects or 500 MB" needs the classifier
the sweeper would provide. "Any retained object exceeds its limit" needs the
same. "Manual reconciliation takes more than two operator-hours a month" needs
reconciliation to be happening at all. As written, those conditions can never
become true, because nothing would ever measure them.

The table survives only because each row is **any one condition**, and the
surviving conditions are of two observable kinds:

- **Growth signals** — total bytes reaching 5 GB, or 1 GB in seven days.
- **Product decisions** — open self-serve signup, storage becoming a paid
  entitlement, a customer-visible quota meter. These are the strongest entries
  in the table because they are decisions the owner makes deliberately and
  cannot fail to notice.

## The dependency the report understates

**Every growth trigger depends on a sensor that does not exist yet.**

The daily job calls the RPC with the 25 GB warning band as `p_min_bytes`, so it
returns zero rows and reports healthy whenever nobody exceeds 25 GB in a single
path segment (`app/api/cron/storage-usage-check/route.ts:40-45,66-68`). Against
a current total of 0.047 GB, and with bytes fragmented across work ids so no
segment aggregates, **that job is silent by construction.** It cannot report
5 GB total or 1 GB of weekly growth, because it never reports anything below the
band.

So the two-to-four-hour cron correction is not merely the cheapest item on the
list — it is the precondition for the entire deferral strategy. Defer everything
else without it and the deferral is against triggers that cannot fire.
