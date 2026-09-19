---
type: review-prompt
reviewer: codex
created: 2026-09-19
status: response-received-partial-x2
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

_Expected as a file at `.planning/reviews/CODEX-RESPONSE-260919-storage-attribution.md`,
not as pasted text. Triage unchanged: re-verify each claim in-code before
accepting it._

## The owner decision this review cannot make

Question 7 is not Codex's to answer. **When a work has collaborators, whose
storage is it — the container owner's or the uploader's?** The schema already
keeps both (`works.user_id` vs `work_versions`; `ideas.user_id` vs
`idea_recordings.created_by`), so either is buildable. It is a billing and
fairness decision, and it should be made deliberately rather than inherited from
whichever column the first query happened to join on.
