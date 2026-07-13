---
phase: 09
slug: rich-member-profile
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-12
---

# Phase 09 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → PATCH /api/profile | Untrusted JSON body crosses into a service-role write | roles, open_to, pronouns, avatar_url, banner_url, featured_project_id, allow_resharing |
| client → DB (direct PostgREST) | An authenticated client could hit artist_profiles directly | column grants (migration 040/043) are the row/column boundary |
| client → POST /api/profile/avatar | Untrusted multipart upload crosses into Supabase Storage | image file bytes, MIME type |
| public visitor → /r/[projectId] SSR | Unauthenticated request; is_public gate is the authorization for streaming | signed share-MP3 URL, names+roles credits, lyrics text |
| public visitor → /u/[handle] SSR | Unauthenticated render; is_public gate + public column allowlist decide projection | public profile columns incl. allow_resharing |
| allow_resharing (owner setting) → visitor markup | Server read decides whether visitor Share/more-options affordance is emitted | boolean flag, server-side conditional |
| featured_project_id → public profile | Only an owned public release can be pinned | project id + is_public/owner pre-check |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-09-01a | Tampering | readLyrics() parse regression from additive TrackLyrics.synced | low | mitigate | readLyrics()/sanitizeLyrics() left byte-identical (type-only extension); schema-lyrics.test.ts asserts legacy `{text}` still parses | closed |
| T-09-01a-2 | Tampering | OPEN_TO_VALUES drifting from OpenTo union | low | mitigate | OPEN_TO_VALUES declared next to OpenTo union, typed `readonly OpenTo[]` — union change surfaces as compile error | closed |
| T-09-01 | Tampering | PATCH /api/profile mass-assignment | high | mitigate | New fields added to explicit EDITABLE_FIELDS allowlist only; `verified`/`member_type` confirmed absent (independently re-verified in 09-VERIFICATION.md) | closed |
| T-09-02 | Tampering | roles/open_to write untyped JSON into trusted columns | high | mitigate | Zod ProfileRoleSchema (discriminated union, max 6, custom label ≤40) + filterOpenTo against OPEN_TO_VALUES; invalid payloads dropped not written | closed |
| T-09-03 | Information Disclosure | featured_project_id pinning a private draft's UUID onto a public profile | high | mitigate | isFeaturableProjectRow API pre-check (owner+public) returns friendly 400/404; migration 034 DB trigger remains authoritative backstop | closed |
| T-09-04 | Tampering | allow_resharing coerced from non-boolean payload | low | mitigate | Strict boolean coercion in sanitize() branch; column defaults true, non-sensitive | closed |
| T-09-05 | Tampering / Elevation of Privilege | Uploaded file smuggling non-image payload | high | mitigate | EXT_BY_MIME allowlist keyed off file.type (png/jpeg/webp only); 10MB cap; mirrors live vault-assets pattern | closed |
| T-09-06 | Elevation of Privilege | User uploads into another user's storage folder | high | mitigate | Path is `${user.id}/profile/...` from server-derived auth.getUser(); existing vault-assets RLS enforces first-segment ownership | closed |
| T-09-07 | Tampering | Client writes avatar_url/banner_url via a widened API | low | mitigate | Write-back updates only the two image columns on `.eq('id', user.id)`; broader PATCH allowlist still gates any client-driven write | closed |
| T-09-08 | Information Disclosure | Public player leaking owner-only detail (split %, ISRC/ISWC/BPM, master, stems) | high | mitigate | Brand-new sibling component renders none of those elements; credits stripped to names+roles; only share-MP3 signed, never metadata.master — confirmed 0 matches for owner-only markup | closed |
| T-09-09 | Information Disclosure | Draft/private release streaming on the open page | high | mitigate | Existing is_public gate preserved unchanged; notFound() when not public | closed |
| T-09-10 | Elevation of Privilege | Visitor re-enabling Share affordance the artist turned off | low | mitigate | Share element omitted server-side (not CSS-hidden) when allow_resharing is false; sharing an already-public URL is a UX boundary, not access-control | closed |
| T-09-11 | Tampering | Signed URL replay after expiry | low | accept | 2-hour signed-URL expiry is the existing, accepted posture; no new exposure introduced | closed |
| T-09-12 | Tampering | Roles/open_to editor submitting malformed values | high | mitigate | Client caps (6 roles, 40-char label) mirror server-side Zod validation (T-09-02); API is the authoritative gate | closed |
| T-09-13 | Information Disclosure | FeaturedPicker exposing a private draft as pinnable | high | mitigate | List pre-filtered client-side to isPublic rows; API pre-check + migration 034 trigger are authoritative backstops — confirmed via grep | closed |
| T-09-14 | Spoofing | Visitor more-options menu presenting non-functional Report/Block | medium | mitigate | Menu ships exactly one functional item (Copy profile link); Report/Block deferred to Phase 13 with insertion-point comment, no silent no-op stubs | closed |
| T-09-15 | Tampering | allow_resharing toggled by a non-owner | low | mitigate | Toggle only lives in owner-authenticated settings; PATCH writes on `.eq('id', user.id)` from auth.getUser() | closed |
| T-09-16 | Information Disclosure | u/[handle] SELECT drifting to include a private column | high | mitigate | allow_resharing is public per migration 043 GRANT SELECT; SELECT list kept identical to grant list, no private column added — independently confirmed | closed |
| T-09-17 | Elevation of Privilege | Visitor re-enabling more-options/Share affordance | low | mitigate | ProfileMoreMenu omitted from server-rendered markup when allow_resharing is false (server-side conditional, not CSS) — confirmed via read | closed |
| T-09-18 | Spoofing | Presence dot falsely implying a member is online | medium | mitigate | Renders nothing until Phase 11 wires a real signal; no hardcoded "Online"; no Realtime subscription added — both independently confirmed at 0 matches | closed |
| T-09-19 | Information Disclosure | Featured picker/owner-release data leaking to a visitor render | medium | mitigate | ownerReleases/FeaturedPicker gated to owner mode inside ProfileView; visitor render path never mounts the picker | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-09-01 | T-09-11 | Signed-URL replay within the 2-hour expiry window is the project's existing accepted posture across all share links (unchanged since before this phase); re-affirmed rather than re-litigated during Phase 9 | Phase 9 threat model (09-03-PLAN.md) | 2026-07-12 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-12 | 21 | 21 | 0 | Claude (gsd-secure-phase, grep-level L1 classification against plan-time threat register + 09-VERIFICATION.md independent evidence) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-12
