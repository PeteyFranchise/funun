# Plan — Writer's Room Cookups, audience, broadcasting and host commerce

**Date:** 2026-09-26
**Type:** Product-planning documentation (`/gsd-quick` manual fallback)

## Objective

Record Cookups as scheduled, host-led creative events connected to the Writer's Room, including
shareable Cookup event cards, account-free attendance, distinct viewer and creative passes,
free/paid/mixed admission, a curated social-simulcast layer and a trustworthy host-payout
foundation. Preserve the guest path as a deliberate platform-acquisition loop, then give repeat
non-creative attendees a focused Cookups audience destination without splitting Funūn's identity,
payment or event systems.

## Scope

- Create a dedicated Cookups planning todo covering scheduling, event-card states, access modes,
  guest identity/admission, live-session boundaries, post-session conversion and rights safety.
- Link the Cookups expansion from the Writer's Room roadmap and live-collaboration brief.
- Make “anyone can join” mean no Funūn account is required, while retaining event-scoped identity,
  capacity, host controls, abuse protection and privacy.
- Keep attendance, room membership, contribution, credit, ownership and split-sheet participation
  as separate facts.
- Distinguish a small interactive creative stage from a scalable viewer broadcast, including an
  Open Studio format where a known creator may let anyone watch the work happen live.
- Define host-controlled free, paid and mixed pass models without letting ticket purchase imply
  authorship, ownership, credit or placement.
- Place core hosting in the existing Studio tier: the host/room owner's entitlement funds the
  session, while invited Members and account-free guests can participate without buying a plan.
- Preserve Team as the operating-and-growth tier—greater capacity, co-host/moderator controls,
  simulcast, analytics and potentially better transaction economics—not the first tier allowed to
  host or earn.
- Support one camera per creative participant plus an authorized screen share at the Studio core;
  make paired secondary-camera sources, production switching, saved scenes and additional
  simultaneous feeds Team-scale capabilities.
- Treat stage sharing, inclusion in the host's program, external simulcast and recording as four
  separate permissions/states so a private DAW or camera feed cannot leak into a public output.
- Plan “Cookups by Funūn” as a standalone-feeling audience surface/PWA inside the same product:
  discovery, Following, Upcoming, Live now, tickets, replays and notification preferences without
  forcing creative-profile, Sound Vault or rights onboarding.
- Keep a separate native viewer app evidence-gated on repeat audience behavior, push-notification
  value, mobile viewing, event supply, replay retention and reviewed mobile-store economics.
- Define a curated program output for Funūn and optional social simulcast; never broadcast the
  underlying private Writer's Room.
- Record the financial doctrine required before paid Cookups launch: one payout owner initially,
  provider-held bank details, immutable order economics, a reconciled internal money ledger,
  transparent fees and deterministic refund/dispute/payout states.
- Keep video/vendor selection open; Cookups consume the future live media layer rather than locking
  a provider in this amendment. Keep broadcast and payment integrations behind explicit provider
  boundaries as well.

## Expected files

- `.planning/todos/pending/2026-09-26-writers-room-cookup-events-and-guest-access.md`
- `.planning/todos/pending/2026-09-01-writers-room-live-collaboration.md`
- `.planning/todos/pending/2026-09-26-stripe-subscriptions-setup-and-phase.md`
- `.planning/deliberations/cookups-product-doctrine.md`
- `.planning/deliberations/organizational-doctrine/README.md`
- `.planning/deliberations/organizational-doctrine/playbook-publication-map.md`
- `.planning/ROADMAP.md`

## Validation

- Confirm the roadmap links to the new todo.
- Confirm the plan explicitly includes Cookup event cards and account-free guest joining.
- Confirm viewer/creative access and free/paid/mixed pricing are independent dimensions.
- Confirm Studio unlocks starting video/hosting while free Members and guests can join; confirm
  exact usage limits remain cost-tested rather than invented in planning.
- Confirm paired secondary devices join as named camera sources without creating an echoing second
  participant, and confirm DAW screen/audio sharing has a fallback artifact-exchange path.
- Confirm following a host/series is distinct from a professional connection, collaborator roster,
  room membership, creative seat, credit or rights relationship.
- Confirm permanent Cookups principles live in a future-facing doctrine with an explicit
  not-shipped warning, while prices, limits, vendors, routes and app timing remain changeable
  roadmap parameters.
- Confirm external simulcast uses a curated program feed and cannot leak a paid or private room.
- Confirm the payout doctrine can explain every cent without storing raw bank credentials.
- Confirm guest access does not silently expose the permanent Writer's Room or create rights.
- Run `git diff --check`; no code or migrations should change.

## Coordination note

The current branch belongs to another documentation stream and now carries the additive Cookups
planning files listed above. Continue isolating those edits; do not edit application code,
migrations or unrelated roadmap sections.
