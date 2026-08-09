# Phase 27: Artist Invitation-Only Onboarding (growth gate) - Context

**Gathered:** 2026-08-05 (seed) · **Discussed & finalized:** 2026-08-08 (owner GSD discussion)
**Status:** Ready for planning
**Source:** owner GSD discussion 2026-08-08; seed direction 2026-08-05

<domain>
## Phase Boundary

Change **artist signup** from **open self-serve** to **invitation-only self-serve** — a deliberate,
**temporary growth control** ("keep them self-serve but by invitation only for now as we grow"). Artists still
create and **own** their account (self-serve preserved); a signup is **gated on a valid invitation**, enforced
**server-side** at the provisioning point.

**Invite sources:** any **collaborator** (an existing artist who names someone by email) **or** any **Team
Member** (Phase 25 staff). **Bootstrap:** the owner seeds the first artist account, then invites a founding
cohort via the real mechanism.

**In scope:** the server-authoritative invite gate on artist signup; an invited-email **allowlist** (collaborator
emails + Team-Member invites + owner seed); the collaborator + Team-Member invite paths (tokened, email-bound
deep-links); a prominent invite-only signup page with an **inline denial + waiting-list** for uninvited visitors;
waitlist notifications (per-person + reopen broadcast); branded invite/notify emails; Team-Console management.

**Out of scope / deferred:** re-opening signup to fully public; a full public waitlist / apply-to-join **approval**
funnel; invite quotas/analytics; the Artist/Industry/Both account-type chooser. The gate touches the **artist
branch only** — buyer / industry / Team-Member onboarding are unaffected.

**Distinct from Phase 26:** Phase 26 invites a *song* into the sync library; Phase 27 invites a *person* to create
an artist account.
</domain>

<decisions>
## Implementation Decisions

### Gate architecture & enforcement
- **D-01 — Gated self-serve (NOT pre-provisioned).** The invitee uses the signup page and creates their **own**
  credentials (email + password). This deliberately diverges from the sibling lanes (Staff/Buyer/Industry), which
  pre-create the account via `admin.createUser` + magic link. Rationale: owner intent ("keep them self-serve");
  builds on the existing `claim_collaborators` link-on-signup behavior; avoids phantom pre-created accounts.
- **D-02 — Server-authoritative gate.** The invite check is enforced where the account is actually provisioned
  (the `handle_new_user` provisioning path), **not** merely on the signup page. A page-only check is bypassable via
  direct API calls and is not acceptable. The page is the friendly layer; the server is the real gate.
- **D-03 — New signups only.** The gate governs *new* signups; existing accounts are never touched.

### What counts as an invite (the allowlist)
- **D-04 — Any collaborator is auto-allowed.** The moment an existing artist names someone by email as a
  collaborator (roster / split sheet), that email is authorized to self-serve sign up. **Allowlist = collaborator
  emails + Team-Member-issued invites + owner seed.** Reuses the same email-matching `claim_collaborators` performs.
- **D-05 — Existing collaborator rows seed the allowlist on flip.** When the gate ships, all pre-existing
  collaborator emails are already authorized (intended — they are legitimate collaborators).

### Invites & delivery
- **D-06 — Any Team Member can invite an artist.** Low-risk (an invite only authorizes an email; the artist still
  self-serves). Individual invites are open to all staff.
- **D-07 — Unlimited invites for now.** No per-inviter cap during the growth stage (quotas/rate-limits deferred).
- **D-08 — Invite email via all three pathways.** The "you can join Funūn" email can be triggered by (a) a
  **default-on prompt** when adding a collaborator, (b) an **auto-send mode**, and (c) an **explicit Invite button**.
  ⚠ Blanket silent auto-email to *every* credited address is a deliverability/reputation risk — "auto" must be a
  **deliberate opt-in mode, not an always-on default**. (See For Research.)
- **D-09 — Magic deep-link, bound to the invited email.** The invite email carries a **tokened** deep-link into
  signup (pre-fills email; shows "invited by [name]"). The token is **locked to the invited email** — a forwarded
  link cannot onboard a different person. Reuse the `collaborator_invites` token machinery where it fits.
  Existing-account recipient → route to sign in; expired token → re-request.

### Uninvited experience & waitlist
- **D-10 — Prominent invite-only gate on the signup page.** The page **leads** with the invite-only state
  ("Have an invite? Enter your email") before the form. Allowed emails proceed to create their own credentials;
  deep-link arrivals skip the check. (Enumeration trade-off noted — see For Research.)
- **D-11 — Respectful denial + waiting list, inline.** An uninvited submit shows a respectful, founding-member-framed
  "invite-only for now" message with a **waiting-list** form, **inline on the same page** (no redirect). Captures
  **email + name + optional note**.
