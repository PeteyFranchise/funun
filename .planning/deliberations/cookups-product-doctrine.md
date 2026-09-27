# Cookups Product Doctrine

**Status:** Owner-approved future-facing product doctrine adopted 2026-09-27; Cookups is planned
and is **not yet shipped**  
**Authority:** Canonical internal principles for Cookups, Writer's Room live media, audience
participation, event commerce and related future design  
**Product home:** The Writer's Room for creation; Cookups by Funūn for event and audience entry  
**Internal reference:** The Playbook → Company-wide → Standards & Doctrine  
**Implementation source:**
`.planning/todos/pending/2026-09-26-writers-room-cookup-events-and-guest-access.md`  
**Roadmap source:** `.planning/ROADMAP.md` — Writer's Room expansion: Cookups

> **Capability-status warning:** This doctrine governs how Cookups must be designed. It does not
> state that scheduling, video, broadcasting, ticketing, host payouts, following, replays or a
> Cookups application is currently available. Marketing, support and sales must verify deployed
> behavior before describing any planned capability as live.

## Executive definition

A **Cookup** is a host-led, time-bound creative event where people may make music, watch music
being made, exchange ideas, learn, receive critique or participate in another declared format. It
is the event layer above the persistent Writer's Room, not another name for the room itself.

The Writer's Room remains the private home of an underlying work: lyrics, recordings, notes,
versions, provenance, collaborators and rights workflows. A Cookup owns its schedule, public card,
admission, attendance, live stage, viewer program, moderation and post-event handoff. It may attach
to an existing room or create the beginning of a new one, but public event visibility never makes
the private work visible.

The governing promise is:

> Let people enter at the level that fits them—host, creator or audience—without making attendance
> imply identity, access, credit, ownership or rights that nobody explicitly granted.

## Capability truth as of adoption

Cookups is an approved direction, not a released product. The roadmap and product brief describe a
staged future build. Until an implementation phase ships and is verified:

- no person should be told they can schedule or host a Cookup;
- no subscription tier should advertise live-video or Cookup entitlements as active;
- no host should be permitted to sell Cookup admission or expect a Cookup payout;
- no external social destination should be represented as supported;
- no recording, replay, critique marketplace, audience-following surface or native app should be
  represented as available; and
- existing Writer's Room, identity, payment or social components are foundations only, not proof
  that the integrated Cookups behavior exists.

Implementation plans must replace this warning only for the exact capability, environment, plan,
jurisdiction and audience proven by tests and deployment evidence.

## Permanent doctrine

### CK-01 — A Cookup is an event; a Writer's Room is the persistent work

A Cookup has a beginning, end, host, access policy and attendance record. A Writer's Room persists
before and after the event. Ending a Cookup does not delete the work; joining a Cookup does not
grant ongoing room access. Creating, attaching or carrying event artifacts into a room requires an
explicit, authorized handoff.

### CK-02 — The public event card is a projection, never the private record

The Cookup card is the canonical invitation, discovery, RSVP, ticket and live-entry surface. It may
show the host, public title, schedule, format, roles, capacity, prices and safe event description.
It never exposes private work titles, unreleased files, storage paths, private collaborators,
messages, legal names, contact details, PRO/IPI data, contracts, splits, payout information or
other Writer's Room content merely because the event is public.

### CK-03 — Account-free attendance is legitimate participation

An eligible person may enter a Cookup without first becoming a Funūn Member when the event's
access, capacity, payment and host controls allow it. “Anyone can join” means no mandatory account
wall; it does not mean an unmoderated permanent public room. Guest credentials are event-scoped,
time-bounded and revocable.

Account creation should occur after value when persistent benefits—following, cross-device
tickets, reminders, replays or contribution claim—make it useful. Core promised participation
must not be held hostage to a surprise signup step.

### CK-04 — Audience identity is valid without creative identity

A person may enjoy Cookups without identifying as an artist, writer, producer or industry
professional. Audience members must not be forced through Sound Vault, rights settings, PRO/IPI
fields or a fake creative-profile setup. If an audience member later creates, the same identity
gains capabilities; attendance and purchases are not discarded into a second account.

### CK-05 — Funūn remains one identity and trust ecosystem

