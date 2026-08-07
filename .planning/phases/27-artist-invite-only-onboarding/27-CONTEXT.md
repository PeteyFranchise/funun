# Phase 27: Artist Invitation-Only Onboarding (growth gate) - Context

**Gathered:** 2026-08-05
**Status:** Captured — near-term growth control; ready to discuss/plan
**Source:** owner direction (2026-08-05)

<domain>
## Phase Boundary

Change **artist signup** from **open self-serve** to **invitation-only self-serve** — "for the time being,
as we grow." Artists still create their **own** account (self-serve preserved), but a signup is **gated on a
valid invitation**. This is a deliberate, **temporary growth control** (expected to open back up later).

**Invite sources (either can invite an artist):**
- **Any collaborator** — an existing artist who names someone (by email) as a collaborator/writer on a split
  sheet or roster can invite them in.
- **Any Team Member account** — Funūn staff (Leadership/AE/BD, Phase 25) can invite an artist.

**Bootstrap (owner, explicit):** the owner creates the **first artist account** himself, with his **personal
email**, to start the invite chain — since invites originate from collaborators/Team Members, someone must be
the seed. (Artist signup is **open today**, so the owner can create this account now; the gate below governs
**subsequent** signups.)

**In scope:** the invite-gate on artist signup (an invited-email allowlist the artist auth flow checks), the
two invite mechanisms (collaborator-initiated, Team-Member-initiated), and the owner bootstrap/seed.

**Out of scope / deferred:** re-opening artist signup to fully public (post-growth); a public waitlist /
apply-to-join; changes to buyer or Team Member onboarding (those are Phases 23–25).
</domain>

<decisions>
## Direction (owner 2026-08-05)
- Artist onboarding = **self-serve but invite-only** (not open) — a growth-stage gate, **temporary**.
- **Two invite sources:** any **collaborator** + any **Team Member** account.
- **Bootstrap:** owner's **personal-email artist account** is the first/seed; the invite chain grows from there.
- Self-serve is **preserved** — the invitee still creates and owns their account; only the *gate* is new.
</decisions>

<open_questions>
## Open — to reason through before planning
1. **Invite mechanism + enforcement point.** An `artist_invites` allowlist keyed by email (created by an
   inviter), checked where? Options: at the signup page, and/or authoritatively in **`handle_new_user`** (the
   trigger that provisions the artist — today it auto-creates on any signup). An uninvited signup should be
   **blocked/held**, not silently provisioned. What's the exact gate + the rejected-signup UX (waitlist? "ask
   for an invite"?).
2. **Collaborator-initiated invites vs the existing collaborator model.** Collaborators are already entered
   **by email** (`components/collaborators/*`, `lib/collaborators`), and a **claim** path already exists
   (`__tests__/claim-collaborators-rpc.test.ts`). Does adding a collaborator by email **auto-create an invite**
   (they can claim/create), or is there an explicit "Invite this collaborator" action? Reuse the claim substrate.
3. **Team-Member-initiated invites.** An "Invite artist" action in the Team Console (Phase 25) — which roles,
   any limits, and does it reuse the same `artist_invites` mechanism?
4. **Bootstrap timing + retroactivity.** Owner creates the seed artist account now (open signup) vs a
   seed/allowlist entry after the gate ships. Does the gate apply retroactively to existing accounts? (No —
   it gates new signups only.)
5. **Abuse / limits.** Can any collaborator or Team Member invite unlimited artists? Any rate/quality control,
   or is trust fine at this stage?
6. **Relationship to the sync-library invite (Phase 26).** Distinct: Phase 26 invites an *existing* artist's
   **songs** into the sync-library; Phase 27 invites a person to **create an artist account**. Keep separate.
7. **Interaction with the account/capability model (Phase 15) + `is_admin`/staff seeds.** The gate lives on the
   **artist** branch only; buyer + Team Member provisioning are unaffected.
</open_questions>

<canonical_refs>
## Canonical References
- `app/(auth)/signup/page.tsx` — the open `supabase.auth.signUp({ email, … })` flow to gate.
- `handle_new_user` trigger — `supabase/migrations/001_initial_schema.sql`, `039_handle_new_user_industry_branch.sql`,
  `075_phase19_privilege_hardening.sql` — the artist auto-provision branch the gate must reconcile with.
- `lib/collaborators/index.ts` + `components/collaborators/*` (CollaboratorForm/Picker/Roster) + the claim RPC
  (`__tests__/claim-collaborators-rpc.test.ts`) — the collaborator-invite substrate.
- Phase 25 (`25-CONTEXT.md`) — Team Member accounts, the other invite source (an "Invite artist" action).
- Phase 15 (account/capability model) — where artist self-serve is defined; this narrows it to invite-gated.
- `.planning/deliberations/…` + the three-principal account model (memory) — update: artist = invite-only self-serve.
</canonical_refs>

<deferred>
## Deferred Ideas
- Re-opening artist signup to fully public once growth warrants.
- A public waitlist / apply-to-join funnel.
- Invite quotas, referral tracking, or invite analytics.
</deferred>

---

*Phase: 27-artist-invite-only-onboarding*
*Context: 2026-08-05 — owner growth-gate decision (invite-only artist signup)*