- **D-12 — Public waitlist form is protected.** **Rate-limit + captcha** (unauthenticated public endpoint).
- **D-13 — Notify waitlisters both ways.** (a) **Per-person:** a Team Member converts a waitlist entry into an
  invite → "your spot opened" email. (b) **Broadcast:** on general reopen → "we've reopened" to all waitlisters.
  **No capacity/slots system; not a full apply-and-approve funnel.**

### Staff surfaces & permissions
- **D-14 — Management in the Team Console.** Waitlist + invite management lives in the existing Team Console
  (`/admin`); artist-side invite lives in the collaborator UI. No new surface.
- **D-15 — Reopen-broadcast is Leadership-only.** A mass email to the whole list is high-stakes/one-shot →
  restricted to Leadership/owner. Individual invites remain open to any Team Member (D-06).

### Brand & copy
- **D-16 — Founding-member / exclusive positioning** across the page + emails. Owner owns final wording.
- **D-17 — Distinct Funūn-branded email templates, built up front.** All three emails (invite / spot-opened /
  reopened) get branded templates (NOT the minimal `industryInvite` style). Copy/design requires **owner sign-off
  before ship** — a launch gate for this phase.

### Rollout & bootstrap
- **D-18 — Flip the gate on from day one; seed via invites.** Owner seeds their own artist account (self-signup
  while open, or via the mechanism), then invites a curated founding cohort using the real invite flow. **No open
  soft-launch window** (keeps the controlled, exclusive story).

### Email subscription & re-subscribe (owner add, 2026-08-09)
- **D-19 — Unsubscribe is broadcast-only; personal invites always reach.** The Unsubscribe link opts a person out of the **bulk "we've reopened" broadcast only**. A **personal invite always still reaches them** — both (a) a **collaborator** naming/inviting them and (b) a **Team-Member** waitlist→invite conversion. Rationale (owner): a collaborator invite rides a real working relationship — they're typically **signing a split sheet** together — so it's operational/transactional, not marketing, and must land even for an unsubscribed person. **Re-subscribe two ways:** automatic on rejoining the waiting list, plus a **"Resubscribe"** button on the unsubscribe landing page. Re-subscribe is **user-initiated** — staff don't silently re-subscribe an opt-out; the personal invite is the sanctioned direct-contact path. The Team Console shows an **"unsubscribed"** chip on waitlist rows (the "Convert to invite" action stays enabled — a personal invite still sends).

### Claude's Discretion
- Allowlist/invite table design (reuse `collaborator_invites` vs a dedicated `artist_invites`) — see For Research.
- Signup-page visual specifics beyond "prominent gate + inline denial/waitlist."
</decisions>

<for_research>
## Open Implementation Questions (for the researcher/planner — decisions above are locked)
- **Enforcement mechanism.** Reject inside the `handle_new_user` trigger (raise → rolls back the auth.users insert,
  no enumeration leak, surfaced to the client as a signup error) **vs** a pre-signup allowlist-check RPC (cleaner
  UX, but reveals whether an email is known). Note D-10's prominent "enter your email to check" gate inherently
  enables enumeration — decide mitigations (rate-limit the check, generic wording, throttling).
- **Token substrate.** `collaborator_invites.collaborator_id` is `NOT NULL`, so it doesn't fit Team-Member or
  waitlist-conversion invites (which have no collaborator row). Decide: extend/relax that table vs a dedicated
  `artist_invites` (or generic `invites`) table as the single allowlist the gate checks.
- **Safe sequencing of the "auto-send to everyone" mode (D-08)** — deliverability, sending reputation, and consent/
  CAN-SPAM for cold-ish contacts. Likely ship the prompt + explicit paths first; gate auto behind an explicit toggle.
- **Captcha provider** choice + integration for the waitlist form (D-12).
- **`claim_collaborators` ordering** vs the allowlist check (email-match already links rows on signup — confirm it
  runs only for admitted signups).
- **Email subscription state + compliance (D-19).** Model a per-person opt-out **scoped to the broadcast** (a
  suppression flag on the waitlist/invite record) so the reopen broadcast skips opt-outs while personal invites
  (collaborator + Team-Member) still send. Confirm the transactional-vs-commercial line: the reopen broadcast is
  **commercial** (must honor unsubscribe + carry an unsubscribe link, e.g. CAN-SPAM); collaborator/Team-Member
  personal invites are **transactional/relationship-based** (still send). Flag for BD/counsel review.
</for_research>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth & provisioning (the gate)
- `app/(auth)/signup/page.tsx` — the self-serve `signUp` flow to modify (prominent gate + inline denial/waitlist).
- `supabase/migrations/001_initial_schema.sql` — original `handle_new_user` + `on_auth_user_created` trigger.
- `supabase/migrations/039_handle_new_user_industry_branch.sql` — current `handle_new_user` body (curator/industry/
  artist branches; the artist branch runs `claim_collaborators`). **The authoritative provision point to gate.**
