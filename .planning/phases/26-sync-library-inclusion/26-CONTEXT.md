# Phase 26: Sync-Library Inclusion & Artist Submission - Context

**Gathered:** 2026-08-05
**Status:** Captured — NOT yet planned. Resolves the core of the buyer-catalogue inclusion deliberation.
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

---

*Phase: 26-sync-library-inclusion*
*Context: 2026-08-05 — owner inclusion decision (curated, invite + submit + blanket agreement)*
