---
created: 2026-09-01T13:00:00-04:00
title: Discuss and validate a Fireflies.ai integration with the internal Client Partners CRM
area: client-partners
priority: exploration
status: ready-for-gsd-discussion
depends_on:
  - .planning/quick/260901-fireflies-crm-integration-exploration/PLAN.md
files:
  - supabase/migrations/112_client_partners_crm.sql
  - lib/client-partners/contacts.ts
  - app/api/admin/client-partners/[orgId]/relationship-log/route.ts
  - supabase/migrations/118_jobs_queue.sql
  - supabase/migrations/123_job_claim_leases.sql
---

## Owner direction

Explore connecting Fireflies.ai automatically to Funūn's internal CRM so completed sales and partner meetings can become useful Client Partner relationship history without manual re-entry.

This direction approves a structured exploration and team discussion. It does not authorize a Fireflies purchase, claim an official partnership, or represent the integration as built or live.

## Recommended starting position

- Begin with a one-way Fireflies → Funūn founder pilot.
- Receive signed `meeting.summarized` events, acknowledge quickly and process through Funūn's durable jobs queue.
- Fetch canonical meeting details from Fireflies using the meeting ID.
- Match external participant emails exactly against existing CRM contacts.
- Automatically file only an unambiguous single-organization match.
- Send ambiguous, unmatched and unmapped-organizer meetings to a staff review queue.
- Store a concise summary, structured action items, attendee facts and a Fireflies link.
- Do not copy full transcripts or media by default.
- Never automatically change deal stages, ownership, pricing, legal terms or contractual facts based on a meeting summary.

## Discussion agenda

1. Confirm Peter's Fireflies plan and API/Webhooks V2 entitlement.
2. Choose founder-only pilot, individual staff keys or Enterprise/Super Admin team-wide coverage.
3. Approve meeting disclosure, data-minimization, retention and deletion doctrine with legal/privacy input.
4. Decide whether full transcript text has a legitimate operational need beyond a link to Fireflies.
5. Choose who may see and resolve unmatched meetings.
6. Confirm exact-email matching and the never-guess rule.
7. Decide whether new contacts may ever be proposed or created from meeting attendees.
8. Define organizer-to-staff attribution and behavior when no active staff account matches.
9. Define pilot metrics and the threshold for expanding beyond Peter's meetings.
10. Reverify Fireflies plan limits, webhook semantics, API fields, rate limits and partnership requirements immediately before planning implementation.

## GSD instruction

Use the linked exploration plan as source context for the discussion. If the owner approves a founder pilot after the open decisions are resolved, create a focused implementation phase or quick build with research, red tests and a human-gated credential/setup checkpoint. Do not jump directly from this TODO to production code without the privacy and account-model decisions.
