---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
verified: 2026-08-16T04:01:01Z
status: human_needed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Open a sent Selects link (/selects/[token]) in a browser: play a track, react (love/pass/more-like-this), approve, request changes, and confirm the invalid/expired-token page leaks no org/client/AE/track data."
    expected: "Playback streams the watermarked preview (audible soft tonal pulse for a WAV-sourced track), reactions persist, approve/request-changes transitions the Selects status, and an invalid token shows only the 'This link isn't live.' state."
    why_human: "Audio playback, the audible-tag character, and full-page visual/interaction fidelity against the locked mockup cannot be confirmed by static analysis — this project has no browser test harness."
  - test: "As a non-leadership AE, sign in and open My Client Partners, a company workspace, a person workspace, and the Selects builder; confirm the Clients/Companies tabs, column show/hide/drag-reorder/sort persistence across reload, and that only your own assigned clients ever appear."
    expected: "Only own-book clients render; column state persists per-AE via cookie; the 'Client Partners' leadership tower link and nav item are absent for the AE role; an uncovered org/person URL 404s."
    why_human: "Interactive drag-reorder, cookie-restore-on-reload, and live-session role scoping have no automated test harness in this repo (CLAUDE.md: no test framework for UI); code inspection confirms wiring but not runtime behavior."
  - test: "As an AE, build a Selects from The Crate (add/remove tracks, per-track + cover notes, AI-draft off a linked brief, save/recall a Crate search, team-share a search), then Send it and open the resulting link."
    expected: "Add is idempotent, remove is soft with an Undo toast, auto-save fires on edit with a visible saved state, AI-draft populates a rights-ready-first starter, Send is disabled until >=1 track and then mints a working /selects/{token} link."
    why_human: "End-to-end curate-and-send flow requires a live Supabase session (auth, catalogue data, Anthropic API call) — not exercisable via static analysis in this environment."
  - test: "Attempt a guest download on a sent Selects (no login), then repeat as a signed-in Client Partner account; also test with download_enabled=false and with a track longer than a configured download_max_seconds."
    expected: "A guest sees the account-gate modal and never receives a file; a signed-in Client Partner receives a watermarked file; download_enabled=false refuses the download; an over-cap track is refused (fails closed, not trimmed)."
    why_human: "Requires a live authenticated session and real storage artifacts; the code path is verified by static/data-flow review (never imports the master bucket) but the actual gate/file behavior needs a live run."
gaps:
  - truth: "The stream-preview carries the D-01 audible tag (soft sub-audible tonal pulse) so a 30s+ evaluative listen stays meaningful — for every track, not just WAV-sourced ones."
    status: partial
    reason: "lib/watermark/stream-preview.ts's injectTonalPulse only mixes the tone into raw 16-bit PCM WAV audio (PCM_EXTENSIONS = {'wav'}). A compressed-source track (mp3/aac/flac/ogg/webm) is copied through to the previews bucket byte-for-byte, untagged — no codec/DSP package is installed (correctly gated behind the Package Legitimacy Gate per 31-01's approach lock, which covers WAV tone-injection only). Per 31-12's own SUMMARY, the vault's default playable role is the 'share' file, which is typically MP3 — so this is very plausibly the common case in production, not an edge case. The 'never serve a clean master' guarantee (the hard R12 prohibition) still holds structurally for every format — this gap is scoped narrowly to the audible-tag CONTENT-PROTECTION value of D-01, not to master-leak risk."
    artifacts:
      - path: "lib/watermark/stream-preview.ts"
        issue: "PCM_EXTENSIONS = new Set(['wav']); injectTonalPulse() returns the source bytes unmodified for any other extension (lines 49, 184-187)."
    missing:
      - "A decision (owner) on whether to accept MP3/AAC pass-through previews for now, or bring a vetted audio-codec/watermarking package through the Package Legitimacy Gate so the tonal pulse also applies to compressed sources — tracked as the plan's own documented fast-follow, not newly discovered here."
deferred: []
---

