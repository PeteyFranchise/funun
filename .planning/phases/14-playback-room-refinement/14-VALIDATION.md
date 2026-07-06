---
phase: 14
slug: playback-room-refinement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-06
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test runner in this repo (`package.json` has no devDependency test framework, no `tests/`/`__tests__/` dirs). This phase is UI/API additive work (uploads, Export Pack route, PDF templates) plus one storage-bucket-config migration (D-07/Pitfall 4: `file_size_limit`, `allowed_mime_types`); verification is manual click-through + a dry-run push for the migration, not an automated suite. |
| **Config file** | none — see Wave 0 Requirements below |
| **Quick run command** | `npx supabase db push --dry-run` (validates the bucket-config migration SQL parses/applies cleanly before touching the live project) |
| **Full suite command** | Manual click-through + the two deployment-dependent tests below (Per-Task Verification Map: HOBBY-1, HOBBY-2), run against a real Vercel deployment, not local `next dev` |
| **Estimated runtime** | ~10s (dry-run) / ~15 min (full manual pass, including a real deployment upload + Export Pack generation) |

---

## Sampling Rate

- **After every task commit:** Run `npx supabase db push --dry-run` for the bucket-config migration task; manual smoke check for UI/API tasks
- **After every plan wave:** Run the manual verification rows relevant to that wave's decisions (table below)
- **Before `/gsd-verify-work`:** Full manual pass must be green, AND both HOBBY-1 and HOBBY-2 must be verified against a real deployment — these two are the confirmed Hobby-tier (10s `maxDuration`, 4.5MB body limit) risks that local dev cannot surface at all (see `14-RESEARCH.md` Pitfall 1 and Pitfall 3)
- **Max feedback latency:** ~10s per task (dry-run) for the migration task; manual for everything else

---

## Per-Task Verification Map

Phase 14 carries no mapped `REQUIREMENTS.md` ID (existing Wave 1 Sound Vault feature, orthogonal to the v1.2 Green Room requirements — see `14-CONTEXT.md` Phase Boundary). Verification instead maps to `14-CONTEXT.md`'s locked decisions (D-01 through D-14) plus two deployment-dependent checks discovered during research (HOBBY-1, HOBBY-2). The planner should attach the relevant D-ID(s) below to each plan's `must_haves` and reference the matching `<threat_model>` T-14-xx ID once assigned.

| ID | Behavior | Verification | Automated? | File Exists? | Status |
|----|----------|---------------|------------|--------------|--------|
| D-01 | Sound Vault project card links to the playback room (`/vault/[id]/play`), not the management page (`/vault/[id]`) | Click a project card from `/vault` → confirm landing page is the playback room | Manual | ❌ Wave 0 | ⬜ pending |
| D-02 | Readiness-score widget appears in 2 places (topbar chip + inline near tracklist/files column) and links to the management page | Visit playback room → confirm both widget instances render the correct score and link to `/vault/[id]` | Manual | ❌ Wave 0 | ⬜ pending |
| D-03/D-07 | Stems ZIP upload succeeds via direct-to-storage up to 250MB; rejected above it | Attempt an upload near/at/over 250MB — see HOBBY-1 (this specific check requires a real deployment, not local dev) | Manual, deployment-dependent | ❌ Wave 0 | ⬜ pending |
| D-04/D-06 | Master/Instrumental toggle actually swaps `<audio src>`; "Download stems" is a separate button from the toggle | Upload an instrumental → confirm toggle appears and swaps playback source; upload stems → confirm "Download stems" appears and downloads the ZIP | Manual | ❌ Wave 0 | ⬜ pending |
| D-05 | Upload from either entry point (playback room or management page) writes to the same canonical track record | Upload stems from the playback room → confirm visible/consistent from the management page's upload UI, and vice versa | Manual | ❌ Wave 0 | ⬜ pending |
| D-08 | Empty-state hiding: no instrumental uploaded → toggle hidden (Master-only); no stems uploaded → "Download stems" hidden entirely (never a disabled/grayed control) | On a project with neither uploaded, confirm neither affordance renders at all | Manual | ❌ Wave 0 | ⬜ pending |
| D-09 | Info (ⓘ) copy near the stems upload control explains what stems are, why to store them, and how to zip/label them | Visual confirmation the info affordance exists and its copy covers all four points | Manual | ❌ Wave 0 | ⬜ pending |
| D-10 | Export Pack ZIP contains every available artifact: master WAV, share MP3, stems ZIP, instrumental, credits/splits PDF, metadata PDF | Generate a pack on a fully-populated project → unzip → confirm all present artifacts appear and each opens/renders correctly with real data (not placeholder/blank PDFs) | Manual | ❌ Wave 0 | ⬜ pending |
| D-11 | Artist can choose immediate download OR a shareable link, each time | Exercise both delivery buttons once each → confirm download triggers and link is copyable/functional | Manual | ❌ Wave 0 | ⬜ pending |
| D-12 | Shareable link expires (~7 days) with no manual revocation needed | Confirm `createSignedUrl` is called with the intended TTL in seconds (`60*60*24*7`, not ms or another unit — see RESEARCH.md Security Domain); optionally force a short TTL in a scratch script to confirm the URL 403s after expiry | Manual + optional scripted signed-URL expiry check | ❌ Wave 0 | ⬜ pending |
| D-14 | No visual regression — existing 3-column layout preserved, matches `playback.html` reference | Visual comparison against `docs/design/wave-4-social-layer/playback.html` and a pre-phase screenshot | Manual | ❌ Wave 0 | ⬜ pending |
| HOBBY-1 | Stems upload over 4.5MB succeeds against a REAL deployment (validates the direct-to-storage path actually bypasses Vercel's body-size limit) | Upload a >4.5MB (ideally near-250MB) file on the deployed (non-local) app → confirm success, no `413` | Manual, deployment-dependent | ❌ Wave 0 — local `next dev` cannot surface this at all | ⬜ pending |
| HOBBY-2 | Export Pack assembly (fetch sources + render 2 PDFs + zip + upload to Storage) completes within the confirmed Hobby-tier 10s `maxDuration` for realistic/near-worst-case bundle sizes | Generate a pack on a project with a near-250MB stems ZIP + master + instrumental on the deployed app → confirm the request completes without a function timeout | Manual, deployment-dependent | ❌ Wave 0 — local `next dev` has no function-duration limit and will not surface a Hobby-tier timeout | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] No automated test harness exists in this repo (project-wide convention, not specific to Phase 14) — a full test suite is NOT required to build from scratch for this phase alone; manual verification matches how prior phases (e.g. Phase 8) shipped.
- [ ] `npx supabase db push --dry-run` validates the bucket-config migration (D-07/Pitfall 4: `file_size_limit` → 250MB, `allowed_mime_types` += `application/zip`, `application/x-zip-compressed`) before it's pushed live.
- [ ] **HOBBY-1 and HOBBY-2 cannot be verified in local dev at all** — both require a real Vercel deployment (confirmed Hobby tier: 4.5MB body limit, 10s `maxDuration`, neither enforced by `next dev`). These are the single most important Wave 0 gap for this phase; do not mark the phase verified on the strength of local testing alone.

