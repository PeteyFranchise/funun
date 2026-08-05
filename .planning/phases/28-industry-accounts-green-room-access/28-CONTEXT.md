# Phase 28: Industry Accounts & Green Room Access Model - Context

**Gathered:** 2026-08-05
**Status:** Captured — mostly a **confirm + policy + reconcile** phase (much already exists); ready to discuss/plan
**Source:** owner account-taxonomy clarification (2026-08-05)

<domain>
## Phase Boundary

Nail down the **full account taxonomy** and the **Green Room access model**, and define the **Industry account**
lane as the external "opportunity-poster + social participant" account — distinct from Artists (creators) and
Client Partners (buyers). Reconcile the standalone **curators directory** into the industry-account model.

**Much of this already exists** (see "Ground truth" below) — this phase **confirms** the model, sets the
**Green Room access policy** explicitly, **reconciles curators**, and lays groundwork for **per-subtype tools**.
</domain>

<decisions>
## The account taxonomy (owner-confirmed 2026-08-05)
Four lanes — two internal-vs-external axes:

| Account | Who | Tools / access |
|---------|-----|----------------|
| **Funūn Team Member** (internal) | Funūn staff, role-typed (Leadership/AE/BD/…) | The Team Console (Phase 25) |
| **Artist** (external creator) | **Anyone with song credits** — artists, writers, producers, all creative roles | Sound Vault + Contract Locker + Split Sheets + Antenna/PitchPlug; **Green Room + posts** |
| **Industry** (external) | Curators, A&R (other cos/labels), music execs, publishers, music supervisors, playlist owners, radio, managers, etc. | **Green Room + social profile**; **tools to POST opportunities into Antenna**; per-subtype toolsets (future); **invite-only** |
| **Client Partner** (external buyer) | Sync buyers, B2B | Buyer portal (Phase 23), AE-managed. **Green Room = FUTURE discussion** |