# Phase 31: AE Client Workspace + Selects (My Client Partners / Client Partners) — Slice 1 Verification Report

**Phase Goal:** Build the outbound Selects motion (Slice 1) as working rooms — My Client Partners (own-book CRM record + contacts + relationship log + status), the Selects motion (build from scratch / AI-drafted / off a brief → shareable /selects/[token] player link with watermarked previews + notes → client reacts/approves/requests-changes → deal), Crate Requests demand inbox (absorbs the Lead Engine), and the content-protection watermark layer (never a clean master).

**Requirement scope (local IDs, 31-SPEC.md):** R1, R2, R5, R10, R11, R12 (+ D-01, D-02, D-03, D-05, D-08, D-09, D-11, D-12, D-13).

**Verified:** 2026-08-16T04:01:01Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | My Client Partners lands on a Clients/Companies tab list; a row drills into the matching person/company workspace (R1) | VERIFIED | `components/admin/ClientPartnersList.tsx` (tabs + drill-in href builder), `lib/client-partners/columns.ts` (12/10 column defs, identity pinned), rebuilt `app/(admin)/admin/my-client-partners/page.tsx` reads own-book org+contact rows. `npx jest lib/client-partners/columns.test.ts` passes. |
| 2 | Company workspace shows the four jobs (Contacts/Activity/Curation·Selects/Notes+status) + website; person workspace mirrors it, person-scoped (R1) | VERIFIED | `components/admin/ClientWorkspace.tsx` implements all four job tabs; `components/admin/ContactsPanel.tsx` + `PersonContactPanel`; both `app/(admin)/admin/client-partners/[orgId]/page.tsx` and the new `app/(admin)/admin/clients/[personId]/page.tsx` render it, both resolving to the same underlying `buyer_org_contacts` row (R1 adjacency). |
| 3 | Insight columns show/hide, drag-reorder (@dnd-kit), click-sort, persist per-AE, identity pinned (R2) | VERIFIED | `lib/client-partners/columns.ts` (`sortRows` stable-tiebreak, `DEFAULT_SORT`), `@dnd-kit/sortable` imported and used in `ClientPartnersList.tsx`. `columns.test.ts` proves shuffle-invariant stable sort. Cookie persistence code present (not runtime-exercised — see human_verification). |
| 4 | An AE sees only their own book; "Client Partners"/leadership tower hidden for AE; unassigned account never in an AE's list (R5) | VERIFIED | `requireStaff` + `isAssignedToOrg`/`isOrgInAeScope`/`canAccessOrgContacts` wired on every Slice-1 route (grep-confirmed across selects, client-partners/contacts, crate-requests routes) — all return 404, never 403, on scope denial. `app/(admin)/layout.tsx` gates `/admin/buyer-orgs` (Client Partners tower) behind `isLeadership`. |
| 5 | Crate Requests ranks buyer activity by intent (brief > repeat_search > selects_reopen > tag_browse); a guest signal renders as a visible "new lead" row, never dropped (R10) | VERIFIED | `lib/crate-requests/ranking.ts` — pure, I/O-free `rankCrateRequests`, 14 passing tests incl. a shuffle-invariant stability case and a guest-new-lead case. `components/admin/CrateRequestsFeed.tsx` renders Hot/Warm/New-lead chips + one dominant action per row. `/admin/lead-engine` now redirects to `/admin/crate-requests` (grep-confirmed `redirect(...)`). |
| 6 | An AE can build a Selects (add/remove Crate tracks, per-track + cover notes, three build methods incl. AI-draft), rights-ready badges shown; an empty Selects cannot be sent; adding an existing track is idempotent (R11) | VERIFIED | `lib/selects/persistence.ts` (`addSelectsTrack` idempotent, `removeSelectsTrack` soft), `app/api/admin/selects/[id]/send/route.ts` (empty-guard + `isLegalSelectsTransition`), `lib/selects/ai-draft.ts` (rights-ready-first via `isRightsReady`, never hard-filtered). `components/admin/SelectsBuilder.tsx` wires all of it. 33 unit tests green across `lib/selects/persistence.test.ts` + the send-route test. |
| 7 | Send mints/keeps the share_token and produces a shareable /selects/{token} link (R11) | VERIFIED | `app/api/admin/selects/[id]/send/route.ts` returns `/selects/{share_token}`; `supabase/migrations/111_selects.sql` defines `share_token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16),'hex')` (cryptographically random, no id enumeration). |
| 8 | Selects drafts auto-save continuously with a manual save also available; a Crate search can be saved and re-applied, and shared with the team (R11) | VERIFIED | `components/admin/SelectsBuilder.tsx` implements debounced auto-save + manual flush (code-inspected); `app/api/admin/selects/saved-searches/route.ts` (GET returns own + all team-shared, POST creates private, PATCH flips `is_team_shared` only for the owner). Not runtime-exercised (browser round-trip) — see human_verification. |
| 9 | Opening a valid `/selects/[token]` link (no login) plays watermarked previews only, records reactions, offers Approve/Request changes; an invalid/expired token shows a safe leaks-nothing state; no id-enumerable path exists (R12) | VERIFIED (structurally) | `app/selects/[token]/page.tsx` resolves ONLY via `resolveSelectsByToken` (share_token, service-role, fails closed on draft/missing token → `InvalidLinkState` renders zero data fields). `components/selects-player/SelectsPlayer.tsx` sources audio only via `getPreviewSignedUrl`. `app/api/selects/[token]/respond/route.ts` gates the status move via `isLegalSelectsTransition`. Audio playback / visual fidelity is a human check (see human_verification). |
| 10 | Clean master audio is never served, by stream or download; a client can download a watermarked file (never a master) from the player (R12) | VERIFIED (structurally) | `lib/watermark/signed-url.ts` + `app/api/selects/[token]/download/route.ts` import ONLY the watermark-pipeline's public output accessors (`PREVIEWS_BUCKET`, `findExistingPreview`, `renderPreviewIfAbsent`, `renderForensicDownload`) — neither imports `readMasterAudio` or references the `track-audio` master bucket name anywhere. `lib/watermark/signed-url.test.ts` (4 tests) proves the never-master guarantee for the stream path. Download is account-gated (guest → `'gate'`, never a file) and D-02 length-cap fails closed. |

