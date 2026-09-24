# Phase 41: Collaborator Discovery (web) - Context

**Gathered:** 2026-09-21
**Status:** ⚠ **BLOCKED — one unresolved conflict (D-01a). Not plannable until it is settled.**
Everything else is corrected and ready.

<domain>
## Phase Boundary

**Add a discovery front-end to a roster that already exists**, so that adding a collaborator
finds the person on Funūn instead of emailing a "claim your profile" invite to someone who is
already a member.

The roster is built. `collaborators` (migrations 018/019/026) has `claimed_by`, `archived_at` and
`is_favorite`, SECURITY DEFINER claim functions, and a screen at
`app/(artist)/collaborators/page.tsx` with five components. People Search is built
(migration 149). Personalized invitation emails shipped in
`.planning/quick/260913-personalized-collaborator-invites/`, whose own follow-up note is this
phase: *"the Collaborators screen does not yet expose People Search."*

**This phase is web only.** Mobile contact matching is removed from it — see Deferred Ideas.

**What it delivers:** privacy-safe member discovery, a server-derived link to the selected
member, one shared add-flow used by every surface that can create a collaborator, and identity
resolution that does not produce duplicate rows.

**What it explicitly does not deliver:** any rights-data autofill, any disclosure of another
member's identifiers, and any change to the People Search projection.

</domain>

<decisions>
## Implementation Decisions

### Reconciliation and disclosure

- **D-01:** When an invited email belongs to an existing member, the inviter is told **exactly
  what happened** — "already a member, added to your roster" versus "signup invite sent."
  Chosen with the tradeoff stated: this makes the invite box a way to test whether an address
  has a Funūn account, including a deliberately hidden member. Accepted knowingly and mitigated
  by D-02 rather than left open.
- **D-01a — UNRESOLVED CONFLICT. This blocks planning.** D-01 does not merely accept a tradeoff;
  **it contradicts the roadmap.** `ROADMAP.md:2700-2704` states that on the invite-by-email path,
  *"a hidden or blocked identity must not be exposed through a reverse-lookup result."* D-03
  closes the **blocked** half. **D-01 is precisely the hidden half**: a hidden member's address
  returns "already a member."

  This was missed during discussion. The tradeoff was surfaced and accepted, but nobody checked
  that the roadmap already prohibited it — the entry's constraints were read as two
  (`resist enumeration`, `must not claim they are not a member`) when there are three.

  **Two owner-approved documents now disagree, and a planner cannot choose between them.**
  Resolution is one of:
  1. **Amend the roadmap** — accept the weakening explicitly, in the entry, with the reasoning.
     Keeps D-01 as chosen.
  2. **Narrow D-01** — distinguish only when the member is publicly discoverable, and return the
     neutral result for hidden/connections-only. Leaks exactly what People Search already leaks.
     Keeps the roadmap intact.
  3. **Something else the owner decides.**

  Until then, treat D-01 as **provisional**. Do not plan the disclosure copy.
- **D-02:** Contained **both** ways. The person is notified they were added, and lookups are
  rate-limited per member per day. Exact cap value is a planning decision.
  **These mitigate; they do not make D-01 privacy-safe, and must not be described as preserving
  the People Search boundary.** A daily cap reduces scale without stopping a *targeted* test of
  one address. A notice reaches the target only *after* the inviter has already learned the fact.
  D-01 is a deliberate weakening of a privacy rule, accepted with mitigations — not a reuse of
  the existing doctrine.
- **D-03:** **A block in either direction ends the whole action.** No email of any kind, no
  roster entry, no disclosure that the account exists. A block any path can route around is
  decorative. **This closes the *blocked* half of the roadmap rule at `ROADMAP.md:2700-2704`;
  it does not close the *hidden* half — that conflict is unresolved and is flagged below.** `discover_profile_id_by_email` already enforces
  `no_block` both directions (migration 149); the new path is where that could have been routed
  around.
