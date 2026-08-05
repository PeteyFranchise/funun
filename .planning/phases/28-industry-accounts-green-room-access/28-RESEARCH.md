# Phase 28: Industry Accounts & Green Room Access Model - Research

**Researched:** 2026-08-05
**Domain:** Account taxonomy reconciliation, capability-gating, RLS-backed social feature access, legacy data-model retirement (Supabase/Next.js/TypeScript monolith)
**Confidence:** HIGH — every claim below is grounded in a direct file read or grep of this repository. No external libraries are introduced by this phase, so no web research or package-legitimacy audit applies (see `## Package Legitimacy Audit`).

## Summary

This is a **confirm + reconcile** phase, not greenfield. Reading the actual code (not just the CONTEXT.md
ground-truth summary) surfaces that the substrate is **further along in some places and more broken in others**
than the context doc implies. Three findings change the shape of the buildable plan:

1. **The Antenna "industry-gated" claim is only half-true — and the primary Industry account creation path
   cannot currently satisfy either half of the gate.** `POST /api/antenna/opportunities` requires BOTH
   `hasCapability(user,'industry')` (reads `capability_grants`, status `approved`) AND a row in the legacy
   `industry_profiles` table (migration 001) keyed by `user_id`. Nothing in the codebase ever writes an
   `industry_profiles` row, and `createIndustryMember()` (the admin-invite path) never writes a
   `capability_grants` row either — it sets `user_profiles.member_type='industry'` directly via the
   `handle_new_user()` trigger's industry branch (migration 039), which predates the capability model
   (migration 042) and was never wired to it. **Net effect: today, literally no account — however it was
   created — can post an Antenna opportunity.** This is the single highest-priority fix bundled into this
   phase's "confirm/wire" scope.
2. **The Green Room has no account-type gate at all today — of any kind.** Not in `middleware.ts` (the
   `/green-room` path prefix is absent from `isProtected`), not in the page (`app/(artist)/green-room/page.tsx`
   renders unconditionally), not in the API routes (`GET /api/green-room/feed`, `POST /api/green-room/posts`,
   `GET /api/green-room/discover` each only check `if (!user) return 401`), and not in RLS
   (`green_room_posts_insert_own` is `WITH CHECK (author_id = auth.uid())` — no `member_type` or capability
   join). Any authenticated Supabase session — artist, industry, or a future buyer/Team-Member session that
   happens to share the same `auth.users` table — can post today. The locked access matrix (Artist ✓, Industry
   ✓, Team-Member-as-Funūn ✗, Client-Partner deferred) is a **new** gate to add, not a confirmation of an
   existing one.
