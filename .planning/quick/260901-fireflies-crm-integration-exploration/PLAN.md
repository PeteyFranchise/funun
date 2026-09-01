# Fireflies.ai → Funūn Internal CRM Integration — Exploration Plan

## Objective

Determine whether and how Funūn should build a private, one-way Fireflies.ai integration that automatically turns completed sales and partner meetings into useful, correctly matched entries inside the internal Client Partners CRM.

The target experience is:

> A meeting finishes, Fireflies processes it, and Funūn automatically places a concise summary, action items, attendees, duration and Fireflies link on the correct client or contact record. Unclear matches wait for staff review instead of being guessed.

This is an exploration and planning artifact, not a claim that the integration is already built or live.

## Product Position

This integration should reduce administrative work for Funūn staff while preserving the CRM as the trusted relationship record. It is an internal operating tool, not an artist-facing feature and not a claim of an official Fireflies partnership.

The first release should be **Fireflies → Funūn only**. It should not attempt to edit Fireflies meetings from Funūn, schedule meetings, or create a general-purpose automation platform.

## Existing Funūn Foundation

- `buyer_org_contacts` already stores multiple, email-addressable people per Client Partner.
- `client_relationship_log` already supports append-only `conversation` entries.
- Client Partner contacts and relationship history are staff-only and accessed through service-role-backed, staff-gated routes.
- The repository already has a durable jobs queue with deduplication, claims, retries and failure state.
- Existing webhook integrations provide local precedent for signature verification, idempotency and narrow payload handling.

Primary references:

- `supabase/migrations/112_client_partners_crm.sql`
- `lib/client-partners/contacts.ts`
- `app/api/admin/client-partners/[orgId]/relationship-log/route.ts`
- `supabase/migrations/118_jobs_queue.sql`
- `supabase/migrations/123_job_claim_leases.sql`
- `lib/jobs/queue.ts`
- `lib/jobs/run.ts`
- `app/api/webhooks/stripe/route.ts`
- `app/api/webhooks/resend/route.ts`
- `app/api/webhooks/docuseal/route.ts`

## Confirmed Fireflies Capabilities to Validate During Discovery

As of 2026-09-01, Fireflies' public documentation describes:

- Webhooks V2 events for `meeting.transcribed` and `meeting.summarized`.
- HMAC-SHA256 webhook signatures through `X-Hub-Signature`.
- A requirement for webhook consumers to return a successful response within ten seconds.
- A GraphQL transcript query exposing meeting identifiers, organizer, participants, attendees, duration, transcript URL, summaries, action items and transcript sentences.
- Bearer-token authentication using a Fireflies API key.
- Meeting-owner webhook scope for ordinary connections; Fireflies documentation states that team-wide webhook coverage requires an Enterprise account and Super Admin access.

External references:

- https://docs.fireflies.ai/graphql-api/webhooks-v2
- https://docs.fireflies.ai/graphql-api/query/transcript
- https://docs.fireflies.ai/fundamentals/authorization
- https://docs.fireflies.ai/graphql-api/webhooks

These are external product facts and must be rechecked during implementation planning because vendor APIs, plan limits and commercial terms can change.

## Exploration Scope

### 1. Connection and account model

Decide which launch model Funūn will use:

1. **Founder pilot:** connect Peter's Fireflies account and ingest only meetings owned by that account.
2. **Individual staff connections:** each participating staff member supplies their own Fireflies API key and webhook configuration, with secrets stored server-side and encrypted at rest.
3. **Team-wide connection:** evaluate Fireflies Enterprise/Super Admin access for one organizational integration covering the whole team.

Do not assume Fireflies offers OAuth. The current public documentation describes API-key authentication; the discovery pass must confirm whether a supported OAuth or partner-app path exists before planning one.

### 2. Data minimization and consent

Decide, with legal/privacy review:

- What recording/transcription disclosure Funūn staff must give meeting attendees.
- Whether Funūn stores only a summary and action items, or also stores transcript text.
- Whether audio/video URLs are linked, copied or omitted.
- Retention and deletion periods for meeting data and participant email addresses.
- Who inside Funūn can view meeting records.
- What happens when a Fireflies transcript is deleted or access is revoked.

Recommended default: store normalized meeting facts, summary, action items and a Fireflies link; do not copy the full transcript or media into the ordinary relationship log.