- **D-04:** Blocks are **revalidated at write time**, inside the transaction, because a block can
  be created between the search result rendering and the write. Blocked, newly hidden, stale and
  ineligible targets all return the same generic failure.
- **D-05:** The notification to the added person is **informational, with a block link** —
  **but this decision is incomplete, not merely underdocumented.** Blocks have no coupling to
  collaborator rows (`supabase/migrations/035_connections_blocks.sql:79-110`), and a claimed row
  cannot be hard-deleted by the owner, only archived
  (`app/api/collaborators/[id]/route.ts:38-89`). A notified person can block *future* contact but
  **cannot remove or hide the existing record about them.** The earlier claim that the block
  remedy was "already total" was wrong. Planning must either add a rule for this or state
  explicitly that no removal right exists — it must not assume the block covers it.

### Scope and shape

- **D-06:** **Web only.** Mobile contact matching moves to its own research-gated roadmap phase.
  This makes the roadmap self-consistent: it already calls mobile *"explicitly future,
  research-gated work... not approved for data collection or implementation."*
- **D-07:** The deliverable is the **restructured add-collaborator flow** — search first, email
  second, manual last. **The order is the fix.** The bug is not that search is missing; it is
  that manual and email are the only doors, so people take them. Search added as a fourth option
  nobody sees would change nothing. Consequence: this touches an existing screen's information
  architecture and needs the empty, loading, error, duplicate, blocked and hidden-profile states
  the roadmap requires.
- **D-08:** **One shared add-flow component**, used by every surface that can CREATE a
  collaborator or send an invite. The clean line is create versus select: pickers that only
  choose from an existing roster create nobody and stay untouched.

  **Corrected surface inventory.** The earlier list carried a false positive and a false
  negative; planning from it would have spent effort on a non-creator while leaving a
  duplicate-producing path untouched:

  | Surface | Creates a roster row? | In scope |
  |---|---|---|
  | `components/collaborators/CollaboratorRoster.tsx` | yes | **yes** |
  | `components/collaborators/QuickInviteModal.tsx` | yes | **yes** |
  | `components/collaborators/CollaboratorForm.tsx` | yes | **yes** |
  | `components/split-sheets/PartyPicker.tsx` | **yes — was missing from the list** | **yes** |
  | `components/collaborators/CollaboratorInvitePrompt.tsx` | no — invites *after* creation | audit only |
  | `components/collaborators/CollaboratorPicker.tsx` | no — selects existing | no |
  | `components/settings/PermissionsTab.tsx` | no — consent management | **no** |
  | `components/catalogue/WorkRoster.tsx` | verify before planning | TBD |

  **`PartyPicker` matters most.** Its own submit path accepts **email OR phone**
  (`components/split-sheets/PartyPicker.tsx:262-303`), and a phone-only row has no email — so the
  existing dedupe, gated on `if (typeof update.email === 'string')`, skips it entirely.

### Linking and rights data

- **D-09:** A found member is **linked immediately** by setting `claimed_by`. Consequence to
  carry: migration 052 grants the claimed member RLS `SELECT` on that row, so they can see the
  entry made about them.
- **D-10:** **Rights fields are not copied onto the roster row and not disclosed to the roster
  owner.** Phase 41 establishes identity only. No profile join, no contract autofill, no
  membership-based disclosure. The route must not call the current split-sheet live-identity
  resolver.
- **D-11:** The owner's governing principle, in their words: rights data lives in the member's
  own settings; if present the system already knows and they do nothing; if missing, a
  contextual field asks them **and updates their settings rather than making a copy**; the
  system holds it but does not disclose it *"until it is needed on a contract or an upload for a
  distributor or something similar where it is required."* **The promise is "don't make me
  re-enter things," not "show me my collaborator's identifiers."**
- **D-12:** An explicit provenance badge such as **"Funūn member · rights details managed by
  them"** replaces the absent fields, so the owner sees why they are empty.

### Identity and duplicates