Cookups by Funūn may have a standalone-feeling web, PWA or later native shell, but it uses the same
identity, guest-claim, host verification, blocks, moderation, notifications, events, tickets,
ledger, payouts, consent and replay-entitlement systems. Do not fork the marketplace, follower
graph, host reputation, ticket library or safety history into a separate product database.

### CK-06 — Event roles are explicit and limited

The product distinguishes at least:

- **Host:** controls the event policy and accountable commercial relationship.
- **Co-host/operator:** receives only the delegated event or production controls granted.
- **Creative participant:** may enter the interactive stage and use granted creation capabilities.
- **Viewer:** receives the host-approved program and limited audience interactions.

Buying, receiving or being promoted into a role grants only the capabilities stated for that role.
Co-host status does not create music ownership or an automatic revenue share. Viewer status does
not create a creative record. Creative access does not create authorship or room ownership.

### CK-07 — Admission, attendance, contribution and rights are separate facts

The model must distinguish invitation, application, admission, attendance, hosting, contribution,
credit proposal, confirmed credit, permanent-room invitation, room membership, split discussion
and executed agreement. No state silently advances to another.

Appearing on camera, chatting, uploading a file, buying a pass, being present when an idea is made
or paying for a creative seat does not by itself create authorship, credit, ownership, publishing,
master rights, licensing authority or a split-sheet share.

### CK-08 — Free, paid and mixed access are first-class

Hosts may configure viewer and creative access separately as free, paid, complimentary,
invite-only or application-based, subject to product policy and capacity. Free Cookups are a
growth and community model, not a degraded paid event. A zero-price RSVP still creates the scoped
admission record needed for capacity, safety, revocation and attendance.

Pricing buys the declared experience, not an undisclosed chance at value. Where a finite paid
critique or creative slot is promised, capacity should reflect the number of deliverable slots.

### CK-09 — Open Studio has a small stage and a scalable audience

Open Studio lets a songwriter, producer or other creator open the act of making music to a broad
audience for free or for a declared price. The creative stage remains small and interactive; the
audience receives a scalable program rather than joining one enormous peer media room. Audience
reactions, moderated questions and deliberate stage promotion preserve intimacy without turning
every viewer into a creative participant.

### CK-10 — The program is curated; the room is never broadcast wholesale

The host or delegated operator selects the cameras, DAW surface, lyrics, playback or holding scene
that form the viewer program. Funūn viewers and external networks receive that program, not a
screen mirror of the private Writer's Room. Private navigation, notifications, messages, files,
rights data and backstage conversation remain outside the output.

### CK-11 — Media states and permissions never cascade silently

These are distinct states and authorizations:

1. a camera or screen is connected;
2. the source is visible to the creative stage;
3. the source is selected into the Funūn viewer program;
4. the program is sent to an external destination;
5. the source/program is recorded;
6. a recording is made available as replay or clip.

Consent or activation at one level does not authorize the next. The interface must make public
distribution unmistakable and provide immediate mute, remove, emergency-slate and stop controls.

### CK-12 — A camera source is not a second person

Each creative participant may have an authorized primary camera. A phone or other paired device
may later provide a named secondary angle such as a keyboard, vocal booth or live room. The paired
device is a revocable media source under the participant/session; it does not create a duplicate
attendance, contribution or rights identity. Its microphone and speaker default off to prevent
feedback unless deliberately enabled.

### CK-13 — Screen sharing is music-aware and honest about its limits

The product should support a camera beside a shared DAW or display and evaluate stereo,
music-oriented audio without assuming speech noise suppression is appropriate. Browser and
operating-system support for application/system audio varies. Funūn must verify supported paths,
show a clear limitation where one is unavailable and retain a direct take/stem exchange fallback.

A future DAW bridge or plugin may send audio/artifacts directly without a desktop bounce, but no
integration is promised until it is built and proven. Cookups does not promise geographically
distributed musicians latency suitable for tight real-time performance.

### CK-14 — Recording is off by default

Live presence does not imply recording permission. Recording, replay and clipping require clear
host configuration, participant notice and the applicable composition, master, performance,
sample and platform permissions. A host may not secretly enable recording. A recorded Cookup is
not automatically sellable or publishable.