3. **`member_type` (migration 034, the pre-capability-model discriminant) and `capability_grants` (migration
   042, Phase 15's request/approve system) are two independently-writable sources of truth that have already
   drifted.** `grantCapability()`/the admin approve route update `roles` (badges) but never touch
   `member_type`. An artist who self-requests-and-is-approved for `industry` via the existing `CapabilityCta`
   component ends up with `hasCapability(user,'industry') === true` but `member_type` still `'artist'` — so
   the admin members list (`member_type='industry'` filter) and Green Room discover's capability filter both
   miss them, while the Antenna gate (once fixed per #1) would admit them. Any reconciliation work in this
   phase needs to either pick one source of truth or keep both in lockstep — not add a third.

The curator-retirement side is comparatively clean: `role='curator'` (migration 030) is a well-isolated
early-return branch in `handle_new_user()`, gated entirely by `app_metadata.role`, with a single call site
(`app/api/curators/claim/[token]/route.ts`) that can be repointed to an industry-account-creating path without
touching the `curators` CRM table's schema. The one real surprise: **PitchPlug (`/tools/pitchplug`) has zero
code relationship to the `curators` table or the curator pitch-send flow.** The actual curator send mechanism
(`PitchComposer`, `pitch_history`) lives inside **Launchpad** (`/launchpad/[projectId]`), a different tool
entirely. "Move the curators directory under PitchPlug" as stated in CONTEXT.md is achievable only as a
**navigation/placement** change (where the admin list and the artist-facing `/curators` browse page are
surfaced from) — it is not a description of any existing functional wiring, and the plan must not assume
PitchPlug already sends pitches to curators.

**Primary recommendation:** Treat this phase as three independent, sequenceable tracks — (A) fix the Antenna
double-gate + decide the `member_type`/`capability_grants` reconciliation, (B) add the Green Room access gate
(the matrix is currently unenforced, not pre-built), (C) retire `role='curator'` + repoint its claim flow +
relocate curator-directory navigation under PitchPlug. None of the three depends on new infrastructure or new
packages; all are additive migrations (human-gated) plus route/RLS edits to existing files.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Account-type discriminant (member_type / capability) | Database / Storage | API / Backend | `user_profiles.member_type` + `capability_grants` are the source of truth; every gate (nav, route, RLS) reads them, never re-derives independently |
| Antenna opportunity-posting gate | API / Backend | Database / Storage | `hasCapability()` is a server-only check (service-role client); RLS on `opportunities` is a secondary backstop not yet audited in this research |
| Green Room access gate (new) | API / Backend | Database / Storage | Must be enforced server-side in each `/api/green-room/*` route (today's `!user` check is insufficient) and mirrored in RLS `WITH CHECK` clauses so PostgREST-direct access can't bypass it — mirrors the `no_block()` SECURITY DEFINER precedent from Phase 8 |
| Green Room UI visibility (nav item, page shell) | Browser / Client via Frontend Server (SSR) | — | `ArtistNav`'s `capabilities` prop is fetched server-side in `app/(artist)/layout.tsx`; hiding is UI-convenience only, never the authority boundary (matches D-08 precedent already in this codebase) |
| Industry-account creation (admin invite) | API / Backend | Database / Storage | `createIndustryMember()` + `handle_new_user()` trigger; must be extended to also write `capability_grants` |
| Industry-account creation (community/Team-Member invite, new) | API / Backend | Database / Storage | New invite/token mechanism required — no non-admin invite path exists today; likely mirrors the token-claim pattern already proven by `curators.claim_token` |
| Curator CRM directory (`curators` table) | Database / Storage | API / Backend | Stays a plain CRM table; only its **navigation placement** changes (moves under PitchPlug), not its schema or RLS posture |
| Curator claim → Industry account | API / Backend | Database / Storage | Single call site (`app/api/curators/claim/[token]/route.ts`) repointed from `admin.createUser({app_metadata:{role:'curator'}})` to an industry-account-creating equivalent |
| `role='curator'` legacy account retirement | Database / Storage | API / Backend | `handle_new_user()`'s curator early-return branch (migration 030) and the `(curator-portal)` route group become dead code once the claim route stops minting `role='curator'` accounts |

## User Constraints

<user_constraints>
### Locked Decisions

**The account taxonomy (owner-confirmed 2026-08-05):**

| Account | Who | Tools / access |
|---------|-----|----------------|
| **Funūn Team Member** (internal) | Funūn staff, role-typed (Leadership/AE/BD/…) | The Team Console (Phase 25) |
| **Artist** (external creator) | Anyone with song credits — artists, writers, producers, all creative roles | Sound Vault + Contract Locker + Split Sheets + Antenna/PitchPlug; Green Room + posts |
| **Industry** (external) | Curators, A&R (other cos/labels), music execs, publishers, music supervisors, playlist owners, radio, managers, etc. | Green Room + social profile; tools to POST opportunities into Antenna; per-subtype toolsets (future); invite-only |
| **Client Partner** (external buyer) | Sync buyers, B2B | Buyer portal (Phase 23), AE-managed. Green Room = FUTURE discussion |

- Artist account = anyone with song credits who wants to use the Sound Vault side. Green Room access + social posts.
- Industry account = external music-industry people whose job is to surface opportunities to artists and
  participate in the Green Room. Different goals/tools/permissions from an artist. Invite-only. Each subtype
  eventually gets its own toolset (a curator's tools ≠ a publisher's ≠ a supervisor's).

**Curators — RESOLVED (owner 2026-08-05):** No separate curator account type.
- The `curators` table = CRM data — a directory of pitch-target contacts Funūn has NOT yet onboarded with their
  own accounts. Not an account type.
- The only real curator *account* = an Industry account (`member_type='industry'`, `playlist_curator`).
- Retire the legacy `role='curator'` account (migration 030) — it predates Industry accounts and is strictly
  weaker (self-edits its directory row only; no Green Room, no tools). Repoint the existing claim/join flow at
  Industry-account creation (a claimed directory contact becomes an Industry account, not the thin legacy one).
  Beta likely has ~0 real `role='curator'` accounts to migrate — cheap cleanup.
- Curator acquisition loop (owner vision): the directory is a growth funnel — the Funūn community + Team
  Members recruit directory contacts one by one to accept an invite and join as Industry accounts (then they
  post opportunities + participate in the Green Room). So Industry invites can come from the community, not
  only staff.
- Populating the directory: seeded manually + via discovery/scraping tools to find curators / playlist owners /
  radio / etc. as new pitch-target contacts (a future tool — mind each platform's ToS/robots + data-privacy/
  cold-outreach law when built).
- Placement (owner 2026-08-05): the `curators` directory (the CRM data + its management) lives within PitchPlug
  for now — PitchPlug is the tool that pitches to these contacts, so keep the directory as a PitchPlug asset
  rather than a standalone curator system or a big new admin area. Don't over-build it. This placement is
  provisional ("for now"); the account reconciliation above (curator = Industry account, retire `role='curator'`)
  is a separate concern from where the directory data lives. (Today it's `/admin/curators` — folding it under
  PitchPlug is the near-term move.)

**Green Room access matrix (owner 2026-08-05):**
- Artist → ✓ access + post.
- Industry → ✓ access + social profile + post + opportunity-posting tools.
- Team Member (as Funūn) → ✗ may NOT post under a Funūn email address. A Team Member is welcome to create a
  personal Artist/Industry account (own email/username) to participate.
- Client Partner → DEFERRED — future discussion whether they can post. Note only for now.

**Ground truth — what already exists (this is confirm/extend, NOT greenfield):**
- `member_type` enum `('artist','industry')` — migration 034. The two external types exist.
- Industry accounts are invite-based — `lib/industry/createIndustryMember.ts` + `lib/email/industryInvite.ts`.
- Subtypes already defined — `lib/industry-roles.ts` INDUSTRY_ROLE_GROUPS includes `playlist_curator`,
  `ar_executive`, `publisher`, `music_supervisor`, `manager`, `tour_manager` (+ creative role slugs).
- Antenna opportunity posting already gated to industry — `hasCapability(user,'industry')` + `industry_profiles`
  (`app/api/antenna/opportunities/route.ts`: "Only accounts with industry access can post opportunities").
- Green Room exists — `app/(artist)/green-room/page.tsx`; social (wall/endorsements/DMs/follows, Phases 11–14).
- Capability model — Phase 15: `hasCapability(user, 'industry')`.

> **Research correction to the last two "ground truth" bullets** (verified against code, see Summary #1/#2):
> the Antenna gate is real code but is currently unsatisfiable by any account (the `industry_profiles` half has
> zero writers; the capability half is never populated by the industry-invite creation path); the Green Room
> "exists" as a page and social substrate but currently has **no account-type gate of any kind** — access today
> is "any authenticated session," not "artist or industry."

### Claude's Discretion
CONTEXT.md does not carry a dedicated "Claude's Discretion" section — the open questions below function as the
discretion area: how to enforce the Funūn-email posting rule (or defer it), the exact mechanics of
community/Team-Member industry invites, and how granular per-subtype tooling should be (explicitly deferred).

### Deferred Ideas (OUT OF SCOPE)
- Client Partners posting in the Green Room — explicit future discussion (owner, note only for now).
- Full per-subtype industry toolsets (iterative, one subtype at a time).
- Enforcement mechanics for the Funūn-email Green Room rule (if we choose to hard-enforce) — Team Member
  accounts (`funun_staff`, Phase 25) do not exist in the codebase yet (Phase 25 has plans authored but zero
  runtime code merged — confirmed by grep, see `## Runtime State Inventory`), so there is nothing to gate today;
  design the gate to be inert until Phase 25 ships.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are registered for Phase 28 in `.planning/REQUIREMENTS.md` (confirmed by direct read — the
file's traceability tables run through Phase 22; nothing for 23–28 exists yet, matching the same
"plan references requirement IDs that were never registered" gap already logged for Phases 16/22 in
`.planning/STATE.md`). CONTEXT.md also states "none formally registered." Per instruction, this research
proposes **provisional** IDs only — the planner/executor must register them in REQUIREMENTS.md, not assume
they already exist there.

| Provisional ID | Description | Research Support |
|----|-------------|------------------|
| INDUSTRY-01 | Antenna opportunity-posting gate actually admits a legitimately-created Industry account (fix the `capability_grants` write gap in the industry-creation path AND resolve/remove the dead `industry_profiles` double-gate) | Summary #1; `## Common Pitfalls` Pitfall 1 |
| INDUSTRY-02 | Green Room access + posting is gated to `member_type IN ('artist','industry')` (or the equivalent capability check), enforced server-side in every `/api/green-room/*` route and mirrored in RLS `WITH CHECK` | Summary #2; `## Architecture Patterns` Pattern 1 |
| INDUSTRY-03 | Industry accounts can be invited by community members and Team Members, not only admins (new invite mechanism; approval-trust model to be decided) | `## Open Questions` #1 |
| INDUSTRY-04 | `role='curator'` (migration 030) legacy account type retired: the claim flow (`app/api/curators/claim/[token]/route.ts`) creates an Industry account (`playlist_curator`) instead of a `role='curator'` account | `## Architecture Patterns` Pattern 3; `## Common Pitfalls` Pitfall 4 |
| INDUSTRY-05 | Curators CRM directory (`/admin/curators` management, `/curators` artist-facing browse) relocated under the PitchPlug navigation surface, with no change to the `curators` table schema or the Launchpad-owned pitch-send mechanism | `## Common Pitfalls` Pitfall 5 |
| INDUSTRY-06 | `member_type` and `capability_grants` reconciled to a single source of truth (or kept provably in lockstep) so the admin members list, Green Room discover filter, and Antenna gate never disagree about who is "industry" | Summary #3; `## Common Pitfalls` Pitfall 2 |
| INDUSTRY-07 | Team-Member-as-Funūn Green Room posting block — designed but left inert/deferred until Phase 25 ships `funun_staff` | `## Runtime State Inventory`; Deferred Ideas |

</phase_requirements>

## Package Legitimacy Audit

Not applicable — this phase installs no new npm/PyPI/crates packages. Every change is to existing TypeScript
modules, existing Supabase tables/RLS policies, and existing Next.js routes. `## Package Legitimacy Audit`
protocol steps were reviewed and confirmed inapplicable; no `gsd-tools query package-legitimacy check` run was
needed.

## Standard Stack

No new libraries. The phase operates entirely within the existing stack already documented in this repo's
CLAUDE.md: Next.js 15 App Router API routes, `@supabase/supabase-js` (service-role client for privileged writes,
session client for RLS-scoped reads), Zod is available but not currently used in the touched files (they use
manual allowlist validation — match the existing convention, don't introduce Zod here unless a specific new
input surface warrants it).

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.45.0 (existing) | `createServiceClient()` writes to `capability_grants`/`user_profiles`/`curators`; `createApiClient()` session-scoped reads | Already the project's sole DB client |
| `@supabase/auth-helpers-nextjs` | 0.10.0 (existing) | `createMiddlewareClient()` in `middleware.ts` if the Green Room path is added to `isProtected` | Already wired into the auth flow |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| none new | — | — | — |

### Alternatives Considered
Not applicable — no new capability requires a new library. The one design choice with real alternatives is the
**invite mechanism** for community/Team-Member industry invites (see `## Open Questions` #1): reuse the
existing admin-invite code path (`createIndustryMember()`, immediate account creation) behind a widened
authorization check, vs. a new email-allowlist + self-serve-claim pattern mirroring Phase 27's proposed
`artist_invites` table and the existing `curators.claim_token` precedent. Both are pure application code — no
library tradeoff.

**Installation:** none required.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │         Account creation (3 paths)           │
                    │                                               │
  Admin invite ─────┼──▶ POST /api/admin/members (verifyAdmin())    │
  (existing)         │        └─▶ createIndustryMember()            │
                    │              └─▶ admin.createUser()           │
                    │                    app_metadata.role='industry'│
                    │                    └─▶ handle_new_user() (039) │
                    │                          INSERT user_profiles  │
                    │                          member_type='industry'│
                    │                          ⚠ NO capability_grants│
                    │                             row written        │
                    │                                               │
  Self-request      │──▶ POST /api/capabilities/request             │
  (existing,         │        └─▶ requestCapability()                │
  artist→industry)   │              artist path: instant approve     │
                    │              industry path: 'pending' row      │
                    │        Admin: POST /api/capabilities/approve/  │
                    │              [grantId] → grantCapability()     │
                    │              writes capability_grants=approved │
                    │              ⚠ NEVER writes member_type         │
                    │                                               │
  Community/Team    │──▶ [NOT BUILT — INDUSTRY-03 gap]               │
  invite (new)       │                                               │
                    └─────────────────────────────────────────────┘
                                       │
                                       ▼
              ┌────────────────────────────────────────────────────┐
              │  Two independently-writable truth sources           │
              │  user_profiles.member_type   capability_grants      │
              │  (set once, at creation)     (request/approve rows) │
              │        ⚠ CAN DRIFT — see Common Pitfalls #2         │
              └────────────────────────────────────────────────────┘
                    │                              │
       ┌────────────┴──────────┐      ┌────────────┴───────────────┐
       ▼                        ▼      ▼                             ▼
 Admin members list      Green Room discover   ArtistNav capability   Antenna POST gate
 (reads member_type)     capability filter      badges (reads          (reads
                         (reads member_type)     capability_grants)     capability_grants
                                                                         AND industry_profiles
                                                                         — the latter has
                                                                         ZERO writers anywhere)

              ┌────────────────────────────────────────────────────┐
              │  Green Room access — TODAY: no gate beyond "user    │
              │  exists" at every layer:                            │
              │  middleware.ts        — /green-room NOT in          │
              │                          isProtected                │
              │  page.tsx              — renders unconditionally    │
              │  /api/green-room/feed  — checks only `if (!user)`   │
              │  /api/green-room/posts — checks only `if (!user)`   │
              │  RLS insert policy     — WITH CHECK                 │
              │                          (author_id = auth.uid())   │
              │  → this phase must ADD the artist/industry gate,    │
              │    not confirm a pre-existing one                   │
              └────────────────────────────────────────────────────┘

              ┌────────────────────────────────────────────────────┐
              │  Curator retirement path                             │
              │  curators (CRM table, migration 030) — unchanged     │
              │  claim_token / claim_token_expires_at / claimed_by   │
              │      │                                               │
              │      ▼                                               │
              │  POST /api/curators/claim/[token]                    │
              │      TODAY: admin.createUser({app_metadata:           │
              │             {role:'curator'}}) → handle_new_user()    │
              │             early-return branch (migration 030)       │
              │      TARGET: call an industry-account-creating        │
              │             equivalent (member_type='industry',       │
              │             role_slugs=['playlist_curator']) instead  │
              │      │                                               │
              │      ▼                                               │
              │  (curator-portal) route group + role='curator'        │
              │  branch become dead code once no new claim mints      │
              │  that role — retire, don't delete blind (see          │
              │  Runtime State Inventory)                             │
              └────────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new top-level directories. Touched areas, by concern:

```
lib/industry/
├── createIndustryMember.ts   # extend: also write capability_grants (INDUSTRY-01)
├── roleMapping.ts            # unchanged
lib/capabilities/
├── grant.ts                  # extend or add a sibling helper that also syncs member_type (INDUSTRY-06)
├── check.ts                  # unchanged — hasCapability() is already correct once inputs are correct
lib/green-room/
├── feed-query.ts             # add member_type/capability gate to loadGreenRoomFeed() (INDUSTRY-02)
├── post-write.ts             # add gate to createGreenRoomPost() (INDUSTRY-02)
├── discover.ts                # already filters by member_type for browse — no change needed there
app/api/antenna/opportunities/
├── route.ts                  # remove or repoint the dead industry_profiles gate (INDUSTRY-01)
app/api/curators/claim/[token]/
├── route.ts                  # repoint from role='curator' to industry-account creation (INDUSTRY-04)
app/(admin)/admin/curators/    # relocate nav entry point under PitchPlug surface (INDUSTRY-05)
app/(artist)/curators/         # relocate nav entry point under PitchPlug surface (INDUSTRY-05)
app/(artist)/tools/pitchplug/  # gains the curators-directory link/section (INDUSTRY-05)
supabase/migrations/           # new additive migration(s) — human-gated, see below
```

### Pattern 1: Server-side capability/member_type gate for a socially-exposed route

**What:** Every route in `app/api/green-room/*` currently checks only `if (!user) return 401`. The Antenna
route shows the correct shape to copy: check membership BEFORE doing any privileged read/write, and return a
clear 403.
**When to use:** Any route this phase adds account-type gating to (Green Room feed/posts/discover; the
Antenna fix).
**Example (the pattern already proven in this codebase):**
```typescript
// Source: app/api/antenna/opportunities/route.ts (existing, verified live in this repo)
if (!(await hasCapability(user.id, 'industry'))) {
  return NextResponse.json(
    { error: 'Only accounts with industry access can post opportunities' },
    { status: 403 }
  )
}
```
Apply the same shape to Green Room routes, but the check should likely be `member_type IN ('artist','industry')`
(or `hasCapability(user,'artist') || hasCapability(user,'industry')`) rather than a single capability — the
locked matrix admits BOTH lanes. Decide which source of truth (member_type vs capability_grants) is
authoritative before writing this (see Open Questions #2/Pitfall #2) — do not check both independently, that
just creates a third place they can disagree.

### Pattern 2: RLS-layer backstop mirrors the app-layer gate

**What:** This codebase's own established doctrine (see `no_block()` SECURITY DEFINER precedent, Phase 8, and
`hasCapability()`'s own doc comment: "Nav-hiding... is defense-in-depth only; this is the authoritative
permission boundary") is that a client-visible check is never sufficient — RLS must independently enforce the
same rule so a direct PostgREST call can't bypass the API route.
**When to use:** When adding the Green Room account-type gate, also tighten
`green_room_posts_insert_own`'s `WITH CHECK` clause (migration 057) to require the author's `member_type` be
`artist` or `industry` — not just `author_id = auth.uid()`.
**Example:**
```sql
-- Illustrative — verify exact column/table names against the live schema before writing
-- (migration 076 renamed artist_profiles → user_profiles; this table is now user_profiles).
CREATE POLICY "green_room_posts_insert_own" ON green_room_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND member_type IN ('artist', 'industry')
    )
  );
```
This migration is **human-gated** per this project's standing convention (`supabase db push` is never run by
an executor agent) — draft it, do not push it.

### Pattern 3: Retiring an `app_metadata.role` branch safely

**What:** `handle_new_user()` already demonstrates the safe shape for an early-return account-type branch
(curator, migration 030; industry, migration 039; buyer, migration 080). Retiring `role='curator'` means the
**claim route** (the only writer of `app_metadata:{role:'curator'}` in the codebase) stops calling
`admin.createUser({app_metadata:{role:'curator'}})` and instead calls an industry-account-creating path. The
`handle_new_user()` curator branch itself can stay as dead code (safe, inert, no new accounts will ever hit it)
or be removed in a follow-up cleanup migration — removing it is NOT required to "retire" the account type, only
repointing the one call site is.
**When to use:** INDUSTRY-04.
**Example:**
```typescript
// Source: app/api/curators/claim/[token]/route.ts (existing — the exact call site to change)
// TODAY:
const { data: created, error: createError } = await service.auth.admin.createUser({
  email: curator.email,
  email_confirm: true,
  app_metadata: { role: 'curator' },
})
// TARGET (illustrative — reuse createIndustryMember()'s shape, not a hand-rolled duplicate):
// createIndustryMember({ email: curator.email, displayName: curator.name,
//   roleSlugs: ['playlist_curator'], invitedBy: undefined })
// Note: createIndustryMember() also sends a Resend invite email itself — the claim route's
// own sendEmail() call for the magic link must not double-send. Reconcile the two email flows
// during planning, don't just splice function calls together.
```

### Anti-Patterns to Avoid
- **Checking `member_type` in some gates and `capability_grants` in others without reconciling them first**
  — this phase's very purpose is confirm/reconcile; adding a fourth inconsistent gate (after Antenna,
  admin-members-list, and Green Room-discover already disagree) makes the problem worse, not better.
- **Assuming PitchPlug already has curator-pitching logic to attach the directory to.** It doesn't — it's an
  unrelated AI copy-generator. "Move under PitchPlug" is a navigation change; do not attempt to merge
  `PitchComposer`'s `pitch_history` send flow into `/tools/pitchplug` as part of this phase unless the owner
  explicitly re-scopes that (it isn't in CONTEXT.md's locked decisions).
- **Deleting `role='curator'`'s `handle_new_user()` branch or the `(curator-portal)` route group in the same
  migration/commit as the claim-route repoint.** Do it in two steps: repoint the claim route first (stops
  minting new `role='curator'` accounts), confirm via `supabase migration list` + a manual check that zero
  claims happened during the cutover window, THEN remove the dead branch/route group in a follow-up.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Industry account creation | A second `admin.createUser()` call site for the claim-route repoint | `createIndustryMember()` (already exists, already handles the atomic `app_metadata.role` set + `handle_new_user()` contract + Resend invite email) | Avoids re-introducing the exact phantom-row race this codebase has already fixed twice (curator branch, industry branch — both documented in migration 039's own comments) |
| Capability check | A new ad-hoc `SELECT` against `capability_grants` inline in a route | `hasCapability()` (`lib/capabilities/check.ts`) | Already the single source of truth for the `approved`-only invariant; duplicating the query risks missing the `status='approved'` filter |
| Green Room membership gate | A new standalone `isGreenRoomMember()` helper with its own query shape | Extend `hasCapability()`'s pattern or add a thin wrapper that reads `member_type`/`capability_grants` — but pick ONE source, matching whichever this phase designates authoritative | Prevents a fourth independent gate implementation |

**Key insight:** every "don't hand-roll" item here is about **reusing this repo's own existing helpers**, not
about an external library — the whole phase is internal reconciliation.

## Runtime State Inventory

> This phase is a rename/retire/migration-adjacent phase (retiring `role='curator'`), so this section is
> required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `curators.claimed_by` — any existing claimed rows point at `auth.users` accounts with `app_metadata.role='curator'`. Owner states beta likely has ~0 real claims. **Cannot be verified from this codebase read alone** — requires a live-DB `SELECT COUNT(*) FROM curators WHERE claimed_by IS NOT NULL` (human-gated, same convention as every other live-DB check in this project). If any exist, they need a **data migration** (convert their `app_metadata.role` from `curator` to `industry`, backfill `user_profiles`/`capability_grants` rows for them) — not just a code-edit for future claims. | Data migration (conditional on the live-DB count) + code edit (claim-route repoint) |
| Live service config | None found — no external service (Resend, Stripe, etc.) stores `role='curator'` or `member_type` values in its own config; the `industryInviteEmail()`/curator claim emails are stateless templates, not stored config. | None |
| OS-registered state | None found — this is a pure web-app account-model change, no OS-level task/process registration involved. | None |
| Secrets/env vars | None found — no env var references `curator` or `member_type`. | None |
| Build artifacts | None found — no compiled/installed artifact carries the `role='curator'` name. `.next/` build output includes `/curators/claim` route chunks (expected; not stale, they're the current live route). | None |
| **Runtime code paths (not in the standard 5 categories, but load-bearing here)** | `app/(curator-portal)/layout.tsx` + `app/(curator-portal)/portal/page.tsx` — the entire curator self-serve portal, gated on `app_metadata.role==='curator'`. Becomes unreachable dead code (not deleted-on-day-one) once the claim route stops minting that role — any account that DID claim under the old flow still needs this portal to keep working until/unless it's individually migrated. | Do not delete in this phase unless the live-DB count above is confirmed zero; if nonzero, this portal must stay live for those accounts (or they must be individually migrated to Industry first) |
| **Phase 25 (`funun_staff`) dependency** | Grepped the full non-`.planning` codebase for `funun_staff`, `team-console`, `team_members` — **zero matches**. Phase 25 (`.planning/phases/25-funun-team-accounts-ae/`) has 10 plan files and a CONTEXT/RESEARCH/PATTERNS/VALIDATION doc set but **no executed code** — confirmed by `.planning/STATE.md`'s `current_phase: 22` and the absence of any `25-*-SUMMARY.md` file. | The "Team Member as Funūn may not post" rule (INDUSTRY-07) has no runtime principal to gate against yet — design it to be inert (a no-op check against a table that doesn't exist yet, or simply deferred entirely) rather than build speculative code against an unshipped schema |

**Nothing found in category:** Live service config, OS-registered state, secrets/env vars, build artifacts —
all explicitly verified empty by grep, not skipped.

## Common Pitfalls

### Pitfall 1: The Antenna "industry gate" is currently a guaranteed 403 for every account
**What goes wrong:** A newly admin-invited Industry member (the intended, documented creation path) tries to
post an opportunity and gets `403 Only accounts with industry access can post opportunities` — despite being a
legitimate, correctly-`member_type`-tagged Industry account.
**Why it happens:** Two independent unmet preconditions: (1) `createIndustryMember()`/`handle_new_user()`'s
industry branch never inserts a `capability_grants` row, so `hasCapability(user,'industry')` is false; (2) even
if that were fixed, the route ALSO requires a row in `industry_profiles` (migration 001), which has zero
writers anywhere in the app (confirmed by full-codebase grep — the only references are the migration's own
`CREATE TABLE`/RLS/trigger and this one dead `SELECT`).
**How to avoid:** Fix #1 by having `createIndustryMember()` (or `handle_new_user()`'s industry branch) also
insert an `approved` `capability_grants` row at creation time, mirroring the `source: 'signup'` value already
defined in migration 042's CHECK constraint (it lists `'signup'` as a valid source — this looks like it was
anticipated and never wired up). Fix #2 by either (a) removing the `industry_profiles` check from the Antenna
route entirely (it's checking a table nothing populates — almost certainly a stale leftover from before
`member_type`/`capability_grants` existed), or (b) if a genuinely richer "industry profile" concept is wanted,
building the write path — but that's new scope, not a reconciliation of what's there. Recommend (a) unless the
owner has a reason to keep `industry_profiles` alive.
**Warning signs:** Any manual UAT of "invite an industry member, have them post an opportunity" will
immediately surface this as a 403 — this should be caught in this phase's own verification, not discovered
later.

### Pitfall 2: `member_type` and `capability_grants` silently disagree
**What goes wrong:** An artist who uses the existing `CapabilityCta` ("+ Add industry access") self-serve flow
and gets admin-approved ends up with `hasCapability(user,'industry')===true` but `user_profiles.member_type`
still `'artist'`. The admin `/admin/members` list (filters `member_type='industry'`) won't show them. Green
Room discover's `capability=industry` filter (also `member_type`-based) won't surface them as industry either.
Any Antenna-posting fix from Pitfall 1 that reads `capability_grants` WOULD let them post — so they can act as
industry without appearing as industry anywhere in the admin/discovery surfaces.
**Why it happens:** `grantCapability()` (`lib/capabilities/grant.ts`) only writes `capability_grants` +
`roles` (badges) — it was written for the "add a second capability to an existing account" use case and never
needed to touch `member_type`, since `member_type` predates it and was designed as a single immutable
discriminant set at signup.
**How to avoid:** Decide, as part of this phase's planning, whether `member_type` becomes fully derived from
`capability_grants` (e.g., a view/trigger that keeps it in sync, or retiring reads of `member_type` in favor of
`hasCapability()` everywhere) or whether `capability_grants` writes should also update `member_type` going
forward. Do not add a third gate that reads yet another source.
**Warning signs:** Any test or manual check that creates an account via one path (admin invite vs. self-request)
and asserts on a DIFFERENT path's read (e.g., admin list) will fail unless this is resolved.

### Pitfall 3: Green Room's "no gate" is not a bug in isolation — it becomes an information-disclosure risk once Client Partners/Team Members exist
**What goes wrong:** Today, "any authenticated session can post/read the Green Room feed" is low-risk because
only artist and industry accounts exist in practice. But `buyer_orgs`/`buyer_members` (migration 080) already
create real `auth.users` rows with the SAME cookie-session auth mechanism, explicitly WITHOUT a `user_profiles`
row (D-11). If a buyer's session ever reaches `POST /api/green-room/posts`, the insert would likely succeed
(RLS only checks `author_id = auth.uid()`), and the post would then render for that "author" using whatever
`green_room_posts` → author-lookup join exists in the feed query — worth explicitly checking during planning
whether that join gracefully no-ops for an author with no `user_profiles` row, or errors/renders a broken card.
**Why it happens:** The Green Room predates the four-lane taxonomy (it shipped in Wave 4, Phases 9-13, before
buyer accounts or the capability model existed) and was never revisited when buyer accounts were added in
Phase 16.
**How to avoid:** This is exactly what INDUSTRY-02 fixes. Verify, as part of planning/verification, what
`loadGreenRoomFeed()` does today when an author has no matching `user_profiles` row (likely an inner join that
silently drops the post, or a left join that renders a blank card) — this affects whether the current exposure
is "buyer could post but it renders broken" (self-limiting) or "buyer could post and it renders fine"
(a real gap to close urgently, independent of the rest of this phase's scope).
**Warning signs:** none observed yet in this codebase — no buyer account has likely ever hit this route in
practice (Phase 22/23 buyer UI routes through `(buyer-portal)`, not `(artist)`), but the API route itself has
no structural prevention.

### Pitfall 4: The curator claim route sends a redundant/conflicting invite email once repointed
**What goes wrong:** `app/api/curators/claim/[token]/route.ts` currently calls `service.auth.admin.generateLink()`
+ its own `sendEmail()` with a bespoke "Sign in to your curator profile" HTML string. `createIndustryMember()`
ALSO calls `generateLink()` + `sendEmail()` internally (via `industryInviteEmail()`). If the claim route is
naively changed to call `createIndustryMember()`, the caller flow (claim link click → account creation) would
either double-send an email or send the wrong one ("You've been invited to join Funūn as an industry member" —
which is confusing for someone who just clicked a curator-specific claim link and is already mid-flow, not
being freshly invited).
**Why it happens:** Both functions were written independently, each assuming it owns the entire
invite-email lifecycle.
**How to avoid:** During planning, decide explicitly: does the claim flow need its OWN copy (e.g., "Welcome —
your curator profile is now an Industry account") distinct from the cold-invite copy in `industryInviteEmail()`?
Most likely yes — these are different UX moments (self-serve claim confirmation vs. cold outreach invite).
Consider extracting the account-creation logic (createUser + handle_new_user contract) from
`createIndustryMember()` into a smaller reusable primitive that both call sites can use with their own
email copy, rather than have the claim route call the higher-level function and suppress/override its email.
**Warning signs:** A UAT of "claim a curator directory row" that inbox-checks for exactly one email, with
correct copy, would catch a double-send or wrong-copy regression immediately.

### Pitfall 5: "Move curators under PitchPlug" is a navigation change, not a data/logic merge
**What goes wrong:** A planner or executor who takes "PitchPlug is the tool that pitches to these contacts"
literally might try to wire `/tools/pitchplug`'s `PitchPlugForm` (an AI cold-email COPY generator with zero
`curators` table awareness) into the `curators`/`pitch_history` send flow (currently owned by
`PitchComposer`, which "lives inside `/launchpad/[projectId]`" per its own doc comment — explicitly NOT
`/curators`, by design decision D-06/D-07 recorded in that same comment). That would be a much larger, riskier
change than the owner asked for.
**Why it happens:** The names "PitchPlug" and "curator pitch" sound like the same feature; they are not
connected in the codebase today.
**How to avoid:** Scope this to: (1) relocate the `/admin/curators` admin-nav entry point (today linked from
`app/(admin)/layout.tsx`) to live under/near the PitchPlug admin surface, if one exists, or otherwise make it
discoverable from PitchPlug; (2) relocate/link the artist-facing `/curators` browse page (`app/(artist)/curators
/page.tsx` — note: this page is currently **not referenced in `ArtistNav.tsx`'s `ITEMS` list at all**, i.e. it's
already an orphaned/unlinked route reachable only by direct URL) so it's discoverable from `/tools/pitchplug`.
Do not touch `PitchComposer`, `pitch_history`, or the Launchpad wiring as part of this relocation.
**Warning signs:** If a plan task's file list includes `components/tools/PitchPlugForm.tsx` or
`lib/curators/pitch-copy.ts` together in the same task, that's a signal the boundary has been crossed —
verify against this finding before executing.

## Code Examples

### The correctly-shaped existing capability gate (copy this shape, fix its inputs)
```typescript
// Source: app/api/antenna/opportunities/route.ts (verified live in this repo — the SHAPE is
// right, the underlying data (capability_grants row, industry_profiles row) is what's missing)
if (!(await hasCapability(user.id, 'industry'))) {
  return NextResponse.json(
    { error: 'Only accounts with industry access can post opportunities' },
    { status: 403 }
  )
}
```

### The existing self-serve capability request/approve state machine (precedent for community-invite trust model)
```typescript
// Source: lib/capabilities/grant.ts (verified live in this repo)
// industry -> artist is instant (artist signup is already open to anyone
// with zero verification today, so gating it here would be a NEW
// restriction with no justification). artist -> industry requires admin
// approval (mirrors today's admin-invite trust gate for industry claims —
// impersonation/credibility risk is real on this side).
export async function requestCapability(input: {
  profileId: string
  capability: Capability
  roleSlugs: string[]
}): Promise<{ grantId: string; status: 'approved' | 'pending' }> {
  // ...
}
```
This existing asymmetric-trust design (artist self-serve is instant, industry requires review) is directly
relevant to deciding whether community-initiated industry invites (INDUSTRY-03) should also require admin
review, or whether the inviter's own vouching (they're a verified community member/Team Member) substitutes
for it — see Open Questions #1.

### The one-and-only `role='curator'` account-creation call site
```typescript
// Source: app/api/curators/claim/[token]/route.ts (verified — this is the ENTIRE surface
// area of the retirement; no other file calls admin.createUser with role='curator')
const { data: created, error: createError } = await service.auth.admin.createUser({
  email: curator.email,
  email_confirm: true,
  app_metadata: { role: 'curator' },
})
```

## State of the Art

Not applicable in the traditional sense (no external framework/library version drift to track) — the relevant
"state of the art" question is purely internal: which of the two account-type sources of truth
(`member_type` vs. `capability_grants`) this project intends to keep long-term. `capability_grants` (migration
042, Phase 15) is the newer, more expressive model (supports multi-capability accounts, request/approve
workflow, audit trail via `decided_by`/`decided_at`) and its own migration comment states it explicitly
"Replaces the single exclusive artist_profiles.member_type value" — strongly suggesting `capability_grants`
was ALREADY intended to be authoritative going forward, and `member_type`'s continued use in the admin members
list / Green Room discover filter is itself the stale/deprecated path, not the other way around.

**Deprecated/outdated:**
- `industry_profiles` (migration 001) — predates `member_type`/`capability_grants` entirely, has zero writers,
  and is very likely dead code that should be removed from the Antenna gate (and possibly dropped as a table
  in a later cleanup, though dropping it is out of scope for this phase unless the owner wants it).
- `user_profiles.member_type` as a write target for new capability grants — per the migration-042 comment
  above, this looks like an intentional-but-incomplete migration away from `member_type`; this phase should
  either complete that migration (make `capability_grants` fully authoritative, stop writing/reading
  `member_type` in new code) or explicitly decide to keep both in sync — but not add new code that treats
  `member_type` as authoritative going forward without reconciling the existing drift.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Beta has ~0 real `role='curator'` claimed accounts (owner's stated belief, not independently verified against the live database in this research session — no DB query tool was available) | Runtime State Inventory | If nonzero, the curator-portal retirement needs an explicit data-migration step (convert existing claimed accounts to Industry) before the claim route can be safely repointed, not just a code change for future claims |
| A2 | The community/Team-Member industry invite (INDUSTRY-03) should reuse a token-claim pattern similar to `curators.claim_token`, rather than reusing the admin-invite `createIndustryMember()` path behind a widened auth check | Architecture Patterns / Open Questions #1 | If the owner actually wants "any community member can trigger immediate account creation" (mirroring the admin flow, not a self-serve claim), the design should route through a widened-authorization version of `createIndustryMember()` instead — this is a real fork in the design and CONTEXT.md does not resolve it |
| A3 | `industry_profiles` (migration 001) is dead weight safe to remove from the Antenna gate, not a table someone intends to build a write path for later | Common Pitfalls #1, State of the Art | If the owner has plans for a richer "industry profile" concept (bio, company, verified, response_rate — the table's actual columns suggest a LinkedIn-style profile), removing the check without building the write path first would silently make the gate permissive instead of broken — worth a quick confirm at discuss-phase rather than assuming |

**If this table is empty:** N/A — see rows above.

## Open Questions (RESOLVED)

*All three resolved/deferred with documented rationale (planner incorporated these): #1 (community-invite trust model) = deferred to a follow-on pending an owner product decision, the enabling primitive built in 28-03; #2 (member_type vs capability_grants) = capability_grants authoritative for checks, member_type kept in lockstep, full read-site cutover deferred; #3 (industry_profiles table) = leave untouched, stop gating on it.*

1. **Community/Team-Member industry invite: immediate creation vs. token-claim self-serve, and is admin
   review required?**  RESOLVED (deferred — trust model is an owner product decision; primitive built in 28-03)
   - What we know: today only `verifyAdmin()`-gated `/api/admin/members` can create an Industry account
     (immediately, via `createIndustryMember()`). The self-serve capability-request path
     (`requestCapability()`) already models an "instant for one direction, admin-review for the other"
     asymmetric trust pattern that could be reused or explicitly rejected for the new community-invite case.
   - What's unclear: whether a community member's invite should create the account immediately (high trust,
     matches "recruit them one by one" framing) or generate a claim link the invitee uses to self-serve create
     their own account (matches the `curators.claim_token` precedent and gives the invitee agency over their
     own signup, similar to Phase 27's proposed artist-invite model).
   - Recommendation: raise explicitly at discuss-phase — this is a genuine product decision CONTEXT.md leaves
     open ("Industry invites can come from the community" states WHO can invite, not HOW the invite resolves
     into an account).

2. **Is `member_type` or `capability_grants` the single source of truth going forward?**
   - What we know: `capability_grants`' own migration comment says it "replaces" `member_type`; three
     different code paths currently read from different sources and already disagree for at least one real
     account-creation flow (self-serve capability request).
   - What's unclear: whether reconciling this is in THIS phase's scope (it directly blocks a clean Green Room
     gate and admin-list correctness) or deserves its own follow-up phase given how many files read
     `member_type` today (`app/u/[handle]/page.tsx`, `lib/trust-safety/verification.ts`,
     `lib/network/query.ts`, `lib/green-room/discover.ts`, `lib/profile/load.ts`, `app/(artist)/settings/page.tsx`
     — 6+ call sites beyond the ones already discussed above).
   - Recommendation: at minimum, this phase should stop the drift going forward (make new industry-creation
     paths write both, or derive one from the other) even if a full backfill/cutover of all 6+ read sites is
     deferred to a later cleanup phase — mirrors this project's own precedent of splitting Phase 19 (identity
     cleanup) from Phase 20 (the larger rename) when the blast radius grew mid-planning.

3. **What should happen to the `industry_profiles` table itself (not just the Antenna gate's read of it)?**
   - What we know: zero writers, one dead reader (the Antenna gate).
   - What's unclear: whether to leave the table in place (harmless, unused) or drop it in this phase's
     migration set.
   - Recommendation: leave the table itself untouched (out of scope) — just stop gating on it. Dropping
     unused tables is a separate, lower-priority cleanup.

## Environment Availability

Skipped — this phase has no new external tool/service/runtime dependencies. All work is against the existing
Supabase project, existing Next.js app, existing npm dependency set already installed in this repo.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 (existing — `package.json` `"test": "jest"`) |
| Config file | `jest.config.js` (existing) |
| Quick run command | `npx jest <matching-test-file>` |
| Full suite command | `npm run test` |

This repo's established pattern for privileged-write/RLS-adjacent code (see `__tests__/capability-route-guard.test.ts`,
`__tests__/capability-check.test.ts`, `__tests__/capability-grant.test.ts`) is: **unit-test the pure/service-layer
functions with a mocked Supabase client**, and mark true route-level HTTP behavior (401/403 status codes against
a real Next.js request) as **Manual-Only** in the plan's verification doc — this project does not have a Next.js
request-harness test setup. Follow that exact precedent rather than introducing a new integration-test approach.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INDUSTRY-01 | `createIndustryMember()` (or its trigger contract) writes an `approved` `capability_grants` row at creation | unit | `npx jest __tests__/industry-member-capability.test.ts` (new) | ❌ Wave 0 |
| INDUSTRY-01 | Antenna POST route no longer 403s a fresh Industry account (industry_profiles gate removed) | manual-only (no request harness) | N/A — manual UAT | ❌ Wave 0 (add to plan's verification doc) |
| INDUSTRY-02 | `loadGreenRoomFeed()`/`createGreenRoomPost()` reject a non-artist/non-industry caller | unit | `npx jest __tests__/green-room-account-gate.test.ts` (new) | ❌ Wave 0 |
| INDUSTRY-02 | RLS `WITH CHECK` on `green_room_posts` insert rejects a `member_type` outside `('artist','industry')` | manual (live-DB RLS smoke, human-gated push) | N/A — manual UAT after migration push | ❌ Wave 0 |
| INDUSTRY-04 | Claim route creates an Industry account (`member_type='industry'`, `industry_roles` includes `playlist_curator`), not a `role='curator'` account | unit | extend existing curator-claim test coverage if any exists, else new `npx jest __tests__/curator-claim-industry.test.ts` | ❌ Wave 0 (no existing test file found for the claim route itself) |
| INDUSTRY-06 | A capability-grant approval keeps `member_type` in sync (or the chosen reconciliation strategy's invariant) | unit | `npx jest __tests__/capability-member-type-sync.test.ts` (new) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `npx jest <file>` for the file(s) touched.
- **Per wave merge:** `npm run test` (full suite — this repo's suite was last reported at 46+ suites / 450+
  tests in `.planning/STATE.md`; keep it green).
- **Phase gate:** Full suite green + `tsc`/lint clean before `/gsd-verify-work`, matching every prior phase's
  convention in this repo.

### Wave 0 Gaps
- [ ] `__tests__/industry-member-capability.test.ts` — covers INDUSTRY-01's capability-write fix
- [ ] `__tests__/green-room-account-gate.test.ts` — covers INDUSTRY-02's app-layer gate
- [ ] `__tests__/curator-claim-industry.test.ts` — covers INDUSTRY-04's repointed claim route
- [ ] `__tests__/capability-member-type-sync.test.ts` — covers INDUSTRY-06's reconciliation invariant
- [ ] No new test framework/config needed — Jest is already fully set up and this project's mock-Supabase-client
  pattern (see `__tests__/capability-route-guard.test.ts`) is directly reusable for all four new files above.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | Existing Supabase auth session model, untouched by this phase |
| V3 Session Management | no (unchanged) | — |
| V4 Access Control | **yes — this is the core of the phase** | Server-side capability/member_type checks (Pattern 1) + RLS `WITH CHECK` backstop (Pattern 2), matching this repo's own established `no_block()`/column-privilege doctrine (migration 031/040 precedent cited throughout `.planning/STATE.md`) |
| V5 Input Validation | yes (claim-route repoint) | Existing allowlist-validation convention (`EMAIL_REGEX`, explicit field checks) already used in `app/api/admin/members/route.ts` — mirror it in any new invite route |
| V6 Cryptography | no | Claim tokens (`claim_token`) already use the existing token-generation utility (`lib/curators/tokens.ts`) — reuse, don't reimplement |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Broken access control — Green Room posting/reading with no account-type gate (Summary #2, Pitfall #3) | Elevation of Privilege | Add the server-side gate (Pattern 1) AND the RLS backstop (Pattern 2) in the same migration/plan wave — this repo's doctrine explicitly rejects app-layer-only enforcement ("Nav-hiding... is defense-in-depth only") |
| Confused deputy — Antenna gate checks a table (`industry_profiles`) nobody writes, silently blocking everyone rather than admitting an attacker | Denial of Service (self-inflicted) | Remove the dead check per Pitfall #1 recommendation; verify via the existing `hasCapability()` unit-test pattern that the fixed gate correctly discriminates approved-industry vs. not |
| Privilege drift between two truth sources (`member_type` vs `capability_grants`) | Elevation of Privilege (an account could act as industry in one surface, be invisible as industry in another, evading admin oversight) | Pick one authoritative source per Open Question #2; add a regression test asserting they cannot diverge for the flows this phase touches |
| IDOR on the curator claim route | Tampering | Already mitigated in the existing code — `claim_token` is checked with `.eq('claim_token', token).is('claimed_by', null)` as an atomic conditional update (verified in `app/api/curators/claim/[token]/route.ts`); preserve this exact pattern when repointing to industry-account creation, don't regress it to a two-step check-then-update |

## Sources

### Primary (HIGH confidence — direct repository reads, this session)
- `.planning/phases/28-industry-accounts-green-room-access/28-CONTEXT.md` — locked decisions, ground truth claims (some corrected against code, see Summary)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — coverage/traceability gaps, phase history, prior drift notes
- `supabase/migrations/030_curators_pitch_history.sql`, `031_curators_column_privileges.sql`, `034_member_identity_wave4.sql`, `039_handle_new_user_industry_branch.sql`, `042_capability_grants.sql`, `057_green_room_feed.sql`, `076_rename_artist_profiles_to_user_profiles.sql`, `080_buyer_orgs_members.sql`, `001_initial_schema.sql` — schema, RLS, and trigger ground truth
- `lib/industry/createIndustryMember.ts`, `lib/industry/roleMapping.ts`, `lib/industry-roles.ts`, `lib/email/industryInvite.ts`
- `lib/capabilities/check.ts`, `lib/capabilities/grant.ts`
- `app/api/admin/members/route.ts`, `app/api/capabilities/approve/[grantId]/route.ts`
- `app/api/antenna/opportunities/route.ts`
- `app/(artist)/green-room/page.tsx`, `middleware.ts`, `app/(artist)/layout.tsx`, `app/api/green-room/feed/route.ts`, `app/api/green-room/posts/route.ts`, `lib/green-room/post-write.ts`, `lib/green-room/discover.ts`
- `app/api/curators/claim/[token]/route.ts`, `app/(curator-portal)/layout.tsx`, `app/(admin)/admin/curators/page.tsx`, `app/(artist)/curators/page.tsx`
- `components/curators/PitchComposer.tsx`, `components/curators/CuratorDirectory.tsx`, `lib/tools/registry.ts`, `app/(artist)/tools/pitchplug/page.tsx`, `components/tools/PitchPlugForm.tsx` (grepped, no `curators` reference found)
- `components/nav/ArtistNav.tsx`, `components/nav/CapabilityCta.tsx`
- `__tests__/capability-route-guard.test.ts`, `__tests__/capability-check.test.ts` — existing test patterns
- `.planning/phases/25-funun-team-accounts-ae/` (directory listing only — confirmed no execution artifacts), `.planning/phases/27-artist-invite-only-onboarding/27-CONTEXT.md`
- `.planning/config.json` — workflow toggles (`nyquist_validation: true`, `security_enforcement: true`)
- `package.json` — Jest 30.4.2 confirmed as test runner

### Secondary (MEDIUM confidence)
None — no web search was performed (all search-provider config flags are `false` in `.planning/config.json`,
and this phase's scope is entirely internal-codebase reconciliation with no external library or API surface).

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new stack decisions; existing stack fully documented in CLAUDE.md
- Architecture: HIGH — every claim traced to a specific file/line via direct reads and greps in this session, not training-data assumption
- Pitfalls: HIGH — Pitfalls 1, 2, and 5 are not hypothetical; they are demonstrable by reading the current call graph (e.g., grepping for `industry_profiles` writers returns zero results)

**Research date:** 2026-08-05
**Valid until:** Treat as valid until Phase 25 (Team Members) or any migration renumbering the `capability_grants`/`member_type` model lands — whichever comes first. Internal-reconciliation research like this has a shorter shelf-life than library-version research; re-verify the "zero `industry_profiles` writers" and "zero `capability_grants` write in industry-creation path" claims with a fresh grep if significant time passes before this phase is planned/executed.
