# Phase 1: Collaborator Profiles - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 1-Collaborator Profiles
**Areas discussed:** Composer ↔ Collaborator bridge, Collaborator roster home, Auto-fill UX in forms, Split % on collaborator record

---

## Composer ↔ Collaborator Bridge

| Option | Description | Selected |
|--------|-------------|----------|
| 'Pick from roster' button per composer row | Existing form stays; button opens picker | ✓ |
| Replace name field with search-while-typing | Name input becomes a combobox lookup | |
| Collaborators replace Composer entry entirely | All composer rows must come from roster | |

**User's choice:** Pick from roster button — minimal disruption to existing UX.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Fill name/PRO/IPI/email/phone; split manual | Rights + contact auto-fill; split always per song | ✓ |
| Fill all including default split | Pre-fill split from collaborator record | |
| Fill name/PRO/IPI only | Contact stays manual | |

**User's choice:** Option 1, with the addition: if PRO or IPI is missing, allow the action but flag the fields and notify all parties they must be completed.

---

| Option | Description | Selected |
|--------|-------------|----------|
| No — edits stay local to the track | Song-level edits never affect global record | |
| Yes — offer optional sync-back | Rights-identity fields show 'Save to profile?' nudge | ✓ |
| You decide | | |

**User's choice:** Rights-identity fields (IPI, PRO, publisher, email, phone) offer optional sync-back. Split is always song-specific, never synced globally.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Store default role; auto-fill it | Collaborator profile stores a default role | |
| Role always set per song | No default on profile | ✓ |
| You decide | | |

**User's choice:** Role is always set per song.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — inline 'Add new collaborator' in picker | Create from within MetadataStudio | ✓ |
| No — must create from roster page first | Picker is search-only | |
| You decide | | |

**User's choice:** Inline add in picker.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Roster card only | Warning only on the global collaborator card | |
| Readiness checklist only | Warning only on vault project readiness | |
| Both — roster card + readiness checklist | ✓ |

**User's choice:** Both, plus email notification to both collaborator and artist on save with 'what to do next' instructions for each party.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Collaborator + artist, triggered on save | Both get email when track saved with missing IPI | ✓ |
| Artist only, triggered on save | | |
| Both, triggered on export attempt | | |

**User's choice:** Option 1. Both emails must include clear 'what to do next' instructions.

---

| Option | Description | Selected |
|--------|-------------|----------|
| CTA + referral parameter, existing signup | Low-lift; routes to existing signup | |
| Proper collaborator invite flow in Phase 1 | Genuine invite link | ✓ |

**User's choice:** Proper invite flow. Motivation: growing Funūn's user base through collaborator invites.

---

| Option | Description | Selected |
|--------|-------------|----------|
| View-only + flag for correction | Post-signup shows profile; flag link to artist | ✓ |
| Editable after signup | Collaborator can update own data directly | |
| Standard artist onboarding | No collaborator context | |

**User's choice:** View-only + flag. Full self-edit deferred to a future phase.

---

## Collaborator Roster Home

| Option | Description | Selected |
|--------|-------------|----------|
| /collaborators top-level route in sidebar | First-class nav alongside /vault | ✓ |
| Inside project detail only | Per-project only; contradicts global-roster goal | |
| Inside profile/settings | Treated as a settings concern | |

**Notes:** User confirmed collaborator data also surfaces at the project level (picker in MetadataStudio, split sheets, contracts) — both places.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Card grid with status badges | One card per collaborator; IPI-missing cards flagged | ✓ |
| Table/list with columns | Denser, sortable | |
| You decide | | |

---

| Option | Description | Selected |
|--------|-------------|----------|
| Edit modal overlay | Consistent with EditProjectForm pattern | ✓ |
| Dedicated /collaborators/[id] page | Own URL per collaborator | |
| Inline card editing | Card expands in place | |

---

## Auto-fill UX in Forms

| Option | Description | Selected |
|--------|-------------|----------|
| Signer rows with 'Select collaborator' dropdown | Per-row picker; auto-fills fields | ✓ |
| Separate 'Add signers' step before form | Multi-step flow | |
| Paste emails; Funūn matches to records | Email-first lookup | |

---

| Option | Description | Selected |
|--------|-------------|----------|
| Always manual | Split % never pre-filled | |
| Pre-fill even split | 100% / number of collaborators | ✓ |
| Pre-fill from collaborator default split | Requires default on collaborator profile | |

**User's choice:** Even-split pre-fill. All parties must approve via in-app split approval flow in Phase 1.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Email + approve via link (no account required) | Tokenized link; no Funūn account needed | ✓ |
| Must create account first | Approval gated on signup | |
| You decide | | |

---

| Option | Description | Selected |
|--------|-------------|----------|
| Free-text note; artist adjusts | Simple; no in-page split editing | |
| Enter counter-proposed split % on the page | Structured counter-proposal | ✓ |
| You decide | | |

**Notes:** Counter-proposal page should validate total = 100% before submission.

---

## Split % on Collaborator Record

| Option | Description | Selected |
|--------|-------------|----------|
| No — split always set per song, no default stored | ✓ |
| Yes — store a default split % on the profile | | |

**User's choice:** No default split on collaborator profile.

---

## Claude's Discretion

- Exact UI treatment of the "Save to profile?" sync nudge in MetadataStudio composer rows
- Token expiry and re-send mechanics for approval/invite links
- Exact email copy for missing-IPI notifications and split-approval emails (beyond content requirements)

## Deferred Ideas

- **Collaborator self-edit portal** — collaborators update own IPI/PRO/contact after signup. Deferred to future phase; Phase 1 is view-only.
- **SMS signature confirmation** — tied to Dropbox Sign (blocked on paid account).
