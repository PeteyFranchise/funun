# Phase 6: Playlist Curator Pitching - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 6-Playlist Curator Pitching
**Areas discussed:** Curator directory seeding, Pitch composer & drafting, Response & engagement signals, Bounce/drift & claim scope, Curator account scope, Unsubscribe semantics, Filter taxonomy, Send-domain readiness, Genre drift alert audience, Track scope for pitching, New API credentials, Artist notification on response, Admin "flag inactive" criteria, Decline reason capture

---

## Curator Directory Seeding

| Option | Description | Selected |
|--------|-------------|----------|
| Admin CRUD only | Reuses Phase 5 ChecklistAdmin pattern, one-by-one entry | ✓ |
| Bulk CSV import + admin CRUD | Admin page supports CSV upload for initial batch | |
| SQL seed migration + admin CRUD | Hand-picked list goes into a one-time seed migration | |

**User's choice:** Admin CRUD only.

| Option | Description | Selected |
|--------|-------------|----------|
| Lean set | Name, email, playlist/URL, genre, notes only | |
| Lean + reach signal | Adds follower/subscriber count, admin-entered | |
| You decide | | |

**User's choice:** Lean + reach signal, but **auto-fetched** (free-text override of the offered options) — user asked "Can we do a Lean + reach signal that is auto-fetched?"

**Follow-up — auto-fetch mechanism:**

| Option | Description | Selected |
|--------|-------------|----------|
| Fetch on admin add/edit only | One-time fetch, manual refresh only | |
| Fetch on add + periodic refresh | Adds scheduled job requirement | ✓ |
| Spotify only for v1 | Single-platform, no YouTube | |

**Follow-up — platform/cadence/mechanism scope:**

| Option | Description | Selected |
|--------|-------------|----------|
| Spotify only, weekly, Vercel Cron | | |
| Spotify + YouTube, weekly, Vercel Cron | Both platforms, weekly refresh | ✓ |
| You decide | | |

**Notes:** No cron/scheduled-job infrastructure exists in this codebase today — Vercel Cron is the only mechanism that fits the existing Vercel-hosted Next.js stack without new infra dependencies.

---

## Pitch Composer & Drafting

| Option | Description | Selected |
|--------|-------------|----------|
| AI-drafted, editable (PitchPlug pattern) | Reuses existing Claude-based drafting tool | ✓ |
| Manual only | No AI assist | |
| You decide | | |

**User's choice:** AI-drafted, editable.

| Option | Description | Selected |
|--------|-------------|----------|
| Track-first | Pick track in Launchpad room, then curators | |
| Curator-first | Browse directory, then pick track | |
| You decide | | |

**User's choice:** "Could it work both ways?" — free-text override; both entry points included.

**Follow-up — where curator-first directory lives:**

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone /curators page | Global directory route | ✓ |
| Curator tab inside Launchpad room | No new top-level route | |

**Follow-up — where composer opens from curator-first flow:**

| Option | Description | Selected |
|--------|-------------|----------|
| Modal/drawer on /curators | Composer stays on directory page | |
| Redirect into Launchpad room | Composer centralized in project room | ✓ |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Disabled + labeled | Already-pitched curators greyed out in selector | ✓ |
| Selectable, blocked on Send | Error shown only at send time | |

---

## Response & Engagement Signals

| Option | Description | Selected |
|--------|-------------|----------|
| Resend open tracking | Tracking pixel, automatic | |
| No auto-open tracking | Rejected pixel approach | ✓ (initial) |
| You decide | | |

**Follow-up — how "opened" gets set without a pixel:**

| Option | Description | Selected |
|--------|-------------|----------|
| Curator profile-view triggers it | Visiting response page flips status | |
| Skip 'opened' as automatic | Dropped from pipeline entirely | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Curator response links | One-click token-authenticated Accept/Decline | ✓ |
| Artist self-reports | Manual marking by artist | |
| Both | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Accepted + declined / total pitched | Any explicit action counts as response | ✓ |
| Accepted only / total pitched | Acceptance-rate framing | |

---

## Bounce, Drift & Claim Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, build it | New webhook route, Svix-verified, flips email_valid | ✓ |
| Manual admin flag only | Skip webhook, admin marks manually | |

| Option | Description | Selected |
|--------|-------------|----------|
| Admin edits the curator's genre tags | Drift signal from admin edits only | |
| Curator self-edits after claiming | Drift signal from curator edits only | |
| Both | Either source triggers baseline comparison | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Genre focus + platform only | Narrow self-serve edit scope | |
| Full profile edit | Broad self-serve edit scope | ✓ |
| You decide | | |

**Follow-up — persistent access for full profile edit:**

| Option | Description | Selected |
|--------|-------------|----------|
| Lightweight Funun account | Magic-link auth, reuses existing pattern | ✓ |
| Link-based only, no account | Fresh link needed each time | |

---

## Curator Account Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Profile edit only | No pitch visibility | |
| Profile + pitch history received | Read-only pitches-received view | ✓ |

---

## Unsubscribe Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Do-not-pitch flag | Stays in directory, blocked from future pitches | ✓ |
| Remove from directory | Full removal/soft-delete | |

---

## Filter Taxonomy

| Option | Description | Selected |
|--------|-------------|----------|
| Streaming-focused set | Spotify, Apple Music, YouTube Music, SoundCloud | |
| Streaming + blog/other | Adds generic Blog/Independent catch-all | ✓ |
| You decide | | |

---

## Send-Domain Readiness

| Option | Description | Selected |
|--------|-------------|----------|
| Not started — build gated behind env var | Ship built, gate real sending on PITCH_FROM_EMAIL config | ✓ |
| Already handled outside this discussion | Treat as available by ship time | |

---

## Genre Drift Alert Audience

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-only, in curator admin view | Badge only, no artist-facing surface | |
| Admin + artist warning at pitch time | Adds inline warning before Send | ✓ |

---

## Track Scope for Pitching

| Option | Description | Selected |
|--------|-------------|----------|
| Any track in the project | Full track picker | ✓ |
| One lead/representative track per project | Single designated track | |

---

## New API Credentials

| Option | Description | Selected |
|--------|-------------|----------|
| Need to create both | Spotify + YouTube credentials don't exist yet, gate behind env vars | ✓ |
| You decide / not blocking | | |

---

## Artist Notification on Response

| Option | Description | Selected |
|--------|-------------|----------|
| Email + in-app notification | Reuses existing notifications table + Resend | ✓ |
| In-app only | No extra email | |

---

## Admin "Flag Inactive" Criteria

| Option | Description | Selected |
|--------|-------------|----------|
| Manual only | Pure admin judgment call | |
| Manual + suggested signal | Advisory hint (no response streak / bounce) prompts review | ✓ |

---

## Decline Reason Capture

| Option | Description | Selected |
|--------|-------------|----------|
| Optional reason field | Skippable free-text on decline | ✓ |
| Bare single click | No extra page/field | |

---

## Claude's Discretion

- Exact platform filter enum values beyond "Streaming + blog/other" category
- Vercel Cron failure/retry handling and Spotify/YouTube API rate-limit handling
- Full `curators` / `pitch_history` schema design (RLS enabled immediately after each `CREATE TABLE`)
- Svix webhook signature verification implementation details
- Whether PITCH-08 needs UI beyond `lib/industry-roles.ts` (likely trivial)

## Deferred Ideas

None — discussion stayed within Phase 6 scope. Automated curator directory seeding via scraping/API remains out of scope for Wave 3 (already logged in PROJECT.md / REQUIREMENTS.md as a Wave 4 item).
