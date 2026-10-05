---
created: 2026-10-05T00:00:00.000Z
title: Confirm C-01 production impact — run two read-only audit queries
area: data-audit
files:
  - lib/deals/catalog-query.ts (fix shipped in this plan)
  - lib/deals/request-target.ts (fix shipped in this plan)
  - .planning/deliberations/2026-10-05-pass-5-rights-eligibility-review.md
---

## Problem

Quick task `261005-pta` closed C-01: catalogue visibility and license-request
authorization both collapsed per-track `sync_listings` admission to a project-level
boolean, so a never-reviewed sibling track could be listed and requested alongside
an admitted sibling in the same project.

This session could not query production to measure the fix's real-world impact.
Reading `.env.local` was denied by the sandbox permission system, and the locally
cached `supabase` CLI token lacks the `projects_read` scope needed for any remote
access path tried (`supabase projects list` returned
`LegacyProjectsListUnexpectedStatusError: Missing required permission(s): projects_read`).
No safe path to even a read-only query exists from an agent session.

Production was described as currently having zero tracks, so both queries below are
**expected** to return zero rows — but that must be **confirmed**, not assumed.

## What the owner should do

Run both queries in the Supabase SQL editor against production and paste the results
back into this todo (or a follow-up note) so the fix's impact is a measured fact, not
an assumption.

### Query 1 — tracks currently exposed/requestable only via a sibling's admission

This is the exact set the fix in `catalog-query.ts`/`request-target.ts` stops exposing
going forward. If this returns rows, those tracks were listable/requestable in the
catalogue before this fix shipped, purely because a project sibling was admitted.

```sql
SELECT
  t.id AS track_id,
  t.title AS track_title,
  t.project_id,
  vp.title AS project_title
FROM tracks t
JOIN vault_projects vp ON vp.id = t.project_id
WHERE EXISTS (
  -- a sibling track in the same project has an admitted listing
  SELECT 1
  FROM sync_listings sl_sibling
  WHERE sl_sibling.vault_project_id = t.project_id
    AND sl_sibling.status = 'admitted'
)
AND NOT EXISTS (
  -- but this track itself has no admitted listing of its own
  SELECT 1
  FROM sync_listings sl_own
  WHERE sl_own.track_id = t.id
    AND sl_own.status = 'admitted'
);
```

### Query 2 — existing license requests already naming an unadmitted track

This is the literal, already-happened instance of C-01's worst-case harm: a
`license_requests` row created (before this fix shipped) naming a track that has no
admitted `sync_listings` row of its own. This fix does **not** retroactively clean up
any such rows — it only stops new ones (matches PR #148's own precedent of leaving
existing violating rows alone and deferring that call to the owner).

```sql
SELECT
  lr.id AS license_request_id,
  lr.vault_project_id,
  lrt.track_id,
  t.title AS track_title,
  lr.created_at
FROM license_request_tracks lrt
JOIN license_requests lr ON lr.id = lrt.license_request_id
JOIN tracks t ON t.id = lrt.track_id
WHERE NOT EXISTS (
  SELECT 1
  FROM sync_listings sl
  WHERE sl.track_id = lrt.track_id
    AND sl.status = 'admitted'
);
```

## Expected outcome

Both queries are expected to return **zero rows**, given production was reported to
currently have zero tracks. If either query returns rows, that is a real, already-live
instance of C-01 and should be triaged (which license requests/tracks, who holds them,
whether any already resulted in a signed deal) before being considered closed.