*Existing infrastructure (manual click-through + `supabase db push --dry-run`) covers all phase requirements given this project's no-test-framework convention; the two HOBBY items above are deployment-verification gaps, not missing test code.*

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|--------------------|
| Direct-to-storage stems/instrumental upload actually bypasses the 4.5MB Vercel body-size ceiling | D-07 / HOBBY-1 | Requires a real deployed environment; no test framework | On the deployed app (not `next dev`), upload a stems ZIP over 4.5MB (ideally near 250MB) → confirm success, no `413 FUNCTION_PAYLOAD_TOO_LARGE` |
| Export Pack assembly completes inside the confirmed Hobby-tier 10s `maxDuration` for a realistic large bundle | D-10/D-11 / HOBBY-2 | Requires a real deployed environment with realistic file sizes; no test framework, no function-duration limit locally | On the deployed app, generate an Export Pack for a project with a near-250MB stems ZIP + master + instrumental → confirm the request completes without timing out |
| Export Pack route and new stems/instrumental metadata routes reject non-owners | D-05/D-10, ASVS V4 (RESEARCH.md Security Domain) | Requires two distinct authenticated sessions; no test framework | As User B, attempt to call the Export Pack route or a stems/instrumental metadata PATCH for a project owned by User A → expect a 403/404, never the owner's data |
| Shareable export link actually stops working after its TTL, not before or indefinitely | D-12 | Requires either waiting out a real 7-day window or a scratch script with a shortened TTL; no test framework | Generate a signed URL with a short TTL (e.g. 5s) in a throwaway script against the same bucket/path pattern → confirm the URL 403s once the TTL elapses |
| Empty-state hiding never shows a disabled/dead-end control | D-08 | Visual/UX judgment call, not a scriptable assertion | On a project with no instrumental and no stems uploaded, confirm the Master/Instrumental toggle and "Download stems" button are both entirely absent (not present-but-disabled) |

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify (dry-run push, for the migration task) or an explicit Wave 0 / manual-only entry above
- [ ] Sampling continuity: no 3 consecutive tasks without at least a dry-run push verify or a manual-only entry
- [ ] Wave 0 covers both the migration dry-run gap and the two HOBBY deployment-verification gaps identified above
- [ ] No watch-mode flags (N/A — no test framework)
- [ ] Feedback latency < 10s per task (dry-run); manual pass < 15 min per wave, including the two deployment-dependent checks before phase close
- [ ] `nyquist_compliant: true` set in frontmatter once the planner confirms every task in every PLAN.md maps to a row in this table or an explicit manual-only entry

**Approval:** pending
