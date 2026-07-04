# Funūn — Milestones

## v1.1 — Wave 3: Launchpad

**Shipped:** 2026-07-04
**Phases:** 5–7 (3 phases, 18 plans)
**Timeline:** 2026-06-30 → 2026-07-03

### What shipped

| Phase | Name | Plans | Key deliverables |
|-------|------|-------|-----------------|
| 5 | Launchpad Checklist | 6 | Per-project post-release room with a week-sequenced guided checklist, DB-backed AI-drafted admin-approved tips, completion persistence, and in-app admin CRUD (dnd-kit reorder) |
| 6 | Playlist Curator Pitching | 6 | Filterable curator directory, AI-drafted 150-word pitch emails via dedicated `pitch.funun.studio` domain, pitch history + duplicate protection, curator claim flow, svix-verified bounce webhook, genre-drift alerts, admin directory view |
| 7 | Social Campaign Planner | 6 | AI-generated 4–6 week content calendar from release data, genre→platform nudges, inline + standalone DropReady/SoundBait actions, per-post completion tracking, Buffer-compatible CSV export |

### Key accomplishments

- **Launchpad checklist room** — per-project guided post-release playbook, week-sequenced to the Spotify algorithmic window; tips are DB-backed, AI-drafted monthly, and admin-approved before publish; completion persisted per project.
- **Playlist curator pitching** — filterable directory, AI-drafted 150-word pitch composer with a server-side 3-gate re-validated send route, per-project pitch history with `response_token`-based accept/decline/unsubscribe links, and a curator claim flow that provisions curator-role magic-link accounts isolated from the artist auth model.
- **Social campaign planner** — one-click AI calendar generation, preview-then-accept slot generation (no DB write until saved), one-active-campaign-per-project DB invariant, and a Buffer-compatible CSV export closing SOCIAL-01..07 end-to-end.
- **Security hardening** — column-level privilege migrations (031/032) on top of RLS, HTML-injection escaping in pitch emails, and AI output treated as untrusted (enum/range validation before persist). 22 threats closed in Phase 6, 21 in Phase 7, zero open.
- **Infra firsts** — first webhook route in the codebase (svix-verified Resend bounce handler flipping `curators.email_valid=false`); weekly Vercel Cron reach refresh with graceful Spotify/YouTube degradation.

### Requirements validated

LAUNCH-01–05, PITCH-01–08, SOCIAL-01–07 (19/19 Wave 3 requirements)

### Deferred to future waves

- Direct social post scheduling / publishing (Meta/TikTok OAuth) — Wave 4
- Direct Later/Buffer API calendar push — Wave 4 (Later has no CSV import as of 2026)
- SOCIAL-08 (research spike): Buffer API integration — Wave 4
- Curator directory seeding via scraping/API — Wave 4 (manual + claim for Wave 3)

---

## v1.0 — Wave 2: Rights & Registration Rails

**Completed:** 2026-06-29
**Phases:** 1–4

### What shipped

| Phase | Name | Plans | Key deliverables |
|-------|------|-------|-----------------|
| 1 | Collaborator Profiles | 4 | Global collaborator roster, auto-fill into split sheets and contracts, split-approval loop |
| 2 | Document Lifecycle | 3 | Signed-PDF upload, signer status tracking, readiness gate fix |
| 3 | Rights Guidance | 3 | Guided registration checklists (copyright, PRO, SoundExchange, Songtrust), per-project status |
| 4 | Collaborator Identity Reconciliation | 4 | Email-based claim system, user_profiles, claimed CollaboratorCard, My Credits dashboard |

### Requirements validated

COLLAB-01, COLLAB-02, COLLAB-03, COLLAB-05, DOC-01, DOC-02, DOC-03, RIGHTS-01, RIGHTS-02, RIGHTS-03, RIGHTS-04, SONGTRUST-01

### Deferred to future waves

- Dropbox Sign live implementation (account needed)
- Songtrust API integration (BD conversation pending)
- SoundExchange direct filing (partner agreement required)
