---
phase: 07
slug: social-campaign-planner
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-03
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → social_campaigns row | Authenticated artist requests reach the table; RLS + denormalized user_id is the owner gate | Campaign rows (owner-scoped) |
| Postgres concurrency → is_active invariant | Concurrent "set active" requests could both flip is_active on | is_active boolean |
| client → campaigns/slots/generate/export API | /api is excluded from middleware, so each route is its own auth boundary | slotId/campaignId params, request bodies |
| slotId/campaignId param → posts[] mutation | Caller-supplied ids could reference another user's campaign (IDOR) | posts JSONB |
| user release data → AI prompt | Free-text release title/notes/collaborator names interpolated into the calendar prompt (prompt-injection surface) | Untrusted free text |
| AI output → posts JSONB | Model JSON is untrusted input validated before storage | Generated slots |
| slot caption free text → CSV cell | Artist-authored caption flows into a downloadable CSV | Caption strings |
| server page → social_campaigns read | Page reads active campaign with user-scoped client; RLS gates it | Campaign rows |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-07-01 | Elevation of Privilege | social_campaigns RLS | high | mitigate | `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` — migration 033 | closed |
| T-07-02 | Tampering | is_active partial unique index | high | mitigate | `CREATE UNIQUE INDEX ... ON social_campaigns (project_id) WHERE is_active` — migration 033 | closed |
| T-07-03 | Tampering | readPosts() enum validation | medium | mitigate | readPosts() validates platform/content_type against *_VALUES on every read — lib/launchpad/campaigns.ts:74 | closed |
| T-07-04 | Tampering (prompt injection) | buildCalendarPrompt | medium | mitigate | User release data isolated in `<release_data>` block; platform rules in non-user text — lib/tools/registry.ts:409 | closed |
| T-07-05 | Tampering | readCalendarPosts → readPosts | medium | mitigate | AI output routed through readPosts() enum/range validation before storage | closed |
| T-07-06 | Information Disclosure | model constant | low | mitigate | No dead `claude-sonnet-4-20250514` constant / `@/lib/anthropic` import in launchpad routes — grep clean | closed |
| T-07-07 | Elevation of Privilege (IDOR) | slots/[slotId] PATCH | high | mitigate | Parent campaign loaded `.eq('id', campaignId).eq('user_id', user.id)` + 404 before posts access — slots/[slotId]/route.ts:35 | closed |
| T-07-08 | Tampering | posts array overwrite | high | mitigate | sanitizeSlotEdit allowlist applied; full posts re-saved server-side, client array never accepted — route.ts:81 | closed |
| T-07-09 | Spoofing | missing per-route auth | high | mitigate | Every handler calls `auth.getUser()` + 401 — no middleware reliance | closed |
| T-07-10 | Tampering | concurrent set-active | high | mitigate | Flip-old-off (`.eq('user_id').eq('is_active',true)`) then set-new, layered on migration 033 partial unique index | closed |
| T-07-11 | Tampering | AI output corrupting posts | medium | mitigate | POST routes model output through readCalendarPosts()→readPosts() before insert | closed |
| T-07-12 | Elevation of Privilege (IDOR) | generate + export routes | high | mitigate | Both load campaign `.eq('user_id', user.id)` + 404 before reading posts | closed |
| T-07-13 | Spoofing | missing per-route auth | high | mitigate | Both handlers call `auth.getUser()` + 401 | closed |
| T-07-14 | Tampering (CSV structure injection) | export csvCell | low | mitigate | csvCell quote/comma/newline escaper reused verbatim, applied via `.map(csvCell)` — export/route.ts:14 | closed |
| T-07-15 | Tampering (spreadsheet formula injection) | export caption cells | low | accept | Captions artist-authored (self-harm only); CSV targets Buffer not Excel — documented accepted risk | closed |
| T-07-16 | Information Disclosure | export cover_art_url in CSV | low | accept | Own already-signed cover_art_url exported by owning artist for own Buffer — no cross-tenant exposure | closed |
| T-07-17 | Tampering (client-trust) | CampaignCalendar PATCH bodies | medium | mitigate | Client sends single-field edits; server re-validates via sanitizeSlotEdit + re-derives ownership | closed |
| T-07-18 | Repudiation (stale UI) | optimistic update rollback | low | mitigate | On PATCH failure component re-fetches authoritative server state (refetchCampaign) — CampaignCalendar.tsx:98 | closed |
| T-07-19 | Elevation of Privilege | page active-campaign fetch | high | mitigate | Page reads social_campaigns via `createServerClient()` with explicit `.eq('user_id', user.id)` — never createServiceClient — page.tsx:114 | closed |
| T-07-20 | Tampering | history-list delete/set-active | high | mitigate | Actions hit 07-03 routes; ownership re-derived + active-cannot-be-deleted enforced server-side (route.ts:355) | closed |
| T-07-21 | Repudiation | silent overwrite via panels | medium | mitigate | SlotGeneratePanel/SaveToCalendarPicker write only on explicit "Use this"/"Save" — generation never mutates (D-10/D-11) | closed |
| T-07-SC | Tampering | npm/pip/cargo installs | low | accept | Zero new packages this phase (RESEARCH.md Package Legitimacy Audit) — nothing to verify | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | T-07-15 | Spreadsheet formula injection: captions are artist-authored (self-harm only); CSV targets Buffer, not Excel | PeteyFranchise | 2026-07-03 |
| AR-07-02 | T-07-16 | cover_art_url in CSV is the project's own already-signed URL, exported by the owning artist for their own Buffer account | PeteyFranchise | 2026-07-03 |
| AR-07-03 | T-07-SC | Zero new package installs this phase (RESEARCH.md audit) — no supply-chain surface introduced | PeteyFranchise | 2026-07-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-03 | 21 | 21 | 0 | gsd-secure-phase (L1 grep-depth, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-03
