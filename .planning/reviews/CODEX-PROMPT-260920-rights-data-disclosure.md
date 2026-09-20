---
type: review-prompt
reviewer: codex
created: 2026-09-20
status: awaiting-response
subject: when may one Funūn member see another's rights identifiers
blocks: .planning/phases/41-collaborator-discovery-mobile-contact-matching/ (discuss-phase, area 3)
---

# Codex review — rights-data disclosure between members

## Why this exists

Phase 41's discuss-phase hit a question it could not answer inside the phase.
Adding a collaborator found through People Search links them via
`collaborators.claimed_by`. Their rights identifiers (PRO, IPI, publisher) are
private and excluded from the discovery projection — so what happens to Wave 2's
"enter once, auto-fill everywhere" promise?

The owner's answer reframed it. Not *who fills the field*, but **when the data is
allowed to surface at all**:

> "The system should already know without giving this information to anyone
> prematurely — until it is needed on a contract or an upload for a distributor
> or something similar where it is required for something."

And the clarification that matters: **"don't make me re-enter things" is the real
promise** — not "show me my collaborator's identifiers."

Three candidate disclosure triggers were named and left undecided: document need,
explicit grant (an artist letting a supervisor see it), and project-membership
blanket access for release. Those are different mechanisms with different
revocation stories, and together they are a rights-access model rather than a
roster feature.

**Scouting also found the status quo contradicts the principle**: `collaborators`
rows already store `ipi`, so a roster owner types their collaborator's identifier
today. Any model has to say what happens to that.

## The prompt — copy from here

````text
# FIRST: write your answer to a file

Write your entire response to
`.planning/reviews/CODEX-RESPONSE-260920-rights-data-disclosure.md` in this repo.
Create the file. **Do not print its contents back** — reply with only the path
and the section headings.

---

# When may one Funūn member see another's rights identifiers?

Funūn is planning Phase 41 (Collaborator Discovery). Adding a collaborator found
through People Search will link them via `collaborators.claimed_by`. That raised
a question bigger than the phase, and the owner wants it answered properly before
deciding what Phase 41 builds.

## The owner's stated principle

> "The system should already know without giving this information to anyone
> prematurely — until it is needed on a contract or an upload for a distributor
> or something similar where it is required for something."

And separately: **"don't make me re-enter things" is the real promise** — not
"show me my collaborator's identifiers."

## Three candidate disclosure triggers the owner named, undecided between them

1. **Document need** — a contract or distributor delivery genuinely requires it.
2. **Explicit grant** — an artist deliberately lets someone (e.g. a music
   supervisor) access it.
3. **Project membership** — contributors on a project get blanket access to what
   the parties need for the project to release.

## What I verified in the code — CHECK THIS, do not inherit it

- `PRO`, `IPI`, `publisher`, `phone`, `mailing_address` live on `user_profiles`
  (`supabase/migrations/026_collaborator_identity_reconciliation.sql:15-26`).
- They are **deliberately excluded** from the People Search projection
  (`DISCOVER_PUBLIC_COLUMNS`, `lib/green-room/discover.ts:37-42`), which names
  them explicitly as PII.
- **But `collaborators` rows already store `ipi` themselves**
  (`lib/collaborators/index.ts:15,49`) — so today a roster owner types their
  collaborator's IPI onto their own private row. That is the status quo.
- The song passport already distinguishes provenance:
  `fact('ipi_cae', …, 'profile', owner.id)` versus
  `fact('ipi_cae', …, 'collaborator', collaborator.id)`
  (`lib/song-passport/legacy.ts:100,114`).
- Existing membership machinery that trigger 3 could use: `project_members`
  (`supabase/migrations/078_project_members.sql:69`) and `work_members` with
  `work_member_tier` (`supabase/migrations/136_work_members.sql:82`).
- `claimed_by` already grants the claimed member RLS read on that roster row
  (`026:69`).

## Answer these

1. **Is the owner's model sound?** "The system knows, the owner does not, until a
   document requires it." Argue it against the status quo where owners type IPIs
   directly. Note that an owner-typed IPI that is wrong routes royalties to the
   wrong person — so is withholding actually *safer*, or does it just move who is
   accountable for the error?

2. **The split-sheet question.** When a document is generated with a
   collaborator's IPI on it, that discloses the identifier to whoever can read
   the document. Is that acceptable as "just-in-time disclosure", or should a
   generated document show the identifier only to parties who must file it —
   and is per-party document rendering realistic here, or a trap?

3. **Which of the three triggers should exist**, and what is each one's
   revocation story? Specifically: when a collaborator is removed from a project,
   or a supervisor's grant is withdrawn, what happens to identifiers they already
   saw, and to documents already generated?

4. **Should `collaborators.ipi` continue to exist for a CLAIMED row?** A stale
   owner-typed copy alongside a linked profile is two sources of truth for a
   number that routes money. Propose what happens to existing data.

5. **What should Phase 41 build, if anything, of this?** Options as I see them:
   (a) link the member, withhold rights data, decide disclosure separately;
   (b) contract-only autofill now; (c) design the full model inside Phase 41.
   Recommend one and say what it costs to defer the rest. Note that (b) may
   silently answer question 2 by shipping it.

## Constraints

- Migrations are human-gated. Propose SQL; never claim anything is applied.
- Production is at migration 227.
- `main` is protected. This repository is PUBLIC.
- DDEX/PRO-compliant labels and designations are a standing project requirement.
- Do not propose exposing PII through the People Search projection. That
  exclusion is deliberate and is not the thing under review.

## Structure

- BOTTOM LINE — is the model sound, and what should Phase 41 build, in 5 sentences
- CORRECTIONS — where my reading above is wrong, with evidence
- THE MODEL — assessed on its merits, including the wrong-IPI accountability question
- DOCUMENT DISCLOSURE — answer to question 2, concretely
- TRIGGERS — each one, with its revocation story
- collaborators.ipi — what happens to it and to existing rows
- PHASE 41 SCOPE — recommendation with what deferring costs
- CONFIDENCE — verified by reading code vs inferred

Cite `file:line` throughout. Where you are guessing, say so.

Write the file. Reply with the path and headings only.
````

## Copy to here

## Response

_Not yet received. Same triage as the storage reviews: re-verify each claim
in-code before accepting it, and be as willing to challenge a recommendation to
build less as one to build more._

## What this blocks

Phase 41 discuss-phase, area 3 ("What 'Add to roster' creates for a found
member"). Two decisions in that area are settled — link immediately via
`claimed_by`, and rights fields are not disclosed to the roster owner on add.
**The scope question is open**: whether Phase 41 builds any rights-data autofill,
or links the member and leaves disclosure to a separate design. Answering that
closes the area.

## A second question already queued for Codex

Once Phase 41's plans exist, the owner wants Codex to run through, verify and
critique them — the same pass the storage work got. That is a later, separate
prompt against concrete PLAN.md files.
