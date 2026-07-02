---
phase: 06
slug: playlist-curator-pitching
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-02
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| supply chain → repo | New npm dependency (`svix`) enters the build via package-lock.json | dependency code |
| new auth account type → existing artist-only DB triggers | Curator magic-link signups cross the `on_auth_user_created` trigger designed for artists | auth.users row, app_metadata |
| client → curators table (RLS) | Authenticated artists read the directory; claimed curators self-edit their own row | curator profile fields |
| admin browser → admin curator API | Directory mutations must re-verify admin authority per route | curator CRUD payloads |
| Vercel Cron / public internet → cron route | The cron path is publicly reachable; only CRON_SECRET distinguishes Vercel from an attacker | reach-signal refresh trigger |
| external APIs (Spotify/YouTube) → curators table | Untrusted third-party responses written into reach_signal | follower/subscriber counts |
| authenticated artist → curators directory read | Artist browses the shared directory; must not receive secret columns (claim_token) or PII beyond browse needs | curator directory rows |
| searchParams (untrusted) → curators query | genre/platform filter values arrive from the URL and flow into a DB query | filter strings |
| composer client → /api/pitches | The client's Send-button disabled state is untrusted; note length + selection re-validated server-side | pitch note text, curator selection |
| artist → another artist's project/track | Send must only pitch tracks the caller owns | project/track ownership |
| artist → curator directory (send target) | do_not_pitch / bounced / duplicate curators must be blocked at the send boundary | pitch eligibility |
| public claim link → auth account creation | An unauthenticated token holder triggers creation of a Supabase auth account — account type/privileges must be locked to 'curator' | claim_token, new auth account |
| curator self-serve PATCH → curators table | A curator must edit ONLY their own row and ONLY allowlisted fields | curator profile fields |
| curator-portal routes → artist auth model | Curator routes are outside middleware.ts's artist gate; the portal layout is the sole authority | session/role check |
| public internet → /api/webhooks/resend | Anyone can POST here; only a valid svix signature distinguishes Resend from an attacker | bounce event payload |
| public token link → pitch_history / curators mutation | Unauthenticated token holders drive status transitions; the token is the sole authorization | response_token, pitch status |
| authenticated/anon PostgREST clients → curators / pitch_history columns | Row-level RLS policies do not restrict which columns a client can select/update via direct REST access | claim_token, email, response_token (secret columns) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-SC | Tampering | `npm install svix` | high | mitigate | `[SUS]`-flagged package gated behind blocking `checkpoint:human-verify`; evidence (5yr-old official-org package, ~4.88M weekly downloads) presented; user explicitly approved | closed |
| T-06-01 | Elevation of Privilege | `handle_new_user()` firing for curator signups / curator account creation via claim | high | mitigate | Early `RETURN NEW` when `raw_app_meta_data->>'role' = 'curator'` (migration 030 line 108) skips artist_profiles/subscriptions inserts; `admin.createUser({ app_metadata: { role: 'curator' } })` sets the role AT creation time (claim route), not via a post-insert UPDATE — app_metadata is service-role-only writable | closed |
| T-06-05 | Elevation of Privilege | curators self-serve UPDATE (IDOR) | high | mitigate | RLS `UPDATE USING (auth.uid() = claimed_by)` (migration 030) + defense-in-depth `.eq('claimed_by', user.id)` in `app/api/curators/[id]/route.ts` | closed |
| T-06-03 | Tampering / Repudiation | pitch_history / response tokens (generation + replay) | medium | mitigate | `response_token` UNIQUE, `crypto.randomBytes(32)` (`lib/curators/tokens.ts`); one-time-use via `status !== 'pending'` guard in accept/decline routes | closed |
| T-06-DB | Information Disclosure | RLS omission on new tables | high | mitigate | `ENABLE ROW LEVEL SECURITY` immediately after both `CREATE TABLE` statements (migration 030) | closed |
| T-06-02 | Denial of Service | `/api/cron/curator-reach` | high | mitigate | `!process.env.CRON_SECRET \|\| authHeader !== Bearer...` rejected 401 before any external fetch — fails closed when unset (WR-05 fix) | closed |
| T-06-04 | Elevation of Privilege | `/api/admin/curators*` | high | mitigate | `verifyAdmin()` called independently in both `route.ts` and `[id]/route.ts` — not layout-only | closed |
| T-06-06 | Tampering (mass assignment) | admin PATCH curator | medium | mitigate | Update object built strictly from `ADMIN_EDITABLE_FIELDS` (`lib/curators/schema.ts`); no spread of request body | closed |
| T-06-07 | Information Disclosure | external API error surfacing | low | accept | Reach fetchers (`lib/curators/reach.ts`) swallow errors and return `null`; no third-party error body reaches the client — accepted as best-effort signal | closed (accepted) |
| T-06-08 | Information Disclosure | `/api/curators` directory read | high | mitigate | Explicit `DIRECTORY_COLUMNS` projection, never `select('*')` — `claim_token`, raw `claimed_by`, `email` excluded | closed |
| T-06-09 | Tampering | genre/platform searchParam filter | low | mitigate | Platform values validated against `PLATFORM_VALUES` before `.in()`; genre passed only to parameterized `.overlaps()` | closed |
| T-06-10 | Information Disclosure | unauthenticated access to directory | medium | mitigate | Both `/api/curators` route and `/curators` page call `getUser()` and gate on session presence | closed |
| T-06-11 | Tampering | 150-word / non-empty-note gate | high | mitigate | `/api/pitches` recomputes word count and non-empty checks server-side, 400 before insert/email — client disabled-Send state never trusted | closed |
| T-06-12 | Elevation of Privilege | pitching a non-owned project/track | high | mitigate | Project loaded `.eq('user_id', user.id)`; track membership re-checked against the owned project | closed |
| T-06-13 | Tampering | duplicate / unsubscribed / bounced send | medium | mitigate | Pre-check existing pitch_history → 409; `uniq_curator_track_pitch` DB backstop maps 23505 → 409; `do_not_pitch`/`email_valid=false` curators excluded from send | closed |
| T-06-14 | Elevation of Privilege | curator-portal auth gate | high | mitigate | `(curator-portal)/layout.tsx` runs its own `getUser()` + `role==='curator'` check; deliberately absent from `middleware.ts`'s `isProtected` list (confirmed no `/portal` or `/pitch` prefix present) | closed |
| T-06-15 | Tampering / Replay | claim token guess/replay | medium | mitigate | 256-bit `crypto.randomBytes(32)` claim_token + 72h expiry (`claim_token_expires_at`) + one-time-use (`claim_token` nulled on claim, `claimed_by` guard returns 410) | closed |
| T-06-16 | Spoofing / Tampering | forged POST to `/api/webhooks/resend` | high | mitigate | Mandatory svix signature verification (`verifyResendWebhook`) against `RESEND_WEBHOOK_SECRET` BEFORE any DB write; 400 on failure, 503 when unconfigured | closed |
| T-06-17 | Tampering | unsubscribe-link abuse | low | accept | Setting `do_not_pitch=true` is non-destructive and idempotent; worst case is a self-unsubscribe of an already-pitched curator — accepted as low impact (D-20) | closed (accepted) |
| T-06-18 | Information Disclosure | webhook error / event body surfacing | low | mitigate | Route returns only `{ ok }` / minimal status codes; raw Resend event body never echoed to the caller | closed |
| T-06-CR (post-review) | Information Disclosure | column-level privilege gap on `curators`/`pitch_history` via direct PostgREST access | critical | mitigate | Found during `/gsd-code-review` (CR-02/CR-03): RLS row policies did not restrict columns, allowing any authenticated client to read `claim_token`/`email`/`response_token` directly via REST. Fixed in migration `031_curators_column_privileges.sql` (REVOKE blanket SELECT/UPDATE, re-GRANT only allowlisted columns); pushed to live DB and confirmed by user during UAT | closed |
| T-06-CR2 (post-review) | Tampering | unescaped artist-controlled content in pitch emails | critical | mitigate | Found during `/gsd-code-review` (CR-01): `curator.name`, note, and track title were interpolated unescaped into outbound HTML email. Fixed via `escapeHtml()` + character-length backstop in `app/api/pitches/route.ts` | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-07 | External reach-signal APIs (Spotify/YouTube) are best-effort; swallowing errors and returning null is preferable to surfacing third-party error bodies or blocking the admin/cron flow on an optional signal | Plan 06-02 authors | 2026-07-01 |
| AR-06-02 | T-06-17 | Unsubscribe-link abuse only sets a non-destructive, idempotent flag on an already-pitched curator; worst case is a low-impact self-unsubscribe, not data loss or privilege escalation | Plan 06-06 authors | 2026-07-01 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-02 | 22 | 22 | 0 | Orchestrator (L1 grep-depth verification, ASVS level 1; register_authored_at_plan_time: true across all 6 plans) — 2 additional threats (T-06-CR, T-06-CR2) added post-hoc from `/gsd-code-review` findings, both confirmed closed via fix commits + user-confirmed live migration push |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-02