### CK-15 — External social networks are acquisition channels, not the system of record

An authorized Cookup may send a full public program or public preview to supported destinations.
Private or paid-only content must not be broadcast in full by accident. Social calls to action
return to the canonical Funūn event card for admission, tickets, following and the next event.
External comments are not silently copied into the Writer's Room or treated as authorship evidence.

Platform eligibility, ingest methods, APIs and terms must be reverified at implementation time.

### CK-16 — Following is content discovery, not professional access

An audience member may follow a host or recurring series and control related notifications.
Following does not create a connection, collaborator-roster entry, Writer's Room membership,
message permission, creative seat, credit, ownership or split. Buying or attending does not
automatically follow the host. Blocks, suspensions and opt-outs apply to discovery and delivery
without rewriting legitimate historical tickets or attendance.

### CK-17 — The host's entitlement funds the session

The accountable host/room/workspace entitlement governs initiation and paid capabilities. Invited
Writer-tier Members and account-free guests may participate without each buying a subscription.
The presence of one higher-tier participant must not upgrade an otherwise ineligible room by
accident. Downgrade, payment failure, transfer, co-host and organization behavior requires an
explicit session-safe policy.

Exact subscription names, prices, allowances and feed counts are changeable commercial parameters,
not permanent doctrine.

### CK-18 — Paid Cookups require financial infrastructure, not a checkout button

The processor moves money; Funūn's reconciled, append-oriented ledger explains it. Every retained
cent must map to immutable order terms, tax, processing cost, Funūn fee, host proceeds, refund,
dispute, chargeback, reserve, adjustment and payout state. The host sees expected economics before
publishing and the preserved breakdown afterward. Historical orders are never recalculated using
today's fees.

Funūn stores safe provider/account status and references, not raw bank credentials. Payment and
payout launch requires identity/tax onboarding, webhook idempotency, reconciliation, least-
privilege operations, audit history, support tools and explicit failure policies.

### CK-19 — Funūn must not profit from a failed promised experience

Cancellation, rescheduling, material platform failure, duplicate charges, refunds, disputes and
payout failure need declared behavior before paid beta. When the host cancels or Funūn materially
fails to deliver, Funūn should not retain a technology fee from the failed transaction. Any
unrecoverable processor cost must be allocated transparently rather than hidden as a non-refundable
platform fee.

### CK-20 — Event revenue and music ownership never infer one another

Start with one accountable payout owner per Cookup. Host, co-host, panelist, songwriter and creative
participant roles do not automatically create event-revenue shares. Likewise, a host payout does
not prove authorship and a song split does not define Cookup revenue. Multi-party event payouts,
when built, require explicit commercial allocations and must not be inferred from music rights.

### CK-21 — Paid critique buys defined feedback, never influence

A&R professionals, music supervisors, producers, publishers and experienced writers may host
listening rooms, office hours, brief labs or critiques. Payment buys only the stated access,
duration, submission slot or feedback deliverable. It never guarantees listening beyond the
declared format, placement, representation, signing, playlisting, pitching, licensing, sync
consideration or a business relationship.

If an event later produces a genuine opportunity, that transition is a separate explicit workflow.
Professional affiliation claims must be current and verified before Funūn presents the host as
representing a label, publisher, agency or other organization.

### CK-22 — Unreleased music receives submission-specific distribution consent

Submitting a song for a Cookup or critique authorizes only the playback scope the submitter chose.
Private-room playback, Funūn attendee playback, public Funūn broadcast, external simulcast,
recording, replay and promotional clipping are separate choices. A public event may move to a
holding screen while a private submission is heard off-air.

### CK-23 — Safety controls are part of admission

Guest access and a public audience do not remove the door. Capacity, lobby, revocation, removal,
reporting, blocks, rate limits and abuse controls apply according to event format. Hosts and
co-hosts receive auditable moderation authority, not unrestricted access to private identity or
rights data. A removed participant loses live access without Funūn rewriting legitimate historical
records or executed agreements.

### CK-24 — Audience interactions are not the permanent song record by default

