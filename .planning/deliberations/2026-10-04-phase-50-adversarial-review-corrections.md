# Phase 50 — adversarial review verdict and corrections

**Review run:** 2026-10-04, independent adversarial pass over `50-SLICES.md`, the sixteen-section
owner deliberation, and `CSUB-01..18`.
**Verdict: NO-GO** on roadmap merge, implementation start, migration apply, deploy and closeout.

**The plan was not rejected for omissions. It was rejected for two reinterpretations** — decisions
that survived as sentences while losing their meaning. Both were on the "must survive into the
plan" list given to the roadmapper, and both were reinterpreted anyway. That is the finding behind
the finding: a brief listing load-bearing decisions is not sufficient protection against them being
rewritten into something easier to build.

---

## The two architectural failures

### 1. The valve gates account creation, not submissions

**Decided (§12):** stop unsolicited *submissions* when the team is overwhelmed, without stranding
anyone mid-upload.

**Planned:** read the valve inside `handle_new_user()` — a signup gate.

**Why that fails:** an account created while the valve was open keeps submitting after it closes.
The cap in §9 is **per submission, not per lifetime**, so one account is an unlimited channel. The
system also cannot distinguish a submission begun before closure from one begun after.

**Correction:** enforce at **submission creation**. Issue a durable, expiring submission-start
grant while the valve is open and honour only that grant after closure. Account creation must never
confer permanent submission rights.

### 2. "Accepted but not rights-ready" is a badge, not a lifecycle

**Decided (§5):** such a song stays **visible and pitchable**, routes buyers to *contact*, and is
not instantly licensable.

**Planned:** slice 6 adds AI-provenance resolution and repeats the phrase without changing the
admission lifecycle. The existing code **returns 409 and refuses admission** when rights or
metadata are incomplete, and `contact` is a display badge, not an admitted catalogue state. Slice 7
then assumes a state slice 6 never creates.

**Correction:** model four distinct things — intake acceptance, review outcome, catalogue
admission, licensing readiness — and specify catalogue-query behaviour for admitted-but-contact-
required songs, with transition tests for incomplete splits, samples and provenance.

---

## Corrections accepted without argument

