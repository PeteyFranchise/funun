# Phase 15: Account Capability Model - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the single `member_type` value (`'artist' | 'industry'`, migration 034) with multiple capability grants on one account, so a member can hold both artist and industry capabilities without a second signup — e.g. a songwriter who is also an industry contact (A&R, music supervisor, etc.) doesn't need two separate logins to use both Sound Vault/Launchpad/PitchPlug and Antenna.

**Explicitly deferred until after beta testing begins** (user decision, captured 2026-07-07) — scheduled after Phase 13 in the roadmap for sequencing only, not a technical dependency. Does not block or reorder the Green Room rollout (Phases 9–13).

This phase surfaced from a real gap identified in conversation: today `member_type` is set once at account creation and gates capability (Phase 8 D-07); role badges are cosmetic-only and don't unlock the other side's tools (Phase 8 D-09). An industry member who is also a songwriter wanting Sound Vault access currently has no path to get it on their existing account.

</domain>

<decisions>
## Implementation Decisions

### Capability Request/Grant Flow
- **D-01:** An existing account gains a second capability via **self-serve request + admin approval** — not a fully open self-serve toggle, and not admin-only in both directions.
- **D-02:** The gate is **asymmetric**, matching today's actual trust bar exactly: **industry → artist is instant** (no review — artist signup is already open to anyone with zero verification today, so gating it here would be a new restriction with no justification). **Artist → industry requires admin approval** (mirrors today's admin-invite trust gate for industry claims — impersonation/credibility risk is real on this side).
- **D-03:** Build a **full in-app request UI + admin approval queue** this phase — not an informal out-of-band process. Extend the existing `/admin/members` pattern (`app/api/admin/members/route.ts`, `components/admin/MembersAdmin.tsx`) rather than inventing a separate surface.
- **D-04:** Curators (the fully separate Wave 3 magic-link account type, isolated from `artist_profiles`) **stay deliberately separate** — explicitly out of scope for this phase. Do not fold curator into this capability-grant model.

