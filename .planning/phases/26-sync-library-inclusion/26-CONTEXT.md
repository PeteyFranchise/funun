# Phase 26: Sync-Library Inclusion & Artist Submission - Context

**Gathered:** 2026-08-05
**Status:** Key decisions LOCKED (2026-08-07 live owner planning) — see "Locked decisions" section below. Ready for UI design (/gsd-ui-phase) + planning.
**Source:** owner decision during buyer-onboarding discussion (2026-08-05)

<domain>
## Phase Boundary

Define and build **how songs get into the buyer catalogue** — the **sync-library**. This is the **supply
pipeline** behind the whole buyer side. Core decision (owner, 2026-08-05): the sync-library is **curated,
not open**.

**The inclusion model (decided):**
- The **Sound Vault is open** — anyone can make one. The **sync-library is separate and curated** — only
  **chosen / invited artists** may submit songs to it.
- Songs **originate in the Sound Vault** but must be **explicitly submitted** to the sync-library — they do
  not flow in automatically from readiness.
- To submit, an artist **signs a blanket agreement** authorizing Funūn to **shop / represent** those songs.
- Funūn then **turns on public view** for the song and **admits it** to "Browse the Catalogue."
- **Artist-facing opportunity:** Funūn can **invite** an artist to add songs to the sync-library — and this
  may be one of the **first opportunities an artist sees on their Funūn page** ("add your songs so you can
  get paid on sync deals").

**In scope:** the artist submission flow (invite → submit → blanket-agreement e-sign → live); the admin
curation/invite + admission side; the public-view toggle + catalogue admission; replacing today's
inclusion placeholder (`isRightsReady` / `is_public + readiness`) with a real listing model.

**Out of scope / later:** the buyer-side transact experience (Phase 22/23); per-deal buyer licensing terms
(the signing model deliberation); pricing.
</domain>

<decisions>
## Decisions (owner 2026-08-05) — resolve the inclusion deliberation's core
- **Curated + invite-gated + opt-in:** only chosen/invited artists submit; submission is an explicit artist
  action, not an automatic readiness side effect. (Resolves inclusion sub-decisions #1 opt-in and #2 curation.)
- **Blanket agreement required:** the artist signs a blanket agreement (authorizing Funūn to shop the songs)
  as part of submission. New e-sign artifact via `lib/esign/provider.ts`.
- **Funūn controls admission:** Funūn turns on public view + adds the song to the browse catalogue.
- **Vault ≠ sync-library:** distinct concepts; the sync-library is a represented, curated catalogue built
  on top of Vault songs.
</decisions>

<open_questions>
## Open — still to reason through (carried from the inclusion deliberation)
1. **Data model** — an explicit listing state per song/track (e.g. `sync_listing`: invited / submitted /
   agreement-signed / live / withdrawn) replacing "is_public + readiness". Decide before schema hardens.
2. **Granularity** — project-level or track-level submission/listing? (A project may have some eligible tracks.)
3. **Tri-state rights meaning** — the catalogue shows Rights ready / Partial / Contact required; what real
   conditions map to each, now that a blanket agreement gates inclusion?
4. **Blanket agreement scope** — does it also pre-authorize licensing *terms* (blanket pre-auth), or only
   authorize Funūn to *shop*? This is where it **meets the sync-license-signing-model deliberation** — the
   artist→Funūn authorization vs the buyer→artist per-deal license are related but distinct.
5. **Revocation** — how an artist pulls a song from the sync-library, and what happens to in-flight buyer interest.
6. **The invite/opportunity mechanic** — how Funūn invites artists; how it surfaces as an "opportunity" on the
   artist's Funūn page (ties to the existing Antenna/opportunities surface?).
7. **Relationship to Model A supply** — this is upstream of live catalogue data (Phase 22 · 22-05).
</open_questions>

<canonical_refs>
## Canonical References
- `.planning/deliberations/buyer-catalogue-inclusion-model.md` — **this phase resolves its core**; read for the full sub-decision list.
- `.planning/deliberations/sync-license-signing-model.md` — the blanket agreement relates to (may inform) the signing model.
- `lib/deals/catalog.ts` (`isRightsReady`, `CATALOG_READINESS_THRESHOLD`) — the placeholder inclusion gate to replace.
- `lib/esign/provider.ts` — e-sign abstraction for the blanket agreement.
- Sound Vault + `lib/vault/readiness.ts` — upstream song source.
- Antenna / opportunities surface — candidate home for the artist-facing "add to sync-library" invite.
- Phase 22 · `22-05-PLAN.md` (live-data enrichment) — the downstream consumer of this supply.
</canonical_refs>

<resolved>
## Locked decisions (2026-08-07 — live owner planning; supersedes the open questions above)

**Two entry paths into the sync library, converging at the blanket agreement:**
- **Invited (push):** a Funūn team member invites the artist → a dedicated **home spotlight card** on the
  artist's Funūn page (backed by `capability_grants`, source `admin_invited`) → artist adds song(s) from the
  Vault → signs the blanket agreement → staff admits → live.
- **Self-application (pull):** an *uninvited* artist proactively **submits songs for review** (flexibly: one
  song, several, or a whole EP/album) → Funūn staff review and **accept** → the artist joins the **same
  pipeline from the blanket-agreement step onward** (they have already supplied the songs) → admitted → live.
  Acceptance mints the same "sync-library participant" grant (`capability_grants`, source `self_applied`).
- This **revises the earlier "invited-only" framing** (Phase Boundary + Decisions above): the model is
  **curated = invited OR self-applied-and-accepted**. *Applying* (submitting songs for review) is open to any
  artist; being *admitted* is always curated (invite = pre-acceptance; application = earns acceptance via staff review).

**Resolves OQ#6 (invite mechanic):** dedicated home **spotlight card** backed by `capability_grants` — NOT
embedded in Antenna (its match/apply semantics do not fit a hand-picked invite). Two grant sources:
`admin_invited`, `self_applied`.

**Artist-side surface placement + hub gating (owner 2026-08-07):**
- **Invited spotlight card** → the artist **home** (`/dashboard` or `/launchpad` — UI-phase picks), shown only
  to artists with a pending `admin_invited` grant.
- **Self-apply entry point** → a per-song **"Submit to Sync Library"** action in the **Sound Vault** (`/vault`),
  available to **ALL artists**. This is the only pre-admission door for an uninvited artist — it is **NOT gated**.
- **Pre-admission status + signing live ON the song in the Vault** (status badge: applied / under review /
  agreement-pending / admitted / rejected) and via notifications — NOT in the hub. The one-time
  blanket-agreement signing is reached from the song's status action (self-apply) or the invite flow (invited).
- **"Sync Library" hub** (dedicated artist nav item + page) → appears **ONLY once the artist has ≥1 song
  ADMITTED** (live in the catalogue) — progressive disclosure; it does not exist for artists with zero admitted
  songs. The hub is the **post-admission home**: admitted songs + statuses, the signed agreement on file,
  submit-more-songs, and (future) sync earnings/deals. Nav visibility is a **server-side check** (≥1 admitted
  listing), mirroring how `capabilities` are read server-side in `app/(artist)/layout.tsx` and gated in
  `components/nav/ArtistNav.tsx`. **Nav placement: directly under "Deals"** (position 4 in the artist nav —
  owner-confirmed 2026-08-07).
- **Implication:** the *initial* self-application journey (fresh artist → apply → track status → sign) happens
  **without the hub**, via the Vault; the hub is *earned* by getting a first song in.
- **Full artist nav order (owner-confirmed 2026-08-07):** also move **Split Sheets** to sit **directly under
  Contract Locker** (it is part of the Contract Locker) — in BOTH menus; a small reorder of the existing
  `ArtistNav.tsx` ITEMS array, applied as part of this phase's nav work. Resulting order — **before admission:**
  Sound Vault · Contract Locker · Split Sheets · Deals · Collaborators · The Green Room · Network · Messages ·
  Antenna · PitchPlug · Benchmarks · Launchpad · Rights Coach · Earnings · Settings. **After first admission:**
  same, with **Sync Library inserted directly under Deals** → Sound Vault · Contract Locker · Split Sheets ·
  Deals · **Sync Library** · Collaborators · The Green Room · Network · Messages · Antenna · PitchPlug ·
  Benchmarks · Launchpad · Rights Coach · Earnings · Settings.
- **New-feature highlight when the hub unlocks (owner 2026-08-07):** the moment the Sync Library hub appears
  (first song admitted), highlight it so the artist notices — reuse the existing notification system
  (`lib/notifications` `createNotification`, surfaced in `components/nav/NotificationBell.tsx` /
  `NotificationPanel.tsx`): (a) fire an in-app **notification** ("'[Song]' is now live in the Sync Library —
  manage your catalogue here") linking to the hub; (b) show a **"New" badge/dot** on the Sync Library nav item
  until the artist opens it the first time, then clear it (needs a lightweight per-user "seen" flag); (c) optional
  one-time coach-mark/tooltip anchored to the nav item on first visit. Build this as a small reusable
  "newly-unlocked feature" highlight primitive where practical, so future gated features reuse it.

**Resolves OQ#2 (granularity) + OQ#1 (data model): SONG-LEVEL.**
- The **individual song/track is the licensable unit** — a buyer licenses one song at a time.
- Submission is **batched but per-song-admitted**: an artist may submit 1 song, several, or a whole release;
  **each song is reviewed and admitted individually**. No fixed batch cap (the earlier "3–5 songs" was illustrative).
- Data model: a **per-song sync-listing entity** with a status state machine (e.g. `applied`/`invited` →
  `agreement_pending` → `admitted` / `rejected` / `withdrawn`), replacing the `isRightsReady` /
  `is_public + readiness` placeholder. Dedicated table(s), NOT a repurposed `is_public` (overloaded — it also
  drives the public profile grid). Planner finalizes exact states/columns.

**Resolves OQ#4 (agreement scope): pre-authorize terms EXCEPT price.**
- The blanket agreement grants Funūn authority to **shop AND to negotiate/execute** sync licenses on the
  artist's behalf.
- **Price and its drivers — scope, medium, exclusive vs. non-exclusive — are negotiated per deal** (usually by
  the Funūn AE); the agreement gives Funūn the authority to conduct that negotiation.
- **One blanket ("master") agreement per artist** covering all songs they submit to the sync library —
  **sign-once, NOT per-submission** (owner-confirmed 2026-08-07). Later submissions fall under the same signed
  agreement; a re-sign is needed only if the agreement version materially changes.
- **Temporary agreement doc:** owner-requested a **draft template now** for review/amendment — see
  `26-BLANKET-AGREEMENT-DRAFT.md`. **Counsel drafts + approves the final** later. The agreement must be a
  **swappable/versioned template** so the counsel-approved version replaces the draft with no code change.

**Counsel/production gate — NOT a build blocker (owner 2026-08-07):** with no music uploaded yet, there is
nothing to shop and nothing to mint in production, so the Phase-17-style "counsel-reviewed-before-production-mint"
concern **does not gate this build**. Build the full pipeline end-to-end using the temporary draft agreement;
treat "swap in counsel-approved agreement" as a pre-real-launch checklist item, not a code gate that impedes
development or testing.

**OQ#5 (revocation):** withdrawal removes the song from the catalogue (stops it being returned/browsable)
immediately; there are **no in-flight buyer deals in this phase's scope** (no licensing occurs here), so
nothing downstream to cancel. Keep simple: withdraw → un-admit.

**OQ#3 (tri-state rights meaning):** the catalogue's Rights ready / Partial / Contact-required tri-state now
sits *on top of* admission — an admitted song with a signed blanket agreement is at least "rights ready to shop."
Planner maps the tri-state to real conditions (signed agreement + song readiness), replacing the placeholder.

**Phase boundary sharpened (owner 2026-08-07):** Phase 26 **populates the sync library** — submissions,
admissions, signed blanket agreements, and staff familiarization with the catalogue to shop. **No actual
licensing, sale, or buyer request occurs in this phase** — that is downstream/future. Staging the shelf, not
transacting.

**Roadmap follow-on (owner 2026-08-07):** a future **self-serve flat-price licensing platform** (Marmoset-style)
for smaller deals that do not require negotiation — added to ROADMAP.md as a later phase. Out of scope for Phase 26.
</resolved>

---

*Phase: 26-sync-library-inclusion*
*Context: 2026-08-05 — owner inclusion decision (curated, invite + submit + blanket agreement)*
*Decisions locked: 2026-08-07 — song-level, two entry paths, agreement pre-authorizes terms except price*
