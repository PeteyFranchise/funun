# Phase 17: Split-Sheet E-Sign - Context

**Gathered:** 2026-07-19 (discuss-phase session)
**Status:** Ready for planning — GATED on the human provider-verification pass (see below) before plan-phase execution

<domain>
## Phase Boundary

Take a split sheet from draft → collaborator approval → embedded, mobile-first e-signatures → a fully executed PDF + Certificate of Signature in Contract Locker that moves the readiness gate — without anyone leaving Funūn, free to every artist within structural guardrails. This is a CONVERGENCE phase: it connects three existing systems that never touch (the migration-018 approval pipeline, the vault_documents readiness gate, the metadata-studio composers[] splits) at the signature moment. It is also Funūn's FIRST live e-sign integration (DocuSeal hosted), establishing the webhook/route patterns 16-09's SignWell adapter will reuse.

This phase covers:
- DocuSeal adapter behind lib/esign/provider.ts (hosted API + MIT @docuseal/react embed).
- Split-sheet PDF renderer (the missing artifact — alongside lib/vault/pdf/metadata-sheet + credits-sheet).
- Approve→sign lifecycle wiring on the existing split_sheets/split_sheet_parties pipeline, incl. fast lane, void/objection, nudges.
- Readiness tiering (5/10/15) for the existing 15-point split_sheets item, in BOTH the breakdown UI and the DB-trigger score.
- Executed-document distribution (all parties) + later attachment of standalone sheets to projects.
- Offered write-back reconciliation into tracks.metadata.composers[].
- Usage/cost telemetry feeding the AM-3 $500/mo trigger.

This phase does NOT cover: sync-license e-sign (16-09, SignWell), any paid tier, ad monetization, embedded license-ID metadata (separate roadmap idea), Content ID.

</domain>

<decisions>
## Locked Inputs (from prior deliberation — do NOT re-discuss)

- **D-18b:** embedded (never leave Funūn) + mobile-first (studio-with-only-a-phone is the canonical test); dual-provider behind lib/esign/provider.ts.
- **AM-1:** free for all artists until the AM-3 trigger; wet-sign upload remains the universal fallback.
- **AM-2:** structural guardrails — Funūn split-sheet template ONLY (no arbitrary PDFs), ~10/mo per-artist soft cap with admin bump, project-readiness minimum where a project exists.
- **AM-3:** $500/mo spend re-opens the access-model deliberation with data.
- **AM-5:** executes BEFORE Phase 16; claims migrations 062+; Phase 16's drafted plans get a migration-number touch-up before their execution.
- Spikes 006a/006b/007: DocuSeal mobile UX validated; hosted path AGPL-clear (MIT embed SDK); embedding is Pro-paid even self-hosted → hosted ~$0.20/completed-doc tier.

## Session Decisions (2026-07-19)

**Signing lifecycle:**
- **P17-01:** **Two-step by default** — the existing approve/counter loop settles terms; unanimous approval mints the DocuSeal envelope; parties sign the rendered PDF. **Initiator fast lane per sheet:** a "skip straight to signing" option for splits already agreed in person (studio handshake). In the fast lane the completed signature BACKFILLS approval state (signature ⊃ approval) so downstream logic has one truth.
- **P17-02:** **Any-party objection voids a minted envelope** (before all signatures land): envelope voids, sheet returns to the approval/counter stage, re-consensus mints a new envelope. Whether voided envelopes bill (and thus count toward the AM-2 cap) is a provider-gate verification item — voids consume cap ONLY if DocuSeal charges for them.