**Score:** 10/10 truths verified · 0 present-but-behavior-unverified · 1 partial gap noted below (D-01 audible-tag coverage) that does not invalidate any of the 10 truths above but is tracked as a gap against 31-12's own must-have.

### Deferred Items (out of Slice-1 scope, explicitly deferred to Phase 31.1)

Per `31-SPEC.md`'s locked slice split (D-04), the following requirements are NOT in this phase's scope and are correctly absent: R3 (relationship health computation), R4 (health-rules config), R6/R7 (leadership tower assign/route), R8 (assignment email), R9 (The Playbook), R13 (per-track engagement telemetry), R14 (Game Plan). Each is either explicitly marked in-code with an A1/D-10/31.1 comment (e.g. `lib/client-partners/columns.ts`'s Health column renders a neutral "unknown" placeholder, never a fabricated green) or has a marked-but-empty mount slot (`ClientWorkspace.tsx`'s `data-slot="game-plan-31-1"`).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/watermark/provider.ts` + `README.md` | WatermarkProvider contract + owner-locked approach | VERIFIED | Both exist; owner-locked 2026-08-16 per README. |
| `supabase/migrations/111_selects.sql`, `112_client_partners_crm.sql` | Selects + CRM-lite schema | VERIFIED | Both exist, text-tests pass, LOCAL=REMOTE confirmed per 31-02-SUMMARY.md (owner push 2026-08-16). |
| `supabase/migrations/113_selects_changes_reason.sql` | Additive `changes_requested_reason` column | VERIFIED (drafted, unpushed) | Confirmed non-blocking per task context — respond route writes it via an isolated best-effort UPDATE; the public read path deliberately excludes it from its SELECT list so an unpushed 113 cannot break the player. |
| `lib/selects/{types,stage-machine,persistence,ai-draft,public-resolve,viewer-cookie,tracks-query}.ts` | Selects domain logic | VERIFIED | All exist; `npx jest lib/selects` → 8 suites / all green (see automated checks below). |
| `app/api/admin/selects/**`, `app/api/admin/client-partners/**`, `app/api/admin/crate-requests/**` | Slice-1 admin API surface | VERIFIED | All routes exist, own-book-scoped, `npx tsc --noEmit` clean. |
| `components/admin/{ClientPartnersList,ClientWorkspace,ContactsPanel,SelectsBuilder,CrateRequestsFeed}.tsx` | Slice-1 admin UI | VERIFIED | All exist, wired to live routes (no hardcoded/placeholder data per each plan's "Known Stubs" sections). |
| `app/selects/[token]/**`, `components/selects-player/**` | Public player | VERIFIED | All exist; token-only resolution confirmed; watermark-only audio confirmed by data-flow review. |
| `lib/watermark/{stream-preview,signed-url}.ts` | Watermark render + accessor | VERIFIED with a noted gap | Never-master guarantee VERIFIED by test; D-01 audible-tag coverage is WAV-only (see Gaps). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `SelectsBuilder.tsx` | `app/api/admin/selects/**` | fetch/PATCH/POST | WIRED | No direct client DB writes; every mutation goes through the 31-04/31-05 own-book routes. |
| `app/api/admin/selects/[id]/send/route.ts` | `app/selects/[token]/page.tsx` | `share_token` | WIRED | Send mints/uses the token; the public page resolves solely by that token, no id fallback. |
| `components/selects-player/SelectsPlayer.tsx` | `lib/watermark/signed-url.ts` | `getPreviewSignedUrl` | WIRED | Confirmed via grep; page.tsx pre-resolves all previews server-side and passes them as props (player itself makes no direct accessor call, which is a stricter form of the same contract). |
| `app/api/admin/crate-requests/route.ts` | `components/admin/CrateRequestsFeed.tsx` | self-fetch of the own-book route | WIRED | Feed component fetches the route directly; no parallel/duplicated read-side logic. |
| `CrateRequestsFeed.tsx` "Build Selects" | `components/admin/NewSelectsForm.tsx` | `?orgId=&briefId=` deep link | WIRED | `NewSelectsForm`'s `open` state defaults to `Boolean(defaultOrgId)` (31-11's Rule-1 fix) — confirmed the form opens pre-filled, not collapsed behind an extra click. |
| `app/(admin)/admin/my-client-partners/page.tsx` | `components/admin/ClientPartnersList.tsx` → workspace pages | drill-in href | WIRED | Page renders the shared list component; row hrefs point at the rebuilt `[orgId]`/`[personId]` workspace pages. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ClientPartnersList.tsx` rows | org/contact rows | `app/(admin)/admin/my-client-partners/page.tsx` server fetch (own-book Supabase query) | Yes | FLOWING |
| `CrateRequestsFeed.tsx` | ranked activity items | `GET /api/admin/crate-requests` → `rankCrateRequests` over live `buyer_briefs`/`selects`/`selects_reactions` | Yes | FLOWING |
| `SelectsBuilder.tsx` tracklist | `selects_tracks` rows + `rights_ready` | `GET /api/admin/selects/[id]/tracks` → `lib/selects/tracks-query.ts` → `isRightsReady` | Yes | FLOWING |
| `SelectsPlayer.tsx` tracks/preview | `PlayerTrack[]` | `app/selects/[token]/page.tsx`'s `resolvePlayerData` (service-role reads + `getPreviewSignedUrl`) | Yes | FLOWING |
| Health column (`ClientPartnersList.tsx`) | `resolveHealth()` | No live source in Slice 1 (R3 is 31.1) | N/A (intentional) | Renders the documented "unknown" placeholder, never a fabricated "good" — not a stub, an explicit Slice-1 boundary. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Selects status legality | `npx jest lib/selects/stage-machine.test.ts` | 12/12 pass | PASS |
| Crate Requests ranking (incl. shuffle-stability + guest-lead backstops) | `npx jest lib/crate-requests/ranking.test.ts` | 14/14 pass | PASS |
| Column pinned-identity + stable sort (R2 backstop) | `npx jest lib/client-partners/columns.test.ts` | pass | PASS |
| Watermark never-master guarantee | `npx jest lib/watermark/signed-url.test.ts` | 4/4 pass | PASS |
| Contacts one-primary invariant + scope predicate | `npx jest lib/client-partners/contacts.test.ts` | pass | PASS |
| Selects persistence (idempotent add, allowlist, own-book scope) | `npx jest lib/selects/persistence.test.ts app/api/admin/selects/[id]/send/route.test.ts` | pass | PASS |
| Migration text-tests (111/112) | `npx jest __tests__/migration-111.test.ts __tests__/migration-112.test.ts` | pass | PASS |
| Full workspace test suite (run once) | `npx jest` | 195 suites / 2280 tests pass | PASS |
| TypeScript type gate (with pre-existing Phase 32 exclusions) | `rm -rf .next && npx tsc --noEmit` | clean, 0 errors | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist in this repo and none are declared by any Phase 31 PLAN/SUMMARY — Step 7c: SKIPPED (no probes declared or found).

### Requirements Coverage (local 31-SPEC.md IDs)

*Note: R1–R14/D-01–D-13 are a phase-local numbering scheme defined in `31-SPEC.md`, not mapped into the global `.planning/REQUIREMENTS.md` (R5/R11 collide there with unrelated Phase 19 IDs). Per task instructions, coverage below is verified against the codebase directly; ID reconciliation into the global tracker is a documentation follow-up, not a phase gap.*

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| R1 | 31-02, 31-06, 31-08, 31-09 | My Client Partners list + person/company workspace | SATISFIED | Truths #1–2 above |
| R2 | 31-08 | Insight columns, show/hide/reorder/sort, per-AE persistence | SATISFIED | Truth #3 |
| R5 | 31-04, 31-05, 31-06, 31-07, 31-08, 31-09, 31-10, 31-11, 31-13 | Role-aware own-book scoping | SATISFIED | Truth #4, confirmed on every Slice-1 route |
| R10 | 31-07, 31-11 | Crate Requests intent-ranked demand inbox | SATISFIED | Truth #5 |
| R11 | 31-02, 31-03, 31-04, 31-05, 31-10 | Selects builder (curate/notes/AI-draft/saved-search/send) | SATISFIED | Truths #6–8 |
| R12 | 31-01, 31-02, 31-12, 31-13 | Shareable player, watermark-only, content protection | SATISFIED, with a noted D-01 sub-gap | Truths #9–10; Gap: D-01 audible tag is WAV-only |
| D-01 | 31-01, 31-12 | Layered watermark (audible preview tag) | PARTIAL | Gap in frontmatter — WAV only, MP3/compressed pass-through untagged |
| D-02 | 31-02, 31-04, 31-13 | Download disable/length-cap | SATISFIED | `download_enabled`/`download_max_seconds` wired end-to-end, fails closed on cap |
| D-03 | 31-01, 31-12, 31-13 | Per-share forensic download | DEFERRED (A2 fast-follow, plan-sanctioned) | `renderForensicDownload` stubbed `'pending'`; download route falls through to the interim watermarked stream-preview render, never a master — explicitly sequenced as a fast-follow in 31-01/31-12, not a gap |
| D-05, D-08, D-09 | 31-02, 31-06, 31-09 | CRM-lite contacts (multi, one-primary, rich record) | SATISFIED | `buyer_org_contacts` schema + API + UI, one-primary invariant tested |
| D-11 | 31-05, 31-10 | AI-drafts, AE curates (rights-ready-first, not hard-filtered) | SATISFIED | `orderCandidatesRightsReadyFirst` never drops near-ready tracks |
| D-12 | 31-05, 31-10 | Saved/team-shared Crate searches | SATISFIED | Route + UI recall/share wired |
| D-13 | 31-13 | Player built to the locked Family B reference | SATISFIED (structurally) | `theme.ts` + `SelectsPlayer.tsx` implement the locked component set (three-circle app bar, Glow Up toggle, dense list, mini-player, ••• sheet) — visual fidelity is a human check |

**Orphaned requirements:** None found — every R/D id referenced in a plan's `requirements:` frontmatter traces to a locked `31-SPEC.md` requirement, and no `31-SPEC.md` requirement in this phase's declared scope (R1/R2/R5/R10/R11/R12 + the D-ids) is missing a plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/watermark/stream-preview.ts` | 49, 184-187 | Compressed-source pass-through (no tone injection for non-WAV) | ⚠️ Warning | Documented gap — see Gaps section; does not weaken the never-master guarantee |
| `app/(admin)/layout.tsx` | 113 & 125 | Duplicate `<Link href="/admin/selects">Selects</Link>` nav entry (added independently by 31-08 and 31-10, a parallel-wave merge collision neither plan's own self-check could see) | ℹ️ Info | Cosmetic only — both links go to the same working page; not a functional defect, but a real, verifiable rendering duplication worth a one-line cleanup |
| `app/(admin)/layout.tsx` | 103 & 110 | Stale `"Lead Engine"` nav link alongside the new `"Crate Requests"` link (the former now just redirects to the latter) | ℹ️ Info | Self-disclosed in 31-11-SUMMARY.md as an explicitly out-of-scope item ("do not touch layout.tsx here" was 31-11's own instruction) — not a defect, a known planned follow-up |
| — | — | No `TBD`/`FIXME`/`XXX`/unresolved `TODO` markers found in any file touched by this phase's 13 plans | — | Debt-marker gate: clean |

No blocker-severity anti-patterns found. No unreferenced debt markers found.

## Human Verification Required

See the `human_verification` list in the frontmatter above — four items, all requiring a live browser session against a real Supabase environment (this project has no browser/UI test harness per CLAUDE.md, and no live DB in the verification sandbox):

1. **Public player playback + interaction** — audio, the audible watermark tag, reactions, approve/request-changes, and the invalid-token safe state.
2. **Own-book navigation + column persistence** — AE vs. leadership session, drag-reorder, cookie-restore-on-reload.
3. **End-to-end Selects curate-and-send flow** — idempotent add, auto-save, AI-draft, saved-search recall/share, Send.
4. **Download gate branches** — guest gate, signed-in Client Partner watermarked file, disabled, and over-cap paths.

## Gaps Summary

One partial gap was found and is tracked in frontmatter: **the D-01 audible watermark tag only applies to WAV-sourced tracks.** `lib/watermark/stream-preview.ts`'s `injectTonalPulse` performs real PCM tone-pulse mixing only for the `wav` extension; every other source format (mp3/aac/flac/ogg/webm — very plausibly the common case, since the vault's default playable "share" role is typically MP3, per 31-12's own SUMMARY) is copied through to the previews bucket byte-for-byte, untagged. This is honestly self-disclosed by the executor in 31-12-SUMMARY.md's "Known Stubs" section, reasoned (no codec/DSP package is installed, correctly gated behind the Package Legitimacy Gate that only covers the in-house WAV approach), and does **not** weaken the phase's hard prohibition ("never serve a clean master") — that guarantee is proven true for every source format by `lib/watermark/signed-url.test.ts`. It narrows only the content-protection VALUE of the tag itself (an untagged preview is harder to trace if leaked). This is worth an explicit owner decision (accept MP3 pass-through for now vs. bring a vetted codec package through the Package Legitimacy Gate) before this ships broadly, but it does not block the phase goal — the outbound Selects motion (send → open → play → react → approve/request-changes → download-gated) is otherwise fully wired end-to-end.

All other artifacts, key links, and behavioral tests pass. Everything flagged for human verification is a runtime/visual check this sandbox cannot execute (no browser harness, no live DB) — not a suspected defect.

---

*Verified: 2026-08-16T04:01:01Z*
*Verifier: Claude (gsd-verifier)*