### 3. Contact and organization matching

Use normalized exact email matching against `buyer_org_contacts.email` as the primary automatic signal.

Matching outcomes:

- **Exactly one Client Partner organization matched:** attach the meeting automatically.
- **Multiple contacts within the same organization matched:** attach to the organization and associate every matched contact.
- **Participants match more than one organization:** send the meeting to an internal review queue.
- **No participant matches:** send the meeting to the review queue; do not silently create a new organization or contact.
- **Only internal Funūn attendees match:** keep the meeting unmatched unless staff explicitly files it.

Never infer an organization from an email domain alone in the first release. Domain matching can be explored later as a staff-visible suggestion, not an automatic write.

### 4. Attribution

Map `organizer_email` to the authenticated Funūn staff account that owns the meeting. The CRM should say that the conversation was conducted by that staff member, while separately identifying Fireflies as the import source.

If the organizer cannot be mapped to an active Funūn staff account, hold the meeting for review. Do not attribute automated activity to an arbitrary employee.

### 5. Proposed ingestion architecture

1. Fireflies sends `meeting.summarized` to `POST /api/webhooks/fireflies`.
2. The route reads the raw request body and verifies the HMAC signature with a timing-safe comparison.
3. The route validates a small allowlisted event schema.
4. A unique external meeting/event record is inserted and a deduplicated background job is queued.
5. The webhook returns `2xx` promptly; it does not call Fireflies or perform CRM matching inline.
6. The job handler requests the canonical meeting details from the Fireflies GraphQL API.
7. The handler normalizes attendee emails, matches staff/contact records and records one of three outcomes: `matched`, `needs_review`, or `failed`.
8. A matched meeting is stored in a dedicated staff-only meeting record and produces one concise append-only `conversation` entry in `client_relationship_log`.
9. Retriable failures remain visible and can be replayed without creating duplicate CRM entries.

The webhook is a notification, not the source of truth. The worker must fetch the canonical Fireflies record by meeting ID.

### 6. Proposed data model

Research a dedicated table rather than forcing full meeting data into `client_relationship_log.meta`.

Candidate `crm_meetings` facts:

- Internal UUID
- Provider (`fireflies` initially)
- Unique provider meeting/transcript ID
- Event and processing status
- Matched Client Partner organization
- Matched contact IDs
- Organizer staff user ID
- Title and meeting time
- Duration
- Participant emails, stored only if approved by the privacy decision
- Fireflies transcript URL
- Summary and structured action items
- Error/retry information
- Imported, processed and last-updated timestamps

The exact schema is an implementation-planning decision. Secrets and raw API keys must never be stored in this table or exposed to the browser.

### 7. CRM experience

For a correctly matched meeting, show a relationship entry such as:

> **Fireflies meeting — Nigil / Secretly**
> Discussed song-registration friction and metadata handoff.
> **Next actions:** Peter sends the Song Passport example; Nigil selects three pilot songs.
> Attendees: Peter Zora, Nigil Mack · View in Fireflies

Add an internal **Unmatched meetings** queue where authorized staff can:

- Review meeting title, organizer and participant emails.
- Select the correct Client Partner organization and contacts.
- Dismiss an internal/non-CRM meeting.
- Retry a failed import.
- File the meeting once, with an audit record of the staff decision.

## Recommended Delivery Stages

### Stage 0 — Commercial and privacy confirmation

- Confirm Peter's current Fireflies plan includes API and Webhooks V2 access.
- Decide founder-only pilot versus broader team coverage.
- Request current Fireflies pricing/terms for Enterprise team-wide webhooks if needed.
- Approve meeting disclosure, data-minimization, retention and deletion rules.

### Stage 1 — Founder pilot

- One server-side API key and signing secret.
- Signed `meeting.summarized` webhook.
- Durable fetch job and unique provider meeting ID.
- Exact contact-email matching.
- Summary/action-items relationship entry for one unambiguous organization.
- Safe `needs_review` state for every other outcome.

### Stage 2 — Review queue and operational safety

- Unmatched/ambiguous meeting UI.
- Manual assignment and dismissal.
- Retry/replay controls.
- Processing observability and staff audit evidence.
- Retention/deletion workflow.

### Stage 3 — Team rollout

