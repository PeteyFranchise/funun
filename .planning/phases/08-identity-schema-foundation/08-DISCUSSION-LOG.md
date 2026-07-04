# Phase 8: Identity & Schema Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 8-Identity & Schema Foundation
**Areas discussed:** Industry signup & legacy industry_profiles table, Retroactive column-privacy lockdown, Reserved handle list, member_type vs. industry_roles badges, Block-enforcement wiring scope, Featured project eligibility, People-search composition

---

## Industry signup & legacy industry_profiles table

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-invite only | Server route calls admin.createUser() with app_metadata.role='industry' at creation, mirrors curator pattern | ✓ |
| Self-serve signup with role picker | New signup flow, requires server-side signup API | |

**User's choice:** Admin-invite only, with an explicit ask to design it so a future self-serve flow can be added later without redesigning the identity-race-avoidance logic.
**Notes:** User wants `createIndustryMember()` built as a standalone reusable function for this reason (captured as D-05 in CONTEXT.md).

| Option | Description | Selected |
|--------|-------------|----------|
| Leave industry_profiles untouched | Dead table, zero writers, no migration | ✓ |
| Drop it now | Remove table + Antenna FK as cleanup | |

**User's choice:** Leave it untouched.

**Follow-up: how to trigger account creation given Phase 8 has no UI**

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal internal admin route (`/admin/members`) | Real, reusable, is_admin-gated page + API route | ✓ |
| One-off script/CLI | Keeps Phase 8 fully UI-free | |

**User's choice:** Minimal internal admin route.

**Follow-up: future self-serve direction**

| Option | Description | Selected |
|--------|-------------|----------|
| Application + manual approval | Public apply form, account created on approval | ✓ (one of two acceptable) |
| Invite-code gated self-serve | Codes handed out, self-serve with valid code | ✓ (one of two acceptable) |
| Open self-serve role picker | Plain Artist/Industry choice, no gate | |

**User's choice:** Either application+approval or invite-code gated — both acceptable directions, undecided between them. Not building either now; only the underlying function needs to support it later.

**Follow-up: invite delivery mechanism**

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase inviteUserByEmail() | Built-in branded magic-link invite email | ✓ |
| Create silently, share access manually | Temp password shared directly | |

**User's choice:** Supabase inviteUserByEmail().

**Follow-up: invite form fields**

| Option | Description | Selected |
|--------|-------------|----------|
| Email + name + initial role(s) | Collected at creation time | ✓ |
| Email only | Rest filled in later by the invited member | |

**User's choice:** Email + name + initial role(s).

**Follow-up (raised via free text): dual-role members (industry + artist on one person)**

User asked: "how should we tackle the idea that someone can have an industry role and also be an artist and may want an artist profile or songwriter/user profile?"

Claude proposed keeping two separate layers: `member_type` (auth-level account type, fixed at creation, gates capabilities) vs. the existing `industry_roles` display-badge array (editable anytime, cosmetic). User initially asked for a plainer explanation, then confirmed:

| Option | Description | Selected |
|--------|-------------|----------|
| Keep member_type and industry_roles separate | Account type gates capability; badges are cosmetic display only | ✓ |
| Unify them | member_type itself becomes multi-value and drives both routing and display | |

**User's choice:** Keep them separate (after a plain-language re-explanation).

**Follow-up: do self-tagged badges unlock the other world's capabilities?**

| Option | Description | Selected |
|--------|-------------|----------|
| No — badges are cosmetic only | Real capability access stays gated by member_type | ✓ |
| Yes — tagging a role grants matching capabilities | Bigger scope, touches capability-gating logic | |

**User's choice:** No — badges are cosmetic only.

---

## Retroactive column-privacy lockdown

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, fix all of it now | One migration covers existing + new private columns | ✓ |
| Only guard new Wave 4 fields | Leaves existing legal/contact/rights exposure unfixed | |

**User's choice:** Fix all of it now.

| Option | Description | Selected |
|--------|-------------|----------|
| Public: name/genre/bio/links/stats/roles. Private: legal+contact+rights IDs. | Full column classification proposed | ✓ |
| I want to adjust this list | Walk through columns individually | |

**User's choice:** Accepted the proposed classification as-is.

**Follow-up: new Wave 4 columns classification**

| Option | Description | Selected |
|--------|-------------|----------|
| All public | member_type, pronouns, banner_url, open_to, featured_project_id, search_vector all public | ✓ |
| Something should be private | Flag exceptions | |

**User's choice:** All public.

---

## Reserved handle list

| Option | Description | Selected |
|--------|-------------|----------|
| System/brand words only | Short hardcoded list of routes + brand name | |
| Broader list incl. reserved-for-verified-brands | System words + curated industry/platform brand names | ✓ |

**User's choice:** Broader list including brand-name squatting protection.

**Follow-up: storage mechanism**

| Option | Description | Selected |
|--------|-------------|----------|
| Small `reserved_handles` table | Growable via INSERT, no migration needed to add more later | ✓ |
| Hardcoded constant list | Simpler, but needs a deploy per addition | |

**User's choice:** `reserved_handles` table.

---

## Block-enforcement wiring scope

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, wire it in now | no_block() added to existing tables' RLS in Phase 8 | ✓ |
| Defer wiring to Phase 13 | Only create table + helper now, wire later | |

**User's choice:** Wire it in now.

---

## Featured project eligibility

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, restrict to public/released only | DB-level CHECK/trigger | ✓ |
| No restriction | Any project, enforced at UI/query layer later | |

**User's choice:** Restrict to public/released only, enforced at the DB level.

---

## People-search composition (search_vector)

| Option | Description | Selected |
|--------|-------------|----------|
| Name + genres + location + role badges | Narrower, more precise | |
| Also include bio text | Broader recall, noisier | ✓ |

**User's choice:** Include bio text as well.

---

## Claude's Discretion

- Exact expanded reserved-brand-name list for `reserved_handles` seed data.
- Exact `no_block()` function signature and per-table RLS edit shape.
- Full migration file breakdown/numbering (starting at 034).
- Exact `notifications` actor-snapshot column set.
- `/admin/members` UI polish/layout — follow existing `/admin/curators`/`/admin/checklist` conventions.

## Deferred Ideas

- Future self-serve industry signup UX (application+approval vs. invite-code — undecided) — deferred past this milestone; only the underlying helper function needs to support it later.
- Cross-capability access (role badges unlocking Vault/Antenna access) — explicitly out of scope.
- `industry_profiles` table repurposing/migration — left untouched; revisit only if a concrete future need arises.
