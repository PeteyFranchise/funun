# Phase 16: GTM Beta Launch & Buyer Portal - Context

**Gathered:** 2026-07-18 (initial planning draft) · **Updated:** 2026-07-18 (discuss-phase session resolved Q-01..Q-05)
**Status:** Ready for planning (replan required — prior 16-01..16-05 plans predate these decisions)

<domain>
## Phase Boundary

Phase 16 turns the GTM plan into a product-backed beta launch motion. It does not replace Green Room Phase 12 or Trust & Safety Phase 13. It builds on them by adding a buyer-facing pathway for sync buyers, agencies, filmmakers, brands, and creator teams to discover rights-ready catalog, request licenses, and move through a structured deal workflow.

This phase covers:

- Buyer org + buyer account model (separate from artist/industry accounts) with org admins and per-member permissions.
- Admin-created buyer onboarding (founder-led beta; no self-serve org signup).
- License-request schema and API routes, including pre-cleared-terms matching.
- Buyer portal UI: filtered catalog browse, org-shared shortlists, request creation, org request dashboard with deal stages.
- Artist-facing Deals room + per-project pre-cleared terms settings.
- Admin deal workflow (negotiation queue) tying requests to Sound Vault projects, Contract Locker documents, and readiness state.
- GTM beta metrics and founder-led sales instrumentation.

This phase does not cover:

- Self-serve paid ads or campaign targeting.
- Fully automated contract negotiation.
- Legal advice or automated legal approval.
- Direct Content ID administration.
- Marketplace-scale free-text search/ranking beyond beta-safe filtered browse.
- Buyer↔artist in-app messaging (admin-mediated for beta — see D-14).

</domain>

<decisions>
## Locked Decisions

### Original (2026-07-18 planning draft)

- **D-01:** Phase 16 is a new post-Green-Room planning lane: GTM Beta Launch & Buyer Portal.
- **D-02:** The buyer/license-request gap should be solved with an integrated portal, not a long-lived manual intake form.
- **D-03:** Manual intake is allowed only as a temporary admin fallback or founder-assist path. It should write into the same tables and workflows as the portal, never a separate spreadsheet/system.
- **D-04:** Sync buyers are a distinct user audience with their own account capability, profile, verification, and permissions separate from artists and industry members.
- **D-05:** Buyer accounts should not automatically receive broad Green Room social privileges. Buyer messaging, profile access, and search depth should be gated by verification/trust state.
- **D-06:** The first buyer portal should optimize for Hook-style founder-led deals: fewer, higher-signal requests, structured rights terms, and fast legal/admin handoff.
- **D-07:** License requests should become first-class data: requested tracks/artists, usage context, territory, term, exclusivity, budget, need-by date, buyer identity, stage, owner, notes, and linked contract/document artifacts.
- **D-08:** Contract Locker should be the document destination for signed sync licenses and related legal PDFs. Phase 16 may link into Contract Locker but should not expand into the full Contract Locker Intelligence roadmap unless explicitly planned later.
- **D-09:** Trust & Safety from Phase 13 is a prerequisite for broad buyer visibility, because buyer access affects profiles, messaging, reporting, verification, and block/privacy expectations. (Phase 13 shipped and merged 2026-07-18 — prerequisite satisfied.)
- **D-10:** The GTM model should use real beta metrics before hiring an AE: 3-5 closed deals, request-to-quote time, quote-to-close rate, average sync fee, artist readiness pass rate, and buyer repeat/referral signal.

### Discuss-phase session (2026-07-18) — resolves former Q-01..Q-05

**Buyer identity model (resolves Q-01, Q-02):**

- **D-11:** Buyers are **fully separate accounts** — NOT a capability grant on the artist/industry account model — with a **company/org layer**: buyer orgs, individual buyer profiles linked to their org, and org-level admins who add employees with scoped buying permissions. (An existing artist/industry member who is also a buyer uses a separate buyer login; revisit unification post-beta alongside the standing cross-capability review note.)
- **D-12:** Org origin for beta is **Funūn-admin created**: platform admins create the company record and the first org-admin invite from the admin panel. Self-serve org signup (with approval or domain verification) is deferred post-beta.
- **D-13:** Per-member buying permissions are **two tiers**: `requester` (browse catalog + submit license requests) and `approver` (requester rights + approve terms/budget + sign off). Org admins are approvers with member management. **Solo buyers** (indie filmmakers, creators) are allowed via an auto-created single-member personal org where they are the admin — one data model, no special cases.
- **D-13a:** Activity attribution is **dual-level, company always shown**: every request/deal records the individual AND their org; a buyer profile shows the member's own activity; the company page aggregates all members' activity; artists always see which company is behind a request.

**Verification gating (resolves Q-03):**