### Multi-Capability Navigation
- **D-05:** Unify around **one left-sidebar nav** — the existing `ArtistNav.tsx` pattern (`components/nav/ArtistNav.tsx`) becomes the single nav for both capabilities, replacing `app/(industry)/layout.tsx`'s separate topbar-only nav entirely. Not a mode/workspace switcher between two separate nav experiences.
- **D-06 (user-specified):** **Split Sheets** (currently an industry-only topbar link in `app/(industry)/layout.tsx`) folds into the existing **"Contract Locker"** sidebar room (`/contracts`, already in `ArtistNav.tsx`'s `ITEMS` array) — not a new standalone nav item. Contract Locker is already the rights/document room from Wave 2; split sheets belong there conceptually.
- **D-07:** The industry-only actions (**Post an opportunity**, **manage postings** — today's `/opportunities` and `/opportunities/new`) fold into the **existing Antenna room** (`/antenna`, already in `ArtistNav.tsx` for artist browse/apply) rather than getting a separate sidebar item. One room, contextual to what the account can do — Antenna grows a Post/Manage-postings section when the account has industry capability.
- **D-08:** The sidebar **hides what doesn't apply** to the account's actual capabilities — matches the existing hide-when-absent convention from Phase 14 (D-08 there: never show a disabled dead-end control). An industry-only account never sees Vault/Launchpad/PitchPlug/Contract Locker/etc. at all; an artist-only account's Antenna room has no Post/Manage-postings section. Do NOT show everything with inapplicable items grayed out.
- **D-09:** A **subtle sidebar entry point** near the Settings/profile footer (e.g. "Add industry access" / "Add artist access" — whichever the account lacks) surfaces the D-01 request flow. Not buried Settings-page-only with no proactive discovery.

### Badges vs. Capability Relationship
- **D-10:** Gaining a capability **auto-suggests/attaches a matching role badge** — not fully independent from today's cosmetic badge system. Mirrors how `createIndustryMember()` already pre-populates `roles`/`industry_roles` today. The badge stays freely editable afterward; this is a sensible default, not a new coupling that breaks Phase 8 D-09's "badges are cosmetic" rule.
- **D-11:** The capability **request form itself collects the role-badge pick up front** (reusing the existing `INDUSTRY_ROLE_GROUPS` chip picker from `MembersAdmin.tsx`) — not a separate follow-up step after approval. By the time an admin approves, the badge is already chosen and ready to attach.

### Existing Account Handling
- **D-12:** Every existing `artist_profiles` row (single `member_type` value today) gets **auto-preserved as its one existing grant** when the schema converts to a capability set. Zero behavior change for any current account — nobody needs to re-request a capability they already have. This applies to both real beta accounts (once beta starts) and any sandbox-created rows.
- **D-13:** **Capability revocation is explicitly out of scope for this phase.** Revoking a grant (e.g. a fraudulent industry claim) is Trust & Safety territory — Phase 13's block/report domain, not an identity-model concern. Admins can revoke manually via direct DB action until real volume justifies building revocation UI.

### Claude's Discretion
- Exact schema mechanism for the capability set (array column on `artist_profiles` vs. a join/grants table) — a migration mechanics detail, not a product decision. Researcher/planner's call, informed by the existing `member_type` CHECK constraint (migration 034) and the column-privilege lockdown precedent (migration 040) that must be preserved/extended correctly.
- Exact UI copy/layout for the admin approval queue — follow the existing `/admin/members` visual conventions (per D-03).
- Exact UI copy/placement details for the sidebar's subtle capability-request entry point (D-09) within the footer/Settings area.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 8 precedent (the schema/gate this phase revisits)
- `.planning/phases/08-identity-schema-foundation/08-CONTEXT.md` §D-07, D-08, D-09 — `member_type` semantics (auth-level, set once, gates capability), cosmetic role-badge layer, and the explicit "cross-capability access is a future access-control decision, not a schema one" deferral this phase now resolves
- `.planning/phases/08-identity-schema-foundation/08-VERIFICATION.md` — confirms migrations 034–040 are SQL-correct but not yet pushed to any live database; this phase's schema change must account for that pending state
- `supabase/migrations/034_member_identity_wave4.sql` — the `member_type` column + CHECK constraint (`'artist' | 'industry'`) being replaced/extended
- `supabase/migrations/039_handle_new_user_industry_branch.sql` — `handle_new_user()`'s industry branch; the signup-time creation path this phase's grant flow must not duplicate or conflict with
- `supabase/migrations/040_artist_profiles_column_privileges.sql` — column-privilege REVOKE/GRANT lockdown pattern that any new capability-related column/table must also follow (per the project's now-standard doctrine)

### Existing admin surface to extend (D-03)
- `lib/industry/createIndustryMember.ts` — the existing admin-invite creation helper; the capability-grant flow's approval action should reuse/parallel this pattern rather than reinventing it
- `lib/industry/roleMapping.ts` — slug→`ProfileRole` preset mapping, reusable for D-11's request-time badge picker
- `app/api/admin/members/route.ts`, `app/(admin)/admin/members/page.tsx`, `components/admin/MembersAdmin.tsx` — the exact admin surface pattern (per-page `is_admin` gate, chip picker, optimistic UI) to extend into an approval queue

### Navigation unification (D-05–D-09)
- `components/nav/ArtistNav.tsx` — the sidebar pattern to unify around; already contains `Contract Locker` (`/contracts`) and `Antenna` (`/antenna`) items that D-06/D-07 fold industry actions into
- `app/(artist)/layout.tsx` — current artist layout wrapping `ArtistNav`
- `app/(industry)/layout.tsx` — the separate topbar-only industry nav being retired in favor of the unified sidebar; currently has exactly 3 links (`Opportunities`, `Split Sheets`, `Post`), all three accounted for by D-06/D-07
- `middleware.ts` — current route-protection logic; must be checked for any `member_type`-based routing assumptions that the capability-set change could break

### Project-level
- `.planning/ROADMAP.md` §"Phase 15: Account Capability Model" — goal, sequencing (`Depends on: Phase 13`, non-technical), requirements TBD
- `.planning/PROJECT.md` §"Key Decisions" — unified-identity-table architectural bet this phase extends, not replaces

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/admin/MembersAdmin.tsx`'s grouped `INDUSTRY_ROLE_GROUPS` chip picker — direct reuse for the capability request form's badge-selection step (D-11)
- `lib/industry/createIndustryMember.ts`'s atomic `app_metadata`-at-creation pattern — the underlying race-avoidance technique likely needs a parallel (not identical, since this grants onto an *existing* account rather than creating a new one) approach for the grant action
- `components/nav/ArtistNav.tsx`'s `ITEMS` array + hide/show rendering pattern — direct template for making sidebar items conditional on capability (D-08)

### Established Patterns
- Admin routes independently re-verify `is_admin` server-side (not just layout gating) — the new approval queue route must follow this
- Column-level REVOKE/GRANT lockdown on top of RLS is now standing project doctrine (Phase 8 D-10/D-11) — any new capability-tracking column/table needs this from day one, not retrofitted later
- Hide-when-absent empty-state convention (Phase 14 D-08) — directly reused for D-08's sidebar behavior here

### Integration Points
- `components/nav/ArtistNav.tsx` → gains conditional rendering based on capability set, plus the new "Add industry/artist access" entry point (D-09)
- `app/(industry)/layout.tsx` → retired; its 3 links redistribute into `ArtistNav.tsx`'s existing Contract Locker and Antenna items
- New capability-request route + admin approval queue (D-01–D-03) — parallels `/admin/members` but for granting onto existing accounts rather than creating new ones
- `middleware.ts` → needs review for `member_type`-based assumptions once the schema changes from single value to a set

</code_context>

<specifics>
## Specific Ideas

- The user specifically identified that "Split Sheets" should live inside "Contract Locker" since that room already exists in the sidebar and is the natural home for rights/document artifacts — a concrete, already-decided mapping, not left to Claude's discretion.
- The user wants one unified left-sidebar nav, not a mode/workspace switcher — the left sidebar "makes a lot of sense for most of the rooms, if not all."

</specifics>

<deferred>
## Deferred Ideas

- **Curator unification** — folding curators into this same capability-grant model as a third grantable capability. Explicitly deferred (D-04); curators stay separate as Wave 3 designed them.
- **Capability revocation UI** — an admin-facing "pull back a grant" flow. Explicitly deferred (D-13) to Phase 13 (Trust & Safety) territory or a later phase if volume ever justifies it.

### Reviewed Todos (not folded)
None — `todo.match-phase` returned zero matches for this phase.

</deferred>

---

*Phase: 15-Account Capability Model*
*Context gathered: 2026-07-07*