- **D-13:** Within one roster, identity is **`(user_id, claimed_by)`** when claimed, otherwise
  **`(user_id, lower(btrim(email)))`**. A name is never an identity key — the existing route
  already says so and is right. Do not collapse the two axes into one `COALESCE` key; the
  transition between them is exactly the moment needing reconciliation.
- **D-14:** When a found member's confirmed account email matches an existing unclaimed row,
  **claim and reactivate that row in place, preserving its `id`** — never create a second row,
  never ask the owner. Split-sheet parties, work members and Song Passport values all reference
  the row with `ON DELETE SET NULL`, and works store performer identity in JSONB with **no
  foreign key at all**, so a new row silently orphans history that has no referential integrity
  protecting it.
- **D-15:** **Archived rows resurface** rather than spawning a twin. Archive hides a row from GET
  and pickers; it does not erase identity, split sheets or audit history. Both unique indexes
  therefore cover archived canonical rows, and the resolver clears `archived_at`.
- **D-16:** Enforcement is **two partial unique indexes** plus **one service-only transactional
  `SECURITY DEFINER` RPC** performing block-check, private email resolution, existing-row
  resolution, claim/reactivation and insert as one decision. The indexes are the final race
  arbiter; check-then-insert, an advisory lock alone, or an ordinary upsert are insufficient.
- **D-17:** **Preflight before any constraint.** Migration 148 already ran a repair pass for this
  duplicate class and migration 179 landed afterwards and can recreate it, so production may hold
  duplicates a unique index would reject. Legacy consolidation is a **dedicated data migration**
  — and a **named, owned prerequisite that must complete before the index step**, not a deferred
  idea. Left unowned it makes D-16's concurrency guarantee aspirational, since the indexes are
  the final race arbiter and cannot be created while duplicates exist. Phase 41 must additionally
  not create new duplicates.
- **D-18:** A database expression index must use normalized equality on
  `lower(btrim(email))`. The current check uses `.ilike()`, which is a pattern comparison, does
  not trim a stored value, and treats `%`/`_` in input as wildcards.

### Response shape and leakage

- **D-19:** **One response shape** for created, reused and resurfaced — same status, keys and
  copy — **scoped to roster-resolution outcomes after a server-verified member match. D-01 alone
  governs member-match versus signup-invite feedback**, which is a different fact and stays
  distinguishable.
  **Uniform response does NOT mean uniform side effects.** Notifying on every idempotent retry
  lets repeated clicks, client retries or concurrent requests generate target-facing noise, which
  is harassment-shaped. Notify only on a **defined durable transition** — normally first link —
  and keep that transition bit server-side so the response still cannot reveal it. **Do not return `email`, `claimed_by`, rights fields,
  `merged_into`, or `reused`.** The existing create route returns `reused`, and quick-invite
  returns `reused` plus `alreadyMember`; those belong to the old email-entry behaviour and must
  not be copied here — under D-10 they become an oracle revealing that a private
  email-authored row matched.
- **D-20:** The route uses an **explicit response projection**, never `.select('*')`. Current
  roster endpoints return full rows, which is incompatible with any guarantee about what this
  path discloses even if today's new rows happen to leave those fields null.
- **D-21:** Timing cannot honestly be made constant. **Do not add artificial delays.** Uniform
  output, one RPC path, bounded indexed lookups, no branch-specific external calls before
  commit, no raw database error text, plus rate limiting. The protected fact is whether a private
  email-authored row matched — not whether the target has an account, which People Search
  already reveals.

### Tests the phase must carry

- **D-22:** Assert that the add response, the roster response for a newly linked member, the
  notification, and People Search contain **no** IPI, PRO/CMO affiliation, publisher or
  administrator identifier, MLC or SoundExchange ID, phone, mailing address, legal name, or
  email.

### Claude's Discretion

