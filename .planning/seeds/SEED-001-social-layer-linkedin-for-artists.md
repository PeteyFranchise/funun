---
id: SEED-001
status: dormant
planted: 2026-07-03
planted_during: post-v1.1 (Launchpad shipped; scoping Wave 4 / v1.2)
trigger_when: when scoping a milestone that touches social, networking, community, profiles, DMs, or artist↔industry connection — or any Wave 4+ milestone decision
scope: Large
---

# SEED-001: Deepen the social layer — the "LinkedIn for artists" pillar

Funūn already ships a live social/professional-network layer for artists and industry
pros. It is currently **thin** and is documented as a strategic pillar and moat, but has
not had a dedicated milestone. When a future milestone touches social/community/networking,
surface this seed and consider making the social layer a first-class milestone rather than
leaving it as background.

## Why This Matters

Per `docs/release-journey.md` ("SOCIAL LAYER & INDUSTRY COMMUNITY"):

> "Tools guide an artist; a network with **real industry access** keeps them."

The release-journey doc frames the social layer as **a parallel pillar to the release
journey** and an explicit competitive moat: *"discovery, mentorship, credibility, and
promotion all get easier inside a real network, and it's a moat tools alone can't copy."*
Deepening it turns Funūn from a tools suite into a destination and network, feeds the
Antenna with genuine opportunities, and compounds every other pillar.

## When to Surface

**Trigger:** when scoping any milestone that touches social, networking, community,
profiles, DMs, or artist↔industry connection — and as a candidate at every Wave 4+
milestone decision.

Raised by Pete on 2026-07-03 while scoping Wave 4: *"do we have notes for a social layer,
like a social media style layer similar to LinkedIn for artists?"* — Yes, we do, and it's
partially built. This seed preserves that so it isn't lost between milestones.

## Scope Estimate

**Large** — a full milestone. The foundation exists (see Breadcrumbs), so this is
*deepening* not greenfield.

**Already shipped (✅ live):** public profiles (`/profile`, `/u/[handle]`, `/r/[projectId]`),
Follow · Wall · Endorsements, threaded release comments, activity feed (auto-emits on
release/placement/readiness), 1:1 artist↔industry DMs (realtime + polling), and
artist↔industry matching via Antenna/PitchPlug.

**Unbuilt / candidate scope for a social milestone:**
- **Industry Round Table** (💡 flagged as THE differentiator) — a new room for scheduled
  live panels/talks with real pros (e.g. Peter Zora), replays, and Q&A. "Real industry
  access, not just tools."
- **Presence + unread badges** for DMs (⬜ on the social backlog — small).
- Richer profiles / discovery / networking depth (to be scoped).
- Open decision flagged for Pete: *"recover the social-calendar name (the better one we
  used before)"* — minor, tracked in release-journey.md open decisions.

## Breadcrumbs

- `docs/release-journey.md:219` — "SOCIAL LAYER & INDUSTRY COMMUNITY" section: the pillar
  spec, current-status table, Round Table idea, and "why it matters" framing.
- `docs/release-journey.md:260` — Room map row: "Profile / Social (+ 🆕 Round Table)".
- `docs/release-journey.md:314` — open decision: recover the better social-calendar name.
- `docs/STATUS.md:122` — "Profiles + social layer (live)" summary of shipped features.
- Code (live social surface): `app/api/wall/`, `app/api/endorsements/`, `app/api/follows/`,
  `app/u/[handle]/`, `app/r/[projectId]/`.

## Notes

Wave 4 as originally planned in PROJECT.md was "deep integrations" (Songstats, Buffer API,
Meta/TikTok publishing, SoundCloud/Bandsintown/YouTube). The social layer is an
**alternative or complementary** direction for a milestone — not currently on the
integrations roadmap. Decide social-first vs integrations-first (vs a blend) when scoping.
See also the deferred integration items in `.planning/STATE.md` "Deferred Items".
