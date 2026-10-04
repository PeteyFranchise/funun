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