- `supabase/migrations/075_phase19_privilege_hardening.sql` — privilege hardening around provisioning.

### Collaborator invite substrate (the allowlist source)
- `supabase/migrations/018_collaborators_split_sheets.sql` — `collaborators` + `collaborator_invites` (tokened,
  30-day) tables.
- `app/api/collaborators/[id]/invite/route.ts` — existing explicit collaborator-invite action (notify path).
- `lib/collaborators/index.ts` — collaborator model + sanitizer.
- `components/collaborators/*` (CollaboratorForm/Card/Picker/Roster) — where the add-time invite prompt (D-08) lands.
- `app/api/claim-collaborators/*` + `claim_collaborators()` (migrations 027/052) — email-match link-on-signup to
  reuse for the allowlist check.

### Sibling invite lanes (reference pattern — NOT the chosen artist pattern)
- `lib/industry/createIndustryMember.ts` (+ `provisionIndustryAccount`) — admin-provision + magic-link pattern.
- `lib/staff/createStaffAccount.ts`, `lib/buyers/createBuyerAccount.ts` — same pattern for Staff / Buyer.
- `lib/email/industryInvite.ts` — minimal Resend invite email (the style we are NOT reusing; D-17 wants branded).
- `lib/email/*` — `sendEmail` (Resend) + `staffInvite.ts` / `buyerInvite.ts` sibling templates.

### Account model / taxonomy
- `.planning/phases/25-funun-team-accounts-ae/25-CONTEXT.md` — Team Member accounts + Team Console (invite source +
  management home per D-14).
- `.planning/phases/28-industry-accounts-green-room-access/28-CONTEXT.md` — four-lane taxonomy + capability model
  (`capability_grants`, `hasCapability`).
- `.planning/ROADMAP.md` — "Account Taxonomy & Green Room Access" section (owner-confirmed onboarding + account-type
  context; the deferred Artist/Industry/Both chooser).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`handle_new_user` trigger** — already the single provisioning choke point; already runs `claim_collaborators`.
  The gate belongs here (D-02).
- **`collaborator_invites` table + `app/api/collaborators/[id]/invite`** — tokened invite substrate to reuse for
  the collaborator-invite deep-link (D-09).
- **`claim_collaborators()`** — email-matching logic that already links collaborator rows on signup; the allowlist
  check can lean on the same matching (D-04).
- **Resend `sendEmail` + sibling templates** — the transactional-email substrate for the three branded emails (D-17).
- **Team Console (`/admin`, Phase 25)** — the home for waitlist + invite management (D-14).

### Established Patterns
- Every other account lane (`createStaffAccount` / `createBuyerAccount` / `createIndustryMember`) uses
  **inviter-pre-provisions + magic link**. Phase 27 intentionally does **not** follow this (D-01) — call this out so
  the planner doesn't "consistency-match" into pre-provisioning.
- Account creation + capability grants happen **atomically inside `handle_new_user`** (SECURITY DEFINER) — the gate
  and any grant should live there too.

### Integration Points
- Signup page ↔ server gate (D-02/D-10); collaborator UI ↔ invite/allowlist (D-04/D-08); Team Console ↔ waitlist +
  invites + broadcast (D-13/D-14/D-15); Resend ↔ the three branded emails (D-17).
</code_context>

<specifics>
## Specific Ideas
- A **one-page flow diagram** of this design (prominent gate → allowlist decision → self-serve credentials →
  provision, plus the waitlist → reopen loop) was produced and shared with the owner for **team review**
  (2026-08-08): `Funun-Phase27-Onboarding-Flow.pdf` (A4 landscape). Use it as the shared mental model for the flow.
- Deep-link landing shows a warm "**invited by [name]**" header with the email pre-filled (D-09).
- Success end-state framed as "**welcome, founding artist**" (D-16).
</specifics>

<deferred>
## Deferred Ideas
- Re-opening artist signup to fully public once growth warrants.
- A **full public waitlist / apply-to-join funnel** with application + approval review (this phase ships only a
  minimal notify-me waiting list).
- Invite **quotas, referral tracking, or invite analytics**.
- The **Artist / Industry / Both account-type chooser** (shared future infra; not built — an artist invite lands on
  an artist account for now).
- A "soft-launch" open-signup window before flipping the gate (considered, rejected in D-18).

None — discussion stayed within phase scope (all of the above are explicitly future capabilities).
</deferred>

---

*Phase: 27-artist-invite-only-onboarding*
*Context gathered: 2026-08-05 (seed) · finalized 2026-08-08 (owner GSD discussion)*