- **D-14:** Verification is **org-level only** for beta: admin-created orgs are born verified; members inherit org verification; org admins vouch for the employees they invite. No per-member verification flow.
- **D-14a:** Default verified-buyer reach WITHOUT artist opt-in: **browse rights-ready catalog + submit license requests**. Buyers get NO direct messaging and NO non-public availability/contact signals (consistent with D-05 and Phase 13-05's owner-controlled open-to visibility).
- **D-14b:** Buyer↔artist communication is **admin-mediated for beta** (founder concierge). No request-scoped message threads and no DM unlock are built in Phase 16; revisit when deal volume outgrows concierge capacity.
- **D-14c:** **Org-shared shortlists**: members can save tracks/artists to shortlists visible to their whole org (scout saves → approver reviews). Shortlists are invisible to artists.

**Artist consent flow (resolves Q-04):**

- **D-15:** Artists **pre-clear terms per project** rather than approving every request. Pre-clearable fields are the **"Marmoset five"**: minimum fee, allowed usage/media types, territories, exclusivity yes/no, and term length. (Modeled on Marmoset's quoting dimensions — media type, reach, territory, term, per-license exclusivity — where the representation agreement acts as artist pre-clearance.)
- **D-15a:** Requests that do NOT match a project's pre-cleared terms (or target a project with none set) route to **admin negotiation first**: Funūn admins counter/align terms with the buyer before the artist is engaged — Funūn admins play the Marmoset-agency role.
- **D-15b:** Artist-facing surface is a **dedicated "Deals" sidebar room** listing all license requests across the artist's projects with deal stages — not merely embedded in vault project pages. Requests also emit Phase 10 notifications.

**Beta portal scope (resolves Q-05):**

- **D-16:** Catalog discovery is **filtered browse**: browsable rights-ready catalog with sync-relevant filters (genre, mood/energy, vocals, usage cleared). NO free-text search ranking (stays inside the beta-safe discovery exclusion). Admin-curated collections may layer on top but are not the only path.
- **D-16c (added 2026-07-18):** Artists tag tracks with **mood/descriptor terms, an energy level, and an explicit vocal/instrumental indicator**, stored in `tracks.metadata` JSONB via the Metadata Studio (plan 16-00). Rationale: descriptors are the first thing a music supervisor filters on, ahead of genre, and Funūn had no per-song version — `mood_tags` existed only on `artist_profiles.sound_identity` (artist-level, benchmark-derived) and on `antenna_opportunities` (the demand side). The mood vocabulary is **shared between supply and demand** so Antenna matching and buyer catalog filtering use one term list. Controlled vocabulary only — free-form mood text is rejected so filtering is reliable. Vocal/instrumental is explicit, never inferred from lyrics presence or the `zxx` language code.
- **D-16d (added 2026-07-18):** Every industry identifier Funūn stores carries an **inline explainer** (what it identifies, its DDEX level, who issues it, how to obtain one, what it unlocks), identifiers are stored and exported at their **correct DDEX level** (party / work / resource / release), and artists can export a **cross-project code sheet** of their whole catalog. Adds the three missing DDEX identifiers: release-level `grid` and `catalog_number`, and party-level `artist_profiles.isni` (ISNI previously existed only on Performer entries, so the primary artist had nowhere to record their own). Explainer copy describes processes and links to issuing bodies — it never recommends which PRO, society, or distributor to choose, following the precedent already set by the Rights page. Plan 16-11.
- **D-16e (added 2026-07-18):** Funūn **generates** the self-assignable identifiers (catalog number, GRid, UPC — joining the existing ISRC generator) via one generalized prefix + counter + check-digit utility, and **never** generates centrally-allocated ones (ISWC, IPI, ISNI, IPN, MLC ID, DPID). Eligibility is **structural, not advisory**: the check lives inside the generator, with no force flag or override, so a UPC can never be minted under a GS1 prefix the artist does not own — the concrete harm being a barcode that passes check-digit validation while belonging to another company. Every identifier states **who should generate it, who should not, and where to import it from instead**; the common case (an independent artist whose distributor supplies the UPC) must read as a correct outcome, not a locked feature. Identifiers record **provenance** (generated / imported / manual) so Funūn-minted codes are never confused with distributor-assigned ones. Plan 16-11.
- **D-16f (added 2026-07-18 — supersedes the generation model in D-16e for GRid and UPC):** On who holds identifier prefixes, Funūn takes a **hybrid, GRid-only issuing-authority** posture:
  - **GRid** is **platform-issued**: Funūn registers ONE GRid issuer code with the International GRid Authority (IFPI) and mints release numbers under it for artists, distributor-style, from a **single global counter**. The artist needs no prefix and pays nothing. Rationale: artists almost never hold a GRid issuer code and distributors don't always supply one, so this is real value Funūn can add cheaply — the issuer-code fee is one-off to the organisation, release numbers are free and self-assigned. A label that holds its own issuer code may override with theirs. Correctness consequence: the release-number counter is **shared across all artists** and must be server-owned/atomic — a per-artist counter would collide two artists' releases under Funūn's code.
  - **UPC is explicitly NOT platform-issued.** Funūn holds no GS1 company prefix and never mints a UPC. Reason: Funūn is not the distributor (Wave 1 ships a distributor gate; artists keep their own distributor), and a Funūn-issued UPC would collide with the one the distributor assigns at delivery — a release can carry only one. UPC generation remains available only to an artist who holds their OWN GS1 prefix.
  - **ISRC, catalog number** stay artist-prefix / self-assigned as before. **Centrally-allocated** identifiers are still never generated.
  - Being an issuing authority for GRid makes Funūn a **permanent registry operator** for those codes (uniqueness guarantee, codes that outlive an artist's account). Accepted deliberately for GRid's narrow scope; revisit if scope broadens. This is why D-16e's blanket "Funūn generates the self-assignable identifiers" framing is narrowed here: GRid is platform-issued, UPC is artist-only-or-not-at-all.
- **D-16b (amended 2026-07-18 after competitor research):** Filters ALSO include **musical key and BPM**, matched against the project's tracks. Rationale: Musicbed exposes key/BPM as first-class clickable filters on every song page because editors cutting to locked picture search that way; `tracks.bpm` (INTEGER) and `tracks.key_signature` (TEXT) already exist in migration 001, and `antenna_opportunities.bpm_min/bpm_max` is an existing range-filter precedent — so this is a low-cost, high-relevance addition. Key/BPM live on TRACKS while the catalog browses PROJECTS: a project matches when ANY of its tracks matches, and projects with null key/BPM are only excluded when that specific filter is active (never silently dropped from unfiltered browse).
- **D-16a:** Buyer request tracking is an **org dashboard with deal stages** (submitted → in negotiation → terms agreed → contract → closed/declined), visible org-wide. This dashboard doubles as the substrate for the D-10 GTM metrics.

**Deal flow model (2026-07-18 follow-up session — the end-to-end deal):**

- **D-17 (money):** **Buyer pays Funūn, Funūn pays artist.** Funūn invoices the buyer via Stripe, takes its commission, and pays out the artist's net. Funūn is the merchant of record in the middle of every deal.
- **D-17a (payout):** **Stripe Connect from day one** — artists onboard to Stripe Connect and payments auto-split (commission to Funūn, net to artist). Chosen over manual beta payouts deliberately; Connect onboarding is in scope for this phase.
- **D-18 (contract):** **Funūn admin drafts from a standard sync-license template, executed via embedded e-sign.** Both parties sign without leaving Funūn; the signed PDF lands in Contract Locker (per D-08).
- **D-18a (e-sign provider):** **SignWell.** Decision driver: keeping signing fully in-app — Dropbox Sign gates embedded signing behind its $300/mo Standard API plan (cheaper tiers redirect signers to Dropbox-hosted UI), while SignWell supports embedded signing pay-as-you-go (25 free API docs/mo, then ~$0.85/doc — effectively free at beta volume). Implement the SignWell adapter behind the existing lib/esign/provider.ts abstraction. This supersedes older docs leaning Dropbox Sign; update docs/e-sign-integration.md accordingly.
- **D-19 (delivery):** **Through the portal, reusing Phase 14's Export pack.** Once the contract is signed, the buyer's dashboard unlocks the export-pack download (metadata/stems/master/MP3) for the licensed project. The deal ends inside the product; no manual file sending.
- **D-20 (commission):** **Commission % tracked on every deal**: each deal records gross fee, Funūn commission %, and artist net — feeding both the Stripe Connect split (D-17a) and the D-10 GTM metrics (average sync fee, real economics).

### Claude's Discretion

- Schema mechanics for buyer orgs/members/permissions (tables, RLS doctrine) — follow the column-privilege and server-owned-write precedents from migrations 040/056/058.
- Exact filter taxonomy for catalog browse (reuse metadata/genre vocabularies where they exist).
- Deal-stage state machine details beyond the named stages.
- Admin UI conventions — follow the `/admin` patterns established in 13-04/13-05 (verifyAdmin gate, admin sidebar).

</decisions>

<canonical_refs>
## Canonical References

- `/Users/peterzora/Desktop/Funun_GTM_Business_Plan.md` - external GTM/business plan reviewed 2026-07-18.
- `/Users/peterzora/Desktop/Funun_Roadmap_Gap_Review_Brief.md` - external roadmap-gap audit instructions and bundled GTM plan.
- `.planning/ROADMAP.md` - current phase map and sequencing.
- `.planning/REQUIREMENTS.md` - Green Room discovery/feed/trust requirements.
- `.planning/phases/12-discovery-feed-people-search/12-CONTEXT.md` - feed/search/discovery substrate and sponsored-placement decisions.
- `.planning/phases/13-network-trust-safety/13-CONTEXT.md` - block/report/visibility/verification prerequisites (shipped; migrations 058-061 live).
- `.planning/phases/15-account-capability-model/15-CONTEXT.md` - capability-grants precedent (NOTE: buyers deliberately do NOT use this model per D-11; read for the trust-bar/admin-approval patterns only).
- `.planning/quick/260715-contract-locker-intelligence-roadmap/PLAN.md` - future Contract Locker intelligence note.
- `docs/e-sign-integration.md` - provider abstraction and live e-sign integration spec.
- `lib/esign/provider.ts` - existing provider-agnostic e-sign interface.
- `lib/vault/stage3.ts` - readiness/documents/content-ID status logic.
- `app/(artist)/vault/[projectId]/rights/page.tsx` - rights guidance surface.
- `app/(artist)/green-room/page.tsx` and `components/green-room/` - Green Room entry and feed/search surfaces.
- `lib/capabilities/` - capability model created by Phase 15 (precedent only, see above).
- `lib/trust-safety/` - contracts, block-check, reports, verification, visibility modules from Phase 13 (privacy doctrine to extend to buyer surfaces).
- https://www.marmosetmusic.com/license-agreement and https://www.licenseorg.com/guide/music-audio/marmoset-music - Marmoset licensing model referenced for D-15 (quoting dimensions + representation-as-pre-clearance).
- `.planning/research/COMPETITOR-musicbed-buyer-experience.md` - Musicbed preview/download split, real license-record fields, SyncID mechanics (added 2026-07-18).
- `.planning/research/COMPETITOR-marmoset-artlist-buyer-experience.md` - Marmoset + Artlist buyer flows, three-way comparison, and the finding that Funūn's a-la-carte model should follow the Musicbed/Marmoset structured "license out" pattern rather than Artlist's blanket-subscription download-equals-license pattern (added 2026-07-18).

</canonical_refs>

<code_context>
## Existing Product Substrate

- Artists already have Sound Vault, metadata, document lifecycle, rights guidance, Launchpad, Antenna, Green Room, profile, connection, DM, and capability infrastructure.
- Phases 11-13 are merged to main (PR #37, 2026-07-18); migrations through 061 are live. Trust & safety (blocks, reports, admin verification, profile/open-to visibility) is shipped — the D-09 prerequisite is satisfied.
- Wave 3's curator accounts are the existing precedent for a fully separate account type (magic-link, isolated from artist_profiles) — closest analog to the D-11 buyer account decision.
- Admin surface conventions are established: app/(admin) layout, verifyAdmin() gate, ReportsAdmin/VerificationAdmin/PlacementAdmin component patterns.
- Upload-signed PDF flow exists for documents; live provider-backed embedded e-sign is abstracted but not implemented end-to-end.

## Known Gaps

- No `buyer_orgs`/`buyer_members`/`license_requests` schema exists.
- No buyer portal route exists.
- No public "Request License" flow exists on profile, release, project, or Green Room surfaces.
- No pre-cleared-terms schema or matching logic exists on vault projects.
- No artist "Deals" room exists.
- No deal-stage workflow connects a buyer request to Contract Locker documents.
- No GTM beta dashboard exists for deal/request metrics.
- Current e-sign docs are not aligned on provider recommendation: older docs lean Dropbox Sign, while the external GTM plan recommends SignWell.

</code_context>

<deferred>
## Deferred Ideas

- Self-serve buyer org signup (approval-queue or domain-verified) — post-beta; beta orgs are admin-created (D-12).
- Per-member buyer verification tiers and action-based verification escalation — beta uses org-level verification only (D-14).
- Request-scoped buyer↔artist message threads or DM unlock on accept — beta is admin-mediated (D-14b).
- Third "viewer" permission tier for buyer orgs (browse-only seats) — beta ships requester/approver only (D-13).
- Unifying buyer accounts with the Phase 15 capability model (one login holding artist+industry+buyer) — revisit post-beta with the standing cross-capability review.
- Free-text catalog search and ranking — beta is filtered browse only (D-16).
- Self-serve paid ad buying, targeting, budgets, Stripe billing, ad review, and ad analytics.
- Content ID direct partnership or fingerprinting build.
- Automated legal negotiation or legal advice.
- AE hiring automation, CRM replacement, or broad sales tooling before the first 3-5 closed deals.

</deferred>

---

*Phase: 16-GTM Beta Launch & Buyer Portal*
*Context gathered: 2026-07-18 · updated after discuss-phase session 2026-07-18*