**Readiness stage mapping (15-point split_sheets item):**
- **P17-03:** **Tiers 5 / 10 / 15.** Draft = 0. Sent-awaiting = 5. Countered = 5 with a visible "renegotiating" flag (a counter is progress, not regression, but never scores above consensus). All-approved-signatures-pending = 10 (fast-lane sheets ENTER at 10 on send-for-signature). Fully executed = 15 via the signed PDF + Certificate landing in vault_documents as split_sheet/signed.
- **P17-03-impl (honesty note for researcher/planner):** the executed=15 endpoint reuses the existing signedOf() gate unchanged, but the 5/10 partial tiers require the split-sheet item's status derivation to read PIPELINE state (split_sheets.status) — that means extending BOTH readinessItemsForProject() (breakdown UI) AND the DB trigger that computes vault_readiness_score. This is a derivation change, NOT a READINESS_ITEMS registry/points change (the item stays 15 points — no cross-project score redistribution).
- **P17-04:** **Initiator notifications (Phase 10 bell + per-party chips):** party approved, party signed, counter received (highest urgency), fully executed, AND viewed-but-no-action nudges — a party who OPENED the link (page-visit tracking, not email-open tracking) but hasn't acted within ~3 days triggers an initiator notification with a one-tap re-send. Nudge cadence details are planner discretion.

**Standalone sheets (vault_project_id = null):**
- **P17-05:** **Full e-sign + personal locker + attachable later.** Identical approve→sign flow; the executed PDF lands in the initiator's Contract Locker unattached; any party with an account (then or later) can ATTACH the executed sheet to a matching vault project they own — at which point THAT project's readiness moves. The document follows the song, not the project row.
- **P17-05a (AM-2 amendment, recorded as AM-2a):** the template-only guardrail is satisfied by "the Funūn split-sheet template," project OPTIONAL — standalone sheets relax AM-2's letter ("tied to a real vault project") while preserving its intent (no arbitrary-PDF abuse). The project-readiness minimum applies only when a project is attached at initiation time.
- **P17-06:** **Initiator's cap; every party gets the record.** The send consumes the initiator's ~10/mo allowance. Every party — account or not — can retrieve the executed PDF + Certificate from their token link; parties WITH Funūn accounts ALSO get it in their own Contract Locker (split sheets are every signer's legal record — this is the stickiness thesis applied to collaborators). Cross-account locker visibility mechanics (share vs copy of the vault_documents row) are researcher territory; ownership/RLS doctrine per migrations 040/056/058 applies.

**Splits reconciliation:**
- **P17-07:** **The executed sheet is authoritative; write-back is OFFERED, never silent.** On execution (or later attach), Funūn offers a one-tap sync of the signed percentages into the project's tracks.metadata.composers[] — showing a diff the artist confirms. No silent mutation of registration-feeding data (composers[] drives PRO/MLC/CWR + IPI). Until resolved, a visible mismatch warning renders (extending Contract Locker's existing ≠100% cross-check to compare against executed sheets).

## Claude's Discretion

- DocuSeal API mechanics (template management, webhook events, embed token flow) — from official docs during research.
- Exact nudge cadence/copy; chip visual states; renegotiating-flag rendering.
- Schema for envelope/e-sign state (new columns on split_sheet_parties vs a new table) — follow migration 018's shape and the 040/056/058 privilege doctrine; all writes server-owned.
- PDF layout of the split-sheet renderer (follow metadata-sheet/credits-sheet precedent; include PRO/IPI per party — the data is already captured).

</decisions>

<canonical_refs>
## Canonical References

- `.planning/deliberations/esign-split-sheet-economics.md` — AM-1..AM-5, spike results, provider economics.
- `.planning/ROADMAP.md` v1.3-pre section — current-state map (three-systems fracture) + readiness lifecycle table.
- `supabase/migrations/018_collaborators_split_sheets.sql` — split_sheets/split_sheet_parties/collaborator_invites schema, token design.
- `lib/split-sheets/approval.ts`, `app/api/split-sheets/` (CRUD + send-for-approval), `app/approve/[token]/` (public approve/counter), `components/split-sheets/SplitSheetBuilder.tsx` — the approval pipeline to build on.
- `lib/esign/provider.ts` — the abstraction the DocuSeal adapter implements.
- `lib/vault/pdf/metadata-sheet.tsx`, `credits-sheet.tsx` — PDF renderer precedent (@react-pdf/renderer).
- `lib/vault/readiness.ts` (signedOf + item derivation) + the DB trigger computing vault_readiness_score — both need P17-03 tiering.
- `types/index.ts` READINESS_ITEMS — split_sheets item stays 15 points; registry untouched.
- `.planning/spikes/006a-docuseal-mobile-embed/`, `006b-signwell-mobile-embed/`, `007-docuseal-license-audit-trail/` — verified groundwork.
- https://www.docuseal.com/docs / developers docs — API + embed references for research.

