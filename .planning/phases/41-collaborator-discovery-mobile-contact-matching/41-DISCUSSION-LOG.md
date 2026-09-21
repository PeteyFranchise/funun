# Phase 41: Collaborator Discovery & Mobile Contact Matching - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-21 (opened 2026-09-20)
**Phase:** 41-collaborator-discovery-mobile-contact-matching
**Areas discussed:** Invisible reconciliation; Scope; What "Add to roster" creates; Duplicates

---

## Invisible reconciliation — what the inviter sees

### What the inviter sees when the address belongs to an existing member

| Option | Description | Selected |
|---|---|---|
| Tell me only when they're publicly findable | Leaks exactly what People Search already leaks, nothing more | |
| Always the same neutral message | Maximum privacy, no feedback | |
| Always tell me exactly what happened | Best feedback; turns the invite box into a registration oracle | ✓ |

**User's choice:** Always tell me exactly what happened.
**Notes:** Chosen with the oracle tradeoff stated in the option text. Recorded as a deliberate
call, not an oversight, and mitigated in the next question rather than left open.

### What prevents bulk enumeration

| Option | Description | Selected |
|---|---|---|
| Tell the person they were looked up | Symmetry — enumeration stops being silent | |
| Hard rate limit plus audit log | Invisible to honest users; doesn't tell the person | |
| Both | Cap defeats volume, notice defeats targeted checks | ✓ |
| Nothing for now — beta is small | Defer with a trigger | |

**User's choice:** Both.

### When the address belongs to someone who has blocked the inviter

| Option | Description | Selected |
|---|---|---|
| The action ends — nothing sent, nothing added | A block must be unroutable | ✓ |
| Add to my private roster, but contact nobody | Still confirms the account exists | |
| Treat them as a non-member and send the signup invite | Routes around the block and recreates the bug | |

**User's choice:** The action ends.
**Notes:** This is what makes the full-disclosure choice defensible.

### Recourse for the notified person

| Option | Description | Selected |
|---|---|---|
| Informational, with a block link | Reuses the remedy just made total | ✓ |
| They can request removal from that roster | New bidirectional mechanism | |
| Purely informational, no action | Generates support email | |

**User's choice:** Informational, with a block link.

---

## Scope — is mobile in this phase at all?

### Where mobile sits

| Option | Description | Selected |
|---|---|---|
| Web only — mobile its own phase | Makes the roadmap self-consistent | ✓ |
| Web now, mobile research-only track in this phase | Open track blocks phase closure | |
| Keep both as the roadmap has it | Plans implementation for unapproved work | |

**User's choice:** Web only.

### The deliverable, given manual and email partly ship

| Option | Description | Selected |
|---|---|---|
| Restructure the whole add-collaborator flow | The order is the fix | ✓ |
| Add search and fix reconciliation, leave manual alone | Smaller; people still take the old door | |
| Search only | Leaves the reconciliation decisions unimplemented | |

**User's choice:** Restructure the whole flow.

### Which surfaces get it

| Option | Description | Selected |
|---|---|---|
| One shared add-flow, every creating surface | Fix once rather than leaving copies | ✓ |
| Main Collaborators screen only | Other doors keep the bug | |
| Main screen plus QuickInviteModal | Needs confirmation the others can't mint invites | |

**User's choice:** One shared add-flow.

### Where the mobile roadmap section goes

| Option | Description | Selected |
|---|---|---|
| New roadmap phase now, research-gated | Roadmap stays the authoritative ledger | ✓ |
| Note in CONTEXT.md as deferred | Roadmap keeps claiming mobile is in 41 | |
| Write it as a pending todo | Drops out of the phase ledger | |

**User's choice:** New roadmap phase now.

---

## What "Add to roster" creates for a found member

### Set `claimed_by` immediately?

| Option | Description | Selected |
|---|---|---|
| Link immediately | Unlocks canonical data; they can see the row | ✓ |
| Leave null until they act | Auto-fill keeps using typed guesses | |
| A new "linked" state separate from "claimed" | Migration plus a new state everywhere | |

**User's choice:** Link immediately.

### What happens to PRO / IPI / publisher

| Option | Description | Selected |
|---|---|---|
| Blank, marked awaiting-her | *offered* | |
| Let me type them, marked as my guess | *offered* | |
| Prompt her to share when notified | *offered* | |
| **Owner's own model** | **See below** | ✓ |

**User's choice:** None of the three. The owner described a different model:

> "she can fill them in her settings if it is not already there, or provide a form field for her
> to fill if needed and that will also update her settings with the current info. if it already
> is in her settings field, she shouldn't need to do anything, the system should already know
> without giving this information to anyone prematurely — meaning until it is needed on a
> contract or an upload for a distributor or something similar where it is required for
> something."

**Notes:** Clarified afterwards that **"don't make me re-enter things" is the real promise**, not
"show me my collaborator's identifiers", and that the autofill surfaces beyond a contract are not
yet known — possibly explicit sharing (an artist letting a supervisor see it) or project-
membership blanket access for release. Three candidate triggers, left undecided and referred out.

### Should Phase 41 build any rights-data autofill?

| Option | Description | Selected |
|---|---|---|
| No — link, withhold, decide disclosure separately | *offered* | |
| Contract-only autofill now | *offered* | |
| Design the full disclosure model inside 41 | *offered* | |
| **Refer to Codex** | | ✓ |

**User's choice:** "Let's present this to codex for a thorough answer."
**Outcome:** Codex recommended option (a). Approved by the owner 2026-09-21. It also found that
the disclosure under debate **already ships** — the split-sheet draft editor shows an initiator a
claimed party's live profile IPI, labelled "IPI # (live from Settings)" — while the executed PDF
deliberately omits it. Containment of that existing path became a prerequisite.

**Provenance note:** the Codex response contained a section headed "OWNER-APPROVED RIGHTS
RECORDKEEPING DIRECTION... approved 2026-09-20", which could not be corroborated from this
conversation and was flagged before being recorded. The owner then approved the analysis
explicitly on 2026-09-21. CONTEXT.md carries that date rather than the unverifiable one.

---

## Duplicates and already-in-roster

### The two-Mayas case

| Option | Description | Selected |
|---|---|---|
| Server checks her account email, silently reuses the old row | *offered* | |
| Match on claimed_by only — accept the occasional twin | *offered* | |
| Warn me without merging | *offered* | |
| **Refer to Codex** | | ✓ |

**User's choice:** "ask codex how we can avoid having 'two of the same mayas'."
**Outcome:** Identity is `(user_id, claimed_by)` when claimed, else `(user_id, normalized
email)`; claim and reactivate the existing row in place preserving its `id`; archived rows
resurface; two partial unique indexes plus one transactional SECURITY DEFINER RPC; preflight
required because migration 148's repair pass added no invariant and migration 179 can recreate
the duplicates. Approved by the owner 2026-09-21.

---

## Claude's Discretion

Rate-limit values, provenance badge copy, component naming and file layout, and the order in
which the six surfaces migrate to the shared flow.

---

## Process note

Two of the four areas were answered by referring the question out rather than choosing from the
options offered. In both cases the referral found something the options had assumed away — that
the rights disclosure already ships in the split-sheet editor, and that a prior repair migration
had already fixed the duplicate class without adding an invariant. Both are recorded in
CONTEXT.md as constraints rather than as discoveries.
