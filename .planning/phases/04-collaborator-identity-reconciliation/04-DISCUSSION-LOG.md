# Phase 4: Collaborator Identity Reconciliation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 4-Collaborator Identity Reconciliation
**Areas discussed:** Claim trigger placement, Collaborations section content, Settings back-fill mechanics, Soft-delete UX for the inviting artist

---

## Claim Trigger Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase DB trigger | SQL function on auth.users fires at row insert. Handles signup atomically. | ✓ |
| Next.js API route only | POST /api/auth/claim called from auth callback and middleware. | |
| Middleware only | Claim runs on every request until claimed. | |

**User's choice:** Supabase DB trigger  
**Notes:** DB trigger handles signup atomically. Follow-up discussion established middleware re-run for "first post-signup login" case.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Middleware re-run | Middleware checks claimed_at on artist_profile; if NULL, re-runs claim. | ✓ |
| Auth callback API route | POST /api/auth/callback calls claim. Gaps for email/password flows. | |
| Skip — DB trigger is enough | Don't handle first-login case separately. | |

**User's choice:** Middleware re-run  
**Notes:** Idempotent so safe on every login. stops re-running once claimed_at is set.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Check claimed_at on artist_profile | Nullable timestamp; once set, skip claim check. One cheap column read. | ✓ |
| Session cookie flag | Cookie set after first successful claim. Resets on session expiry. | |
| Always call the claim function | No optimization — claim returns early if already done. | |

**User's choice:** Check claimed_at on artist_profile  
**Notes:** Permanent once set; prevents any per-request overhead after first claim.

---

## Collaborations Section Content

| Option | Description | Selected |
|--------|-------------|----------|
| Project name + artist name + role | Clean. No financial data exposed without formal agreement. | ✓ |
| Project name + artist name + role + split % | More transparent. Exposes split to someone who may not have agreed yet. | |
| Project name + artist name only | Minimal — just shows where their name appears. | |

**User's choice:** Project name + artist name + role  
**Notes:** Split % lives in the split sheet (already a shared document from Phase 1).

---

| Option | Description | Selected |
|--------|-------------|----------|
| Permanent section on dashboard | Always visible. Grows as more artists credit the user. | ✓ |
| Onboarding card that fades | Shown prominently at first login, then dismissed. | |

**User's choice:** Permanent section on dashboard

---

| Option | Description | Selected |
|--------|-------------|----------|
| Link to the split sheet | Directly relevant — the document they're named on. | ✓ |
| No link | Read-only listing only. | |
| Link to artist's public profile | Less relevant than the split sheet. | |

**User's choice:** Link to the split sheet for that project

---

| Option | Description | Selected |
|--------|-------------|----------|
| Below stats cards on dashboard | Consistent with existing page structure. | ✓ (+ see notes) |
| Hidden until accessed | Show only via route. | |
| Separate /collaborations route | Dedicated page, linked from dashboard. | |

**User's choice:** Below stats on dashboard AND accessible from /collaborators sidebar route  
**Notes:** User specified "somewhere in the page that opens after you select 'collaborators' in the main left hand menu."

---

| Option | Description | Selected |
|--------|-------------|----------|
| No — /collaborators for own roster only | Dashboard section is the credits view. | |
| Yes — Credits tab or section | /collaborators gets a second view for projects the user appears on. | ✓ |

**User's choice:** Full Credits + My Roster structure  
**Notes:** User clarified: "the logged-in USER should see EVERY song in which they are credited as a writer, producer, or have any credits on." /collaborators becomes a two-section page: Credits (all work they appear on) + My Roster (people they've added).

---

## Settings Back-fill Mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| At claim time + on every settings save | Back-fill runs at claim, then again each time settings are saved. | ✓ |
| At claim time only | One-shot at claim. NULLs persist if profile was incomplete at signup. | |
| On settings save only | No back-fill at claim. First back-fill only after explicit settings save. | |

**User's choice:** At claim time + on every settings save

---

| Option | Description | Selected |
|--------|-------------|----------|
| PRO, IPI, publisher, phone, address | Exactly the rights-identity fields from ROADMAP. | ✓ |
| Everything except name and email | Broader; may back-fill data the inviting artist didn't intend. | |

**User's choice:** PRO, IPI, publisher, phone, address

---

| Option | Description | Selected |
|--------|-------------|----------|
| artist_profiles table | Settings writes here; back-fill reads from here. Single source of truth. | |
| New user-identity table | Separate table decoupled from artist_profiles. | ✓ |

**User's choice:** New user-identity table (then expanded to full profile)  
**Notes:** After choosing a new table, user selected "Full profile" scope: display name, bio, social links + rights fields. Noted as an intentional Phase 4 scope expansion — not scope creep, deliberate decision.

---

## Soft-delete UX for the Inviting Artist

| Option | Description | Selected |
|--------|-------------|----------|
| Delete becomes Archive | Delete button replaced by Archive for claimed collaborators. | ✓ |
| Delete stays, shows blocking message | Artist clicks delete, sees error + Archive option. | |
| Delete button hidden entirely | No delete affordance shown for claimed records. | |

**User's choice:** Delete becomes Archive

---

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden from active roster, Archived filter | Filter reveals archived cards; artist can unarchive. | ✓ (+ see notes) |
| Dimmed card in same roster view | Same grid, dimmed with Archived badge. | |

**User's choice:** Hidden + Archived filter  
**Notes:** User also requested Favorites (star toggle on cards) and Most Recent collaborators shown in MetadataStudio picker for quick access on new songs.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 4 — include Favorites + Most Recent | Planner adds star toggle + Most Recent section in picker. | ✓ |
| Deferred — note for backlog | Focus Phase 4 on identity reconciliation only. | |

**User's choice:** Include in Phase 4

---

## Claude's Discretion

- Exact DB migration structure for `user_profiles` and how it coexists with `artist_profiles`
- Tabs vs. scrolled sections for the two-section /collaborators layout
- Pagination/limit behavior for Credits section
- Exact Favorites storage mechanism (column vs. join table)

## Deferred Ideas

- Unified user profile replacing artist_profiles/industry_profiles — architectural cleanup for future phase
- Collaborator self-edit portal — foundation (user_profiles table) is being built now; self-edit UI deferred
- "You've been credited" notification email — nice-to-have, not in Phase 4 success criteria