</canonical_refs>

<provider_gate_result>
## Provider Gate: PASSED 2026-07-20 — see 17-PROVIDER-VERIFICATION.md

All five items resolved against a live sandbox account. Key outcomes feeding the remaining plans:
- **VOIDED_ENVELOPES_COUNT_TOWARD_CAP = false** (confirmed: DocuSeal bills per *completed* doc; archived-before-completion is free).
- **Webhook scheme confirmed** — and a real bug fixed: timestamps are UNIX **seconds**, not ms (17-01 assumed ms; would have rejected every genuine webhook). Fixed in de9ce7f.
- **Certificate quality exceeds the bar** (dual SHA256, per-signer IP/session/UA/timezone, email-verified flag, full event log). API-completed signers are labeled distinctly from hand-signed — good for the P17-01 fast lane's legal record.
- **Pro plan = $20/user/mo + $0.20/completion** — matches AM-1's assumed economics exactly; white-label covers logo/sender/domain, audit-log branding undocumented.

### NEW decisions from the verification review (2026-07-20)
- **P17-08 (font):** Bundle **Noto Sans (SIL OFL)** and register it with @react-pdf/renderer. Fixes a SHIPPED bug where non-Latin-1 glyphs are silently corrupted in ALL three PDF renderers — `Nikola Jokić` renders as `Nikola Joki` (character dropped) and `Funūn` as `Funkn`. Corrupting a collaborator's legal name on the instrument governing their royalties is unacceptable for a rights-documentation product.
- **P17-09 (legal-grade document):** Rebuild the split-sheet document from a table into an agreement: explicit **composition-vs-master scope** (today's single `SPLIT` column is dangerously ambiguous for producer rows), date of agreement, legal name + professional name, publisher (name/PRO/IPI) per writer, writer/publisher share columns, sample & interpolation disclosure, ISWC/ISRC linkage from the metadata studio, per-signature date lines, and **operative agreement language**.
- **P17-09a (counsel gate):** The operative language is conventional split-sheet boilerplate, but it governs real royalty splits. It ships **flagged for attorney review** — Funūn's roadmap guardrail positions the product as document organization, not a substitute for counsel. Review before real artists sign against it at scale.
- **P17-10 (de-DocuSealing):** Full white-label. Free measures first — `send_email: false` with Funūn's own Resend invites from `esign@funun.studio` (with per-submitter `reply_to` so replies reach a real mailbox), plus embedded signing so no one visits docuseal.com. Then Pro white-label for the embed. Plus a **Funūn Certificate of Completion** that cites DocuSeal as signing provider and attaches their audit log as underlying evidence — honest about provenance while making the artist-facing artifact Funūn's.
- **Production note:** the sandbox banner ("Developer Sandbox — Upgrade to start using in Production") means the Pro upgrade is required before real artist use, not merely for white-label.

</provider_gate_result>

<provider_gate>
## Provider Verification Gate (HUMAN — before plan-phase execution)

Pete runs a DocuSeal trial (~30 min): (1) inspect a real Certificate of Signature (fields, timestamps, IP, event granularity); (2) confirm white-label scope/price for the embedded form; (3) run a 3-signer async multi-party template test; (4) deliverability check; (5) NEW from P17-02 — confirm whether VOIDED envelopes bill. Discussion may proceed to plan-phase drafting without this, but execution must not start before it.
</provider_gate>

<deferred>
## Deferred Ideas

- Embedded license-ID metadata in executed PDFs (standing roadmap candidate — pairs with this phase's per-execution artifact generation, but gated on its own discussion).
- Counter-proposal UX for splits ranges/percentages negotiation beyond the existing counter flow.
- Open-tracking-based email analytics beyond the page-visit nudge signal.
- Split-sheet template variants (producer points, sample clearance riders) — template-only guardrail keeps ONE template for now.

</deferred>

---

*Phase: 17-split-sheet-esign · Context gathered: 2026-07-19*