Rate-limit values, the exact provenance badge copy, component naming and file layout, and the
order in which the six surfaces are migrated to the shared flow.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The reviews that produced these decisions
- `.planning/reviews/CODEX-RESPONSE-260920-rights-data-disclosure.md` — why Phase 41 withholds
  rights data, and the containment item below
- `.planning/reviews/CODEX-RESPONSE-260921-roster-identity-dedupe.md` — identity key, constraint
  design, merge semantics, race handling, leakage analysis
- `.planning/reviews/CODEX-PROMPT-260920-rights-data-disclosure.md` and
  `.planning/reviews/CODEX-PROMPT-260921-roster-identity-dedupe.md` — the prompts and per-claim
  dispositions

### Discovery and privacy boundary
- `supabase/migrations/149_green_room_people_search.sql` — `discover_profile_id_by_email`; the
  no-self, is_public, no_block, connections-only gates this phase must not weaken
- `lib/green-room/discover.ts` §30-42 — `DISCOVER_PUBLIC_COLUMNS`, the deliberate PII exclusion
- `supabase/migrations/040_artist_profiles_column_privileges.sql` §83-96, §121-130 — column-level
  grants; a stronger boundary than the projection alone

### Roster identity
- `supabase/migrations/018_collaborators_split_sheets.sql` — base table, owner policy, and the
  `ON DELETE SET NULL` split-sheet reference
- `supabase/migrations/026_collaborator_identity_reconciliation.sql` — `claimed_by`,
  `archived_at`, `is_favorite`, claim functions, non-unique indexes
- `supabase/migrations/052_restore_collaborators_claimed_by.sql` §10-19 — the claimed member's
  RLS SELECT
- `supabase/migrations/148_writer_room_existing_collaborator_repair.sql` — the prior duplicate
  repair pass, which added no invariant
- `supabase/migrations/179_existing_member_collaborator_reconciliation.sql` — the server-derived
  link trigger; links but does not deduplicate
- `app/api/collaborators/route.ts` §44-78 — current dedupe and the `reused` flag
- `app/api/collaborators/quick-invite/route.ts` §95-132 — `reused` plus `alreadyMember`

### Downstream references that make row-id preservation load-bearing
- `supabase/migrations/136_work_members.sql` §82-98 — `ON DELETE SET NULL`
- `supabase/migrations/151_song_passport_foundation.sql` §37-53, §96-113 — `ON DELETE SET NULL`
  with a target-key check bound to the collaborator id
- `supabase/migrations/135_works_core.sql` §66-84 — performer identity in JSONB, no foreign key

### The existing disclosure this phase must not enlarge
- `app/(artist)/split-sheets/[id]/page.tsx` §176-248 — initiator-facing service-role join to
  other parties' live `user_profiles` rights fields
- `components/split-sheets/SplitSheetBuilder.tsx` §667-687 — renders `IPI # (live from Settings)`
- `lib/vault/pdf/split-sheet.test.ts` §212-223 — the executed PDF deliberately omits IPI

### Roadmap and prior work
- `.planning/ROADMAP.md` §2686-2772 — the Phase 41 entry, including the mobile section being
  moved out
- `.planning/quick/260913-personalized-collaborator-invites/SUMMARY.md` — the shipped invitation
  emails and the follow-up note that is this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **People Search** (`lib/green-room/discover.ts`, `components/green-room/PeopleSearch.tsx`) —
  the discovery surface, its privacy projection and its visibility doctrine. Reuse rather than
  build a second member directory.
- **`discover_profile_id_by_email`** (migration 149) — exact-email discovery that already returns
  only a profile id and enforces the full visibility and block gates.
- **Migration 179's trigger** — the correct shape for server-derived `claimed_by`: identity comes
  from confirmed account state, never from a client-supplied destination.
- **Workspace grant machinery** (`lib/workspaces/permissions.ts`,
  `supabase/migrations/184_workspace_permissions_grants.sql`) — scoped grants with
  `revoked_at`/`revoked_by`. A useful consent and revocation pattern for the later rights phase,
  **not** something this phase uses.