Viewer chat, reactions, polls and questions serve the live audience. They do not become lyrics,
Studio Notes, timed comments, provenance or authorship evidence without a separate deliberate
action by an authorized person. Funūn must decide what belongs in live chat versus its existing
conversation surfaces before building another permanent record.

### CK-25 — Data collection follows the role and moment

Public cards and viewer surfaces collect and reveal only what admission, safety, payment or the
declared interaction requires. They do not expose raw email, phone, address, legal name, PRO/IPI,
splits, payout details or private room membership. Operational alerts remain summary-only and do
not include raw participant records, unreleased file paths or payout credentials.

### CK-26 — Provider neutrality preserves the product

Media, broadcast, payment and notification vendors implement Funūn's product contract; they do not
define it. Identity, event state, consent, ledger, rights separation and audience relationships
remain Funūn records. Vendor selection follows current capability, privacy, reliability, cost,
support, recording, screen/audio, egress and exit/migration evidence.

### CK-27 — A native viewer app must earn its existence

Cookups by Funūn should first prove a focused mobile web/PWA audience experience inside one
ecosystem. A separate iOS/Android viewer shell is justified only when repeat non-creative audience,
mobile viewing, push-notification lift, event supply, replay retention and reviewed store/payment/
moderation economics demonstrate value. Native packaging never authorizes a second identity,
marketplace or ledger.

### CK-28 — Product truth outranks launch enthusiasm

Plans, prototypes, doctrine, migrations and vendor evaluations are not proof of deployed behavior.
Pricing rows, entitlement claims, supported destinations, camera counts, audio quality, audience
capacity, payout timing and “available now” language require live configuration and tested code as
evidence. When capability and copy differ, narrow the copy until the product proves the claim.

## Current approved planning parameters — changeable, not permanent doctrine

The following choices guide the current roadmap but may change through evidence-backed planning
without amending the permanent principles above:

- Member ladder: Writer → Studio → Team → Entourage.
- Studio at the currently planned $19/month is the core Writer's Room video and Cookup-hosting
  unlock; Writer Members and eligible guests may join a host's session without subscribing.
- Team at the currently planned $49/month adds operating scale such as paired secondary cameras,
  co-host/moderator controls, scene switching, saved layouts, larger allowances, social simulcast
  and analytics.
- Standard paid-pass planning economics use a 5% Funūn technology fee with processing shown
  separately. A potential 3% Team fee remains a cost-tested hypothesis, not a public promise.
- Studio's media baseline is one camera per creative participant plus one authorized shared screen;
  exact source, stage, audience, resolution and duration allowances wait for vendor/cost evidence.
- `/cookups` is the planning target for the audience web entry, with Discover, Following, Upcoming,
  Live now, tickets, replays and notification preferences.
- A native Cookups by Funūn app is deferred to the CK-27 evidence gate.
- Specific live-media, broadcast, payment and social-destination vendors remain undecided.

If a parameter changes, update the roadmap, product brief, pricing/entitlement source and verified
marketing copy together. Do not quietly rewrite an order, ticket, consent or prior event record.

## Doctrine compliance checklist for every phase

A Cookups plan is incomplete unless it answers:

1. Which event, participant, source, program and audience records are authoritative?
2. Which actions require a guest credential, persistent identity, paid entitlement or verified
   host?
3. What may each role see and do, and what remains private?
4. Which state changes are explicit rather than inferred?
5. How do block, removal, cancellation, disconnect and provider failure behave?
6. What happens to guest attendance, purchases and contributions after account claim?
7. What consent covers stage visibility, viewer program, external simulcast, recording, replay and
   clips?
8. How does the design prevent attendance/payment from becoming rights or professional access?
9. For a paid action, can the ledger explain gross, deductions, pending funds, available funds,
   refunds, disputes and payouts without provider-dashboard guesswork?
10. Which claims are actually deployed and testable, and which remain planned?

## Publication rule

This file is the authoritative Markdown doctrine while Cookups remains planned. It may be added to
The Playbook as a rich document only with the capability-status warning intact. Remove or narrow
that warning solely through a human-reviewed publication update citing deployed implementation and
verification evidence. Roadmap changes do not automatically republish doctrine, and doctrine does
not automatically publish product claims.