- **Artist account = anyone with song credits** who wants to use the Sound Vault side. Green Room access + social posts.
- **Industry account** = external music-industry people whose job is to **surface opportunities** to artists and
  **participate in the Green Room**. Different goals/tools/permissions from an artist. **Invite-only.** Each subtype
  eventually gets **its own toolset** (a curator's tools ≠ a publisher's ≠ a supervisor's).
## Curators — RESOLVED (owner 2026-08-05)
Split "curator" into the two things it actually is; there is **no separate curator account type**:
- The **`curators` table = CRM data** — a directory of **pitch-target contacts Funūn has NOT yet onboarded** with
  their own accounts. **Not an account type.** (Already carries name/email/platform/playlist/genre + bounce/drift flags.)
- The **only real curator *account* = an Industry account** (`member_type='industry'`, `playlist_curator`).
- **Retire the legacy `role='curator'`** account (migration 030) — it predates Industry accounts and is strictly
  weaker (self-edits its directory row only; no Green Room, no tools). **Repoint the existing claim/join flow at
  Industry-account creation** (a claimed directory contact becomes an Industry account, not the thin legacy one).
  Beta likely has ~0 real `role='curator'` accounts to migrate — cheap cleanup.
- **Curator acquisition loop (owner vision):** the directory is a **growth funnel** — the **Funūn community + Team
  Members recruit directory contacts one by one** to accept an invite and **join as Industry accounts** (then they
  post opportunities + participate in the Green Room). So **Industry invites can come from the community**, not only staff.
- **Populating the directory:** seeded manually + via **discovery/scraping tools** to find curators / playlist owners /
  radio / etc. as new pitch-target contacts (a future tool — mind each platform's ToS/robots + data-privacy/cold-outreach law when built).
- **Placement (owner 2026-08-05):** the `curators` directory (the CRM data + its management) **lives within PitchPlug
  for now** — PitchPlug is the tool that pitches to these contacts, so keep the directory as a **PitchPlug asset**
  rather than a standalone curator system or a big new admin area. Don't over-build it. This placement is provisional
  ("for now"); the account reconciliation above (curator = Industry account, retire `role='curator'`) is a **separate**
  concern from where the directory data lives. (Today it's `/admin/curators` — folding it under PitchPlug is the near-term move.)

## Green Room access matrix (owner 2026-08-05)
- **Artist** → ✓ access + post.
- **Industry** → ✓ access + social profile + post + opportunity-posting tools.
- **Team Member (as Funūn)** → ✗ **may NOT post under a Funūn email address.** A Team Member is welcome to create a
  **personal** Artist/Industry account (own email/username) to participate.
- **Client Partner** → **DEFERRED** — future discussion whether they can post. **Note only for now.**

## Ground truth — what already exists (this is confirm/extend, NOT greenfield)
- `member_type` enum `('artist','industry')` — migration 034. The two external types exist.
- **Industry accounts are invite-based** — `lib/industry/createIndustryMember.ts` + `lib/email/industryInvite.ts`.
- **Subtypes already defined** — `lib/industry-roles.ts` INDUSTRY_ROLE_GROUPS includes `playlist_curator`,
  `ar_executive`, `publisher`, `music_supervisor`, `manager`, `tour_manager` (+ creative role slugs).
- **Antenna opportunity posting already gated to industry** — `hasCapability(user,'industry')` + `industry_profiles`
  (`app/api/antenna/opportunities/route.ts`: "Only accounts with industry access can post opportunities").
- **Green Room exists** — `app/(artist)/green-room/page.tsx`; social (wall/endorsements/DMs/follows, Phases 11–14).
- **Capability model** — Phase 15: `hasCapability(user, 'industry')`.
</decisions>

<open_questions>
## Open — GSD discussion before/at planning
1. **Curator reconciliation — RESOLVED** (see the "Curators — RESOLVED" block in Decisions): directory = CRM data
   (lives under PitchPlug for now); the only curator *account* = an Industry account (`playlist_curator`); retire the
   legacy `role='curator'` and repoint its claim flow at Industry-account creation.
2. **Green Room access enforcement.** Is access simply `member_type IN ('artist','industry')`? Where's the gate
   (green-room route/layout)? Confirm industry accounts already get Green Room + a social profile, or wire it.
3. **Team-Member "no Funūn-email posting."** Enforced (block `@funun.studio` from Green Room posting) vs policy/norm?
   A Team Member's personal account is just a normal Artist/Industry account — nothing special to build there.
4. **Per-subtype industry toolsets.** Today all industry accounts share the "post opportunity" tool. Which distinct
   tools per subtype (curator vs publisher vs supervisor vs radio…), and how granular? Iterative/future.
5. **Taxonomy coherence across tables.** `member_type` (artist|industry) + `funun_staff` (Team Member) + `buyer_members`
   (Client Partner) are separate principals — confirm the four-lane taxonomy maps cleanly onto them + Phase 15 capabilities.
</open_questions>

<canonical_refs>
## Canonical References
- `supabase/migrations/034_member_identity_wave4.sql` — `member_type ('artist','industry')`.
- `lib/industry/createIndustryMember.ts`, `lib/industry/roleMapping.ts`, `lib/industry-roles.ts`, `lib/email/industryInvite.ts` — the industry account substrate (invite + subtypes).
- `app/api/antenna/opportunities/route.ts` — industry-gated opportunity posting (`hasCapability(user,'industry')`).
- `app/(artist)/green-room/page.tsx` + `lib/social/*` (wall/endorsements/DMs/follows) — the Green Room.
- `supabase/migrations/030_curators_pitch_history.sql` — the standalone curators directory to reconcile.
- Phase 15 (capability model), Phase 25 (Team Members), Phase 23 (Client Partners), Phase 27 (artist invite-only).
</canonical_refs>

<deferred>
## Deferred Ideas
- **Client Partners posting in the Green Room** — explicit future discussion (owner, note only for now).
- Full **per-subtype industry toolsets** (iterative, one subtype at a time).
- Enforcement mechanics for the Funūn-email Green Room rule (if we choose to hard-enforce).
</deferred>

---

*Phase: 28-industry-accounts-green-room-access*
*Context: 2026-08-05 — owner account-taxonomy + Green Room access clarification*