### Established Patterns
- **The server derives and revalidates `claimed_by`; the client never assigns it.** Migration 179
  establishes this. Stated earlier as "the client may never choose the destination account ID",
  which is too literal to implement — an explicit Add button must identify *which* search result
  was chosen, and People Search already returns a profile `id` for that purpose
  (`lib/green-room/discover.ts:80-95`). A profile id is acceptable as **untrusted** input provided
  the transaction rechecks visibility, self, blocks and eligibility; an opaque server-issued token
  is an equally acceptable design.
- Dedupe fails closed on a lookup error rather than inserting
  (`app/api/collaborators/route.ts:61-65`). Preserve that posture.
- Alert and response content is summary-only; raw records stay server-side.

### Integration Points
- The shared add-flow replaces the entry path in the six surfaces listed in D-08.
- The new resolver RPC sits alongside migration 179's trigger and must not fight it — the trigger
  fires `BEFORE INSERT OR UPDATE OF email` and will still set `claimed_by` on the email path.
- Two new partial unique indexes on `collaborators`, gated behind the D-17 preflight.

</code_context>

<specifics>
## Specific Ideas

- **"How can we avoid having two of the same Mayas?"** — the owner's framing of the identity
  problem, and the reason D-13 through D-18 exist.
- **The order is the fix.** Adding search as an option nobody sees would satisfy the roadmap's
  wording and change no behaviour.
- **A block must be unroutable.** Stated as the reason D-03 takes the strictest option despite
  D-01 taking the most permissive one.

</specifics>

<deferred>
## Deferred Ideas

- **Mobile contact matching** — its own research-gated roadmap phase. Requires a threat-modelled
  private-contact-discovery design (private-set-intersection / OPRF; unsalted hashes of phone
  numbers and emails are explicitly rejected), privacy and legal review, platform policy review,
  and a native application. **The mobile section must be moved out of the Phase 41 roadmap entry**
  so the document stops describing work this phase does not do.
- **The rights-data disclosure model** — the owner-approved direction recorded in
  `.planning/reviews/CODEX-RESPONSE-260920-rights-data-disclosure.md` (approval given
  2026-09-21 in session; the document's own "approved 2026-09-20" line could not be corroborated
  and is superseded by this record). Covers a versioned Rights Schedule, purpose-bound packets,
  explicit revocable grants, artifact ACLs, DocuSeal amendment links and destination exports.
  **Its own phase**, not Phase 41.
- **Containment prerequisite** — before Phase 41's linking path ships, remove or mask the
  initiator-facing service-role projection of other parties' live rights fields
  (`app/(artist)/split-sheets/[id]/page.tsx:176-248`;
  `components/split-sheets/SplitSheetBuilder.tsx:667-687`). Phase 41 creates more claimed links,
  and every new link enlarges the population already exposed by that join. This is containment of
  an existing disclosure, not new autofill.
- **Legacy duplicate consolidation** — a dedicated data migration (D-17). **Promoted from a
  deferred idea to a named prerequisite**: it must complete before the unique-index step, or
  D-16's race guarantee does not hold.
- **`collaborators.ipi` for claimed rows** — a stale owner-typed copy beside a canonical profile
  value, for a number that routes money. Addressed in the rights-disclosure phase.
- **`view_private_rights_identifiers`** — exists in the permission catalogue with grant and
  revocation machinery and **no production call site**. Must not be advertised as collaborator-IPI
  access until something implements it.
- **Codex review of Phase 41's plans** — the owner asked for the same run-through, verify and
  critique pass the storage work received, once concrete PLAN.md files exist.

### Reviewed Todos (not folded)
The todo matcher returned keyword matches only — "research watermarking alternatives" scored 0.9
on the word *research*. None of the 52 pending todos is about collaborator discovery. **Nothing
folded, nothing genuinely deferred.**

</deferred>

---

*Phase: 41-Collaborator Discovery & Mobile Contact Matching*
*Context gathered: 2026-09-21*