| # | Correction |
|---|---|
| 3 | Enforcement is a **prerequisite** for every intake-expanding slice, not a later slice. The dependency does not make the exposure necessary — it makes the expansion blocked. **A&R admit has already merged (#147), so the exposure is live now**, not beginning in the future. |
| 4 | Add the **two-stage** lifecycle the owner decided: accept-or-decline *for review*, then the review outcome. The plan collapsed both into the existing single admit/reject transition. |
| 5 | **"The claim is the assignment" needs an atomic compare-and-set**, release/reclaim rules, stale-claim handling and a two-session race test. An adjective is not a concurrency control. Model the accountable claimant separately from §15's invited reviewers. |
| 6 | Slice 5 depends on slice 4 — a Crate invite cannot pass a closed valve unless the trigger knows about it, and the trigger is slice 4's. |
| 7 | **Trigger baseline is wrong, and worse than the review said.** The plan cites 098; the review cites 099; the actual latest definitions of `handle_new_user` are **105, 133 and 214**. Building from 098 would drop identity handling *and* verified-invite claim hardening. Require parity with the live definition and test every branch. |
| 8 | §12's abuse controls have **no owner**: rate limiting, file-type and size validation, quotas, orphan cleanup, abuse suspension, monitoring. The deliberation states plainly that a valve is necessary but not sufficient. |
| 9 | Artist **receipt ships with slice 1**, not slice 8. Taking someone's song and saying nothing is the dishonest intermediate state the slicing rule exists to prevent. |
| 13 | Slice 2 is not independently shippable — a UI that appears to capture provenance while failing to persist it is not a green state. Merge it or label it preparatory. |
| 14 | Slice 3 ships the row **closed** but the control **disabled** until slice 4 reads it. An operational switch that does nothing is worse than no switch during an incident. |
| 15 | Share auditing must record **the recipient opening** the material, not merely the grant. Opening a shared review must not confer queue-wide access. |
| 16 | **Slice 9 is already shipped** (#148) — mark pre-satisfied. Keep CSUB-18 as a **cross-surface** negative test over every buyer-facing path, not Selects alone. |
| 17 | §§1 and 2 have no owner and are not listed out of scope. The stale Phase 42 statement is still in the roadmap. |
| 18 | Upload-first ordering and the four-door summary need explicit acceptance criteria, or a conventional questionnaire-first wizard would satisfy the text while violating the decision. |

---

## Two owner contradictions — RATIFIED 2026-10-04

These were defects in the **decisions**, not the plan. The deliberation asserted all sides.

### Finding 10 — skippable versus mandatory

§4 said every question is skippable; §5 required contact details; §11 required asking ownership
outright.

**RATIFIED: contact and ownership are INTAKE, not questionnaire.** Two separate things — a short
mandatory intake (who you are, how to reach you, are these your songs) and then an optional
questionnaire where every question genuinely is skippable. The song still uploads first, so
*"nothing stands between a person and their work"* holds; it simply cannot be anonymous.

### Finding 11 — direct fill versus mandatory confirmation

§5 required both an artist-confirmed draft path and a visible direct-fill path for exceptional
cases. CSUB-14 made everything staff-entered require confirmation, which collapses direct fill into
a second draft path and deletes the fallback.

**RATIFIED: direct fill takes real effect, heavily gated.** Elevated permission, a stated reason,
an **immutable audit record**, notification to the artist, and a correction route. The friction is
the point — otherwise the exceptional path does not exist.

---

## Requirement coverage as reviewed

Six requirements are **Missing as decided, missing a mechanism, blocked, or contradictory**:
CSUB-06, CSUB-07, CSUB-11, CSUB-12, CSUB-13, CSUB-14. Ten more are Partial. One (CSUB-16) is
present. **Phase 50 must be re-planned before any slice is built.**

---

# Pass 2 — decision-consistency review (2026-10-04)

A second adversarial pass, this time over the **decisions** rather than the plan. It found
**eight more contradictions** beyond the three already known. All eight are real. Resolutions
below are owner-ratified where marked.

## 1. The CTA/waitlist path was cancelled by §12

§3/§4 describe the CTA leading to *"a waitlist that carries the arrival intent"* and state
*"invite-only is unchanged."* §12 then decided **both CTAs lead to the real submission flow** and
*"invite-only stops being absolute."* They cannot both describe where the button goes.

**RESOLVED: §12 is controlling.** While the valve is open, both CTAs lead to submission-specific
signup. **The waitlist-intent experience survives only as the closed-valve state.** §§3, 4 and 8's
CTA language is superseded.

## 2. The catalogue hatch during a closed valve — RATIFIED

§11 says *"take the song, flag the catalogue for a person."* §12's hatch says such a person is
*"flagged for a human conversation rather than fed through the song queue."* Mutually exclusive
while the valve is shut.

**RATIFIED (owner, 2026-10-04): contact lead only — no song while the valve is shut.** The hatch
captures the person, catalogue context, authority status and contact details, and takes no audio.

Rejected: accepting one sample song anyway (a hole in the valve, and *"I have more"* is
unverifiable at the moment of claiming it) and making it depend on who invited them (a third rule
on a control whose value is being simple to reason about in a crunch).

## 3. The provenance binary cannot represent the later intake routes

§3 requires showing *"existing Funūn Member versus marketing CTA."* §§13/16 then establish the
axis as **who initiated** — artist walks up, or a Funūn Team Member invites. These are different
dimensions, and a submission can be **both** an existing Member *and* staff-invited.

**RESOLVED: four fields, not a binary** — (1) initiator: `self` | `staff_invited`; (2) account
state at initiation: existing Member | newcomer; (3) entry surface: marketing CTA | in-app |
public-profile invite | email invite; (4) inviter identity and note, where applicable.

Building the binary would misclassify invited existing Members, erase staff accountability, and
make acquisition source indistinguishable from invitation provenance.

## 4. "Everyone with access sees everything" versus submission-scoped guests

§4 defines a shared pool where *"everyone with access sees everything."* §15 grants *"a look to
someone who cannot normally see the queue"* — an A&R sharing one submission with an AE. If that AE
becomes a person "with access," §4 hands them the entire queue.

**RESOLVED: two access classes.** Queue members (leadership, A&R) see the pool. **Submission guests
see only what they were specifically granted and gain no queue membership.** Opening a shared
review must never confer queue-wide access — already required by §15's audit rule.

## 5. The "honest" split reply is also a promise that cannot be kept — RATIFIED

§1 replaced *"bring it in and it rides with the song"* with *"we'll note it on the song so nobody
asks you twice,"* described as *"true today, no build."*

**It is not true today.** The source todo states plainly: *"No screen, no route, no table."* There
is no questionnaire and no persistence path. The corrected copy records nothing — **the same
label-integrity defect §1 exists to fix, in a smaller promise.**

**RATIFIED (owner, 2026-10-04): promise nothing until storage exists.** Ship copy that is true
with no build — *"Good — that's the hard part done. You'll be able to confirm it with the song
before submitting."* The "we noted it" line waits until there is somewhere to note it.

## 6. "Submission" means both a three-song batch and exactly one song

§9 says *"up to three per submission"* and *"three songs become three separate review items,"*
then *"one song, one submission, one set of answers."*

**RESOLVED: different nouns.** An intake **batch** may carry up to three songs and creates one
independent **submission** per song. Person-level contact is shared across the batch; song-level
rights answers, decisions, receipts, valve grants and audit history are per submission.

## 7. Invite pre-fill versus the staff-assistance fallbacks

§13 says of an invited artist: *"the artist still answers every rights question themselves… the
pre-fill is the song, never the answers."* Read across the whole lifecycle that also deletes §5's
ratified draft-for-confirmation and direct-fill fallbacks for invited submissions.

**RESOLVED: the restriction applies at invitation creation only.** An inviter may pre-fill the
song and nothing else. Once the submission begins, §5's ordinary hierarchy applies — artist first,
staff draft exceptionally, gated direct fill only when absolutely necessary.

## 8. "Accepted" names two different events — RATIFIED

§§3/4 separate **acceptance for review** from **advancement into The Crate**. §15 then lists
*"accepted"* as an outcome alongside *"we want this."* An artist told their song was "accepted"
may reasonably believe it is in The Crate, buyer-visible and licensable — before review has even
happened.

**RATIFIED (owner, 2026-10-04): distinct artist-facing names for every state** — received →
accepted for review → under review → selected for The Crate (licensable, or contact-required) or
not selected. **Declined at intake is its own state**, separate from not selected after review.

Rejected: telling artists only about final outcomes (a song sits silently for weeks with no signal
anyone looked) and renaming only the internal stage.

---

## A correction to the brief this pass was given

The pass was told this corrections document was on `main`. **It was not** — it sits on
`phase-50-review-corrections` (PR #153). The reviewer worked around it and said so, which is the
correct behaviour and worth recording: a brief's claim about where a file lives is itself a claim
that can be wrong.
