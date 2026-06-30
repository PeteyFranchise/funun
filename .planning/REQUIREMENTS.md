# Requirements: Funūn Wave 3 — Launchpad

**Milestone:** v1.1 Launchpad
**Status:** Active
**Last updated:** 2026-06-30

---

## Validated (Wave 1 — shipped)

- ✓ **COLLAB-01**: Artist can create a collaborator profile with name, email, phone, PRO affiliation, IPI/CAE number, publisher, MLC/SoundExchange IDs, and mailing address
- ✓ **COLLAB-02**: Artist can edit and delete collaborator profiles from a global collaborators list
- ✓ **COLLAB-03**: When creating a split sheet or contract, artist can select collaborators from their saved list (auto-fills contact + rights data)
- ✓ **COLLAB-04**: Collaborators are stored globally per artist (reusable across all vault projects)
- ✓ **COLLAB-05**: When a non-Funūn collaborator later creates a Funūn account, their existing contributions are automatically linked via email-based claim — no re-entry required
- ✓ **RIGHTS-01**: Artist sees a step-by-step copyright registration guide with deep-link to copyright.gov eCO; per-project status tracked
- ✓ **RIGHTS-02**: Artist sees a PRO registration guide (ASCAP / BMI / SESAC / SOCAN) with deep-links; per-project ISWC proxy status tracked
- ✓ **RIGHTS-03**: Artist sees a SoundExchange registration guide with deep-link; status shows "ready" when RDR-N data is present
- ✓ **RIGHTS-04**: All three checklists surfaced on per-project Rights page with visual completion indicators
- ✓ **SONGTRUST-01**: Rights Coach includes a Songtrust guide card with CWR export action
- ✓ **DOC-01**: Artist can upload a signed PDF for any document type; status updates to "signed" with timestamp
- ✓ **DOC-02**: Split sheet and contract documents display a signer list with pending/signed status per signer
- ✓ **DOC-03**: Project vault readiness score gates correctly on signed (not just uploaded) documents

---

## Active (Wave 3 targets)

### Launchpad Checklist

- [ ] **LAUNCH-01**: Artist sees a Launchpad room with a guided post-release checklist per project
- [ ] **LAUNCH-02**: Each checklist item links to an in-Funūn tool or opens an external action with step-by-step instructions
- [ ] **LAUNCH-03**: Per-item tips surface contextual guidance; tips are DB-backed, AI-drafted monthly, and admin-approved before publish
- [ ] **LAUNCH-04**: Checklist item completion is tracked per project and persisted

### Playlist Curator Pitching

- [ ] **PITCH-01**: Artist can browse a curator directory filtered by genre and platform
- [ ] **PITCH-02**: Artist can select a track and send a pitch email to one or more curators via Resend; email includes `/r/[projectId]` player link and an unsubscribe path
- [ ] **PITCH-03**: Pitch history is tracked per project (curator, sent date, response status: pending / opened / accepted / declined)
- [ ] **PITCH-04**: Curator directory shows response rate per curator (last 90 days)
- [ ] **PITCH-05**: Curators can claim their directory profile via a link in pitch emails (lightweight onboarding)
- [ ] **PITCH-06**: Bounce detection marks curator email addresses invalid after a hard bounce; genre drift alerts flag curators whose genre focus shifts significantly
- [ ] **PITCH-07**: Admin view for managing the curator directory (add, edit, flag inactive, review claimed profiles)
- [ ] **PITCH-08**: "Playlist Curator" is added to industry occupation options in Settings

### Social Campaign Planner

- [ ] **SOCIAL-01**: Artist selects which platforms they are active on (Instagram, TikTok, X, YouTube Shorts, Facebook, Threads) per project
- [ ] **SOCIAL-02**: Funūn surfaces best-practice nudges toward highest-impact platform combinations based on the artist's genre
- [ ] **SOCIAL-03**: AI generates a 4–6 week content calendar from release data (title, genre, collaborators, release date, story); calendar is structured by week and platform
- [ ] **SOCIAL-04**: Each calendar slot shows a draft caption or hook, a content type tag (short-form video, static image, lyric graphic, text, stories), and the suggested week
- [ ] **SOCIAL-05**: DropReady and SoundBait are accessible as inline calendar slot actions ("Generate caption", "Generate hook") and as standalone quick tools in the Launchpad tools view
- [ ] **SOCIAL-06**: Artist can check off calendar posts as they go live; completion is tracked per project
- [ ] **SOCIAL-07**: Artist can export the campaign calendar as a Buffer-compatible CSV (columns: Text, Image URL, Tags, Posting Time)

---

## Future Requirements (deferred)

- Direct social post scheduling / publishing via Meta/TikTok OAuth — Wave 4
- Later API integration for direct calendar push — Wave 4 (Later has no CSV import as of 2026)
- Buffer API integration for direct calendar push — Wave 4
- Curator directory seeding via automated scraping or API — Wave 4 (manual + claimed onboarding for Wave 3)
- Dropbox Sign live implementation — needs paid account; abstraction is in place from Wave 2
- Songtrust API integration — BD conversation pending
- SoundExchange direct filing — partner agreement required
- Sync licensing marketplace — Wave 4

---

## Out of Scope (Wave 3)

- **Social post execution (OAuth publishing):** Meta/TikTok OAuth is meaningful scope; Wave 3 covers planning only
- **Later CSV export:** Later has no CSV import feature as of 2026; export is Buffer-only
- **Curator email crawling:** Manual onboarding only for Wave 3
- **Dropbox Sign e-sign:** Needs paid account; deferred
- **Songtrust API:** BD conversation pending
- **Auto-transcode WAV→MP3:** Wave 1 deferred item, not in Wave 3

---

## Traceability

| Requirement | Phase | Notes |
|-------------|-------|-------|
| LAUNCH-01 | Phase 5 | Launchpad room foundation |
| LAUNCH-02 | Phase 5 | In-Funūn tool links and external action CTAs |
| LAUNCH-03 | Phase 5 | DB-backed tips with admin approval pipeline |
| LAUNCH-04 | Phase 5 | Per-project completion persistence |
| PITCH-01 | Phase 6 | Curator directory browse + filter |
| PITCH-02 | Phase 6 | Pitch email send via Resend (requires pitch.funun.studio subdomain) |
| PITCH-03 | Phase 6 | Pitch history tracking |
| PITCH-04 | Phase 6 | Response rate per curator |
| PITCH-05 | Phase 6 | Curator claim flow (mirrors Wave 2 collaborator claim) |
| PITCH-06 | Phase 6 | Bounce detection + genre drift alerts |
| PITCH-07 | Phase 6 | Admin curator directory view |
| PITCH-08 | Phase 6 | lib/industry-roles.ts addition |
| SOCIAL-01 | Phase 7 | Platform selector per project |
| SOCIAL-02 | Phase 7 | Genre → platform nudge (static lookup table) |
| SOCIAL-03 | Phase 7 | AI calendar generation (batch, JSON-prompt pattern) |
| SOCIAL-04 | Phase 7 | Calendar slot structure with content type tags |
| SOCIAL-05 | Phase 7 | DropReady + SoundBait inline + standalone quick tools |
| SOCIAL-06 | Phase 7 | Calendar post completion tracking |
| SOCIAL-07 | Phase 7 | Buffer-compatible CSV export |
