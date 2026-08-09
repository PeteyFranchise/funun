# Phase 27: Artist Invitation-Only Onboarding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-08
**Phase:** 27-artist-invite-only-onboarding
**Areas discussed:** Gate architecture · What counts as an invite · Uninvited UX + enforcement · Staff invites, seed & limits · How invites reach people · Waitlist mechanics · Where staff manage it · Notification content & tone · Signup-page design · Deep-link security & edges · Rollout sequencing · Invite-only positioning

---

## Gate architecture

| Option | Description | Selected |
|--------|-------------|----------|
| A — Gated self-serve | Signup page stays; invitee creates own credentials; handle_new_user provisions only if invited | ✓ |
| B — Inviter pre-creates | Mirror Staff/Buyer/Industry: admin.createUser + magic link | |
| You decide | Lock A unless research blocks | |

**User's choice:** A — Gated self-serve.
**Notes:** "Keep the signup page with some design modifications. Allow user to create all their own credentials and respectfully deny that it is invite only for now." → also steered the uninvited UX (respectful denial at submit).

---

## What counts as an invite

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit invite only | Only a deliberate 'Invite to Funūn' action allowlists someone (reuses collaborator_invites) | |
| Any collaborator auto-allowed | Adding someone by email as a collaborator authorizes their signup | ✓ |
| You decide | — | |

**User's choice:** Any collaborator auto-allowed.
**Notes:** Frictionless growth; allowlist = collaborator emails + Team-Member invites + owner seed; reuses claim_collaborators matching.

---

## Uninvited UX + enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Message only | Respectful "invite-only for now"; nothing stored | |
| Message + request access | Respectful message + lightweight capture | ✓ |

**User's choice:** Message + request access → later upgraded (mid-turn) to a **waiting list** with notify-when-an-opening-pops-up.
**Notes:** Enforcement is server-authoritative (locked, not a page-only check). Denial happens at submit.

---

## Staff invites, seed & limits

| Question | Selected |
|----------|----------|
| Who invites | Any Team Member |
| Limits | Unlimited for now |
| Bootstrap | Owner self-signs-up now to seed |

**Notes:** Retroactivity = new signups only (existing accounts untouched).

---

## How invites reach people

| Question | Options | Selected |
|----------|---------|----------|
| When email is sent | prompt at add-time / auto-email everyone / explicit only | **All three (1, 2, and 3)** |
| How they reach signup | magic deep-link / plain "sign up with this email" | Magic deep-link |

**Notes:** All three send pathways supported; "auto" flagged as a deliberate opt-in mode, not silent-always (deliverability caveat → For Research). Deep-link reuses collaborator_invites tokens.

---

## Waitlist mechanics

| Question | Selected |
|----------|----------|
| Fields | Email + name + optional note |
| Abuse control | Rate-limit + captcha |

---

## Where staff manage it

| Question | Selected |
|----------|----------|
| Reopen broadcast | Leadership only |
| Management home | Team Console (/admin); artist invite in collaborator UI |

---

## Notification content & tone

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse minimal style | Match industryInvite/curator-claim plain HTML | |
| Distinct branded copy now | Designed, on-brand templates up front | ✓ |

**Notes:** All three emails (invite / spot-opened / reopened) branded; owner copy/design sign-off before ship.

---

## Signup-page design

| Question | Selected |
|----------|----------|
| Up-front signal | Prominent invite-only gate ("Have an invite?") |
| Deep-link landing | Pre-fill email + "invited by [name]" |
| Denial + waitlist placement | Inline on the signup page |

**Notes:** Prominent gate front-loads the email check → enumeration trade-off noted for research (mitigate via rate-limit + generic wording).

---

## Deep-link security & edges

| Option | Description | Selected |
|--------|-------------|----------|
| Bind to invited email | Link only works for that email; no stranger onboarding | ✓ |
| Forwardable golden ticket | Any email can use the link | |
| You decide | — | |

**Notes:** Existing account → sign in; expired token → re-request.

---

## Rollout sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Flip on; seed via invites | Gate on day one; owner seeds + invites founding cohort | ✓ |
| Brief open soft-launch first | Open window for organic seeding, then flip | |
| You decide | — | |

---

## Invite-only positioning

| Option | Description | Selected |
|--------|-------------|----------|
| Founding-member / exclusive | Frame invite-only as desirable | ✓ |
| Neutral / utilitarian | Plain "request access" | |
| You'll write it | Owner authors copy | |

**Notes:** Owner owns final wording.

---

## Claude's Discretion
- Allowlist/invite table design (reuse collaborator_invites vs dedicated artist_invites) — deferred to research.
- Signup-page visual specifics beyond "prominent gate + inline denial/waitlist."

## Deferred Ideas
- Fully-public reopening of artist signup.
- Full public waitlist / apply-to-join approval funnel (this phase ships a minimal notify-me list).
- Invite quotas / referral tracking / analytics.
- Artist / Industry / Both account-type chooser.
- Soft-launch open-signup window (considered, rejected).

## Deliverable
- One-page flow diagram shared with owner for team review (2026-08-08): `Funun-Phase27-Onboarding-Flow.pdf`.