- Choose individual staff keys or Fireflies Enterprise team-wide access.
- Add per-staff connection status and credential rotation.
- Prove own-book/leadership CRM visibility remains intact.
- Add onboarding and support documentation for staff.

### Stage 4 — Optional official integration path

- Only after the internal workflow proves useful, evaluate Fireflies' developer/partner program and whether public listing provides meaningful distribution or support benefits.
- Do not describe Funūn as a Fireflies partner unless Fireflies formally approves that status.

## Definition of a Successful Pilot

The pilot succeeds when:

- A Fireflies-owned meeting produces one and only one Funūn ingestion record.
- Forged, unsigned or malformed webhooks create no work and expose no secrets.
- The webhook responds within Fireflies' required time window while processing continues durably.
- A meeting with one unambiguous CRM organization appears automatically on the correct Client Partner record.
- An ambiguous or unmatched meeting never attaches itself to a guessed organization.
- The organizer attribution is correct.
- Summary and action items are useful to the assigned AE/leadership user.
- Retries and duplicate vendor events do not create duplicate relationship entries.
- A staff member outside the existing CRM scope cannot read the meeting.
- The approved retention/deletion behavior works.

## Non-Goals for the First Build

- Full two-way CRM synchronization.
- Automatic organization/contact creation from unknown attendees.
- Domain-only matching that writes without human review.
- Copying every transcript sentence, audio file or video file into Funūn by default.
- Treating Fireflies summaries as verified contractual commitments.
- Automatically changing deal stages, ownership, pricing or legal terms from meeting language.
- A public customer-facing integration marketplace.
- Claiming official Fireflies partnership or team-wide coverage before the required account level is confirmed.

## Files Expected to Change During a Future Implementation

The exact phase plan will decide the final list, but likely surfaces include:

- A forward-only Supabase migration for provider connections/meeting ingestion and idempotency.
- `app/api/webhooks/fireflies/route.ts`
- `lib/integrations/fireflies/*`
- `lib/jobs/handlers.ts`
- `lib/client-partners/contacts.ts`
- A staff-gated unmatched-meetings API and UI.
- Client Partner workspace meeting presentation.
- `.env.example` and integration operations documentation.
- Migration, webhook-authentication, matching, queue, authorization and UI tests.

## Validation Plan for a Future Build

- Signature tests use the exact raw body and timing-safe comparison.
- Schema tests reject unknown event types and malformed IDs.
- Idempotency tests cover duplicate events and worker retries.
- Matching tests cover one org, multiple contacts/same org, multiple orgs, no match and internal-only calls.
- Authorization tests preserve leadership/own-book scope.
- Worker tests cover API outage, rate limiting, missing transcript, delayed summary and revoked credentials.
- Privacy tests prove transcript/media fields remain absent unless explicitly approved.
- Production smoke uses a controlled Fireflies upload or test meeting and verifies the resulting CRM record.

## Risks and Coordination Notes

- Fireflies API capabilities, plan requirements and rate limits are external dependencies and must be reverified before implementation.
- Webhook ownership rules create a real founder-pilot versus team-wide product decision.
- Meeting transcripts and attendee identities are sensitive. Privacy/retention decisions are a launch gate, not post-launch cleanup.
- Exact email matching is intentionally conservative; false negatives are safer than filing a confidential meeting under the wrong client.
- `.planning/ROADMAP.md` currently contains unrelated uncommitted work, so this exploration is intentionally self-contained and should be promoted to a numbered roadmap phase only after team discussion.

## Team Discussion Questions

1. Do we pilot only Peter's Fireflies-owned meetings first?
2. Which Fireflies plan is active, and does it expose API keys and Webhooks V2?
3. Is team-wide ingestion valuable enough to investigate Enterprise now, or after the founder pilot?
4. Should Funūn store only summaries/action items and links, or retain full transcript text?
5. What disclosure, retention and deletion doctrine does legal approve?
6. Who may view unmatched meetings and manually file them?
7. Should a meeting ever create a new CRM contact, or should that always remain a staff decision?
8. Which internal meetings must be excluded automatically?
9. What is the acceptable delay between Fireflies processing and the CRM entry appearing?
10. What pilot success metric justifies a team-wide rollout: time saved, follow-up completion, CRM coverage, or another measure?
