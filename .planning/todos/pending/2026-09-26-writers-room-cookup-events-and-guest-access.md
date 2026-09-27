# Writer's Room Cookups — scheduled events, audiences, broadcasting and host commerce

**Captured:** 2026-09-26  
**Status:** owner-approved product direction; discussion and planning required before build  
**Depends on:** Writer's Room identity/access boundaries; provider-neutral live-media and broadcast
decisions before those capabilities ship; a reconciled payment/payout foundation before paid
admission ships  
**Related:** `.planning/todos/pending/2026-09-01-writers-room-live-collaboration.md`,
`.planning/todos/pending/2026-09-25-explore-daw-plugin-for-producer-handoffs.md`  
**Governing doctrine:** `.planning/deliberations/cookups-product-doctrine.md`

## Owner-approved decisions

1. **A host can schedule a Cookup.** A Cookup is a time-bound creative event, not another name for
   the permanent Writer's Room.
2. **Cookups need event cards.** The card is the reusable invitation, discovery, RSVP and live-entry
   surface inside and outside Funūn.
3. **A Funūn account is not required to join.** A person may enter an eligible Cookup as a guest,
   participate within the host's rules and decide whether to create an account afterward.
4. **Guest participation is a growth loop.** The experience should demonstrate Funūn's value before
   asking someone to join the platform, then let them claim their contributions and continue the
   relationship without losing history.
5. **Attendance creates no rights.** Hosting, joining, appearing on camera, chatting, uploading a
   file or being present while an idea is made does not automatically create room membership,
   authorship, a credit, ownership or a split-sheet share.
6. **Viewer and creative access are different products.** A viewer watches the host-approved
   program and may receive limited audience interactions. A creative participant may enter the
   interactive stage and use explicitly granted creation capabilities. The host may control and
   price those passes separately.
7. **A Cookup may be free, paid or mixed.** The host decides whether viewer and creative access are
   free, paid, invite-only or application-based. Free access remains a first-class growth model,
   not a trial version of paid access.
8. **Open Studio is a first-class format.** A known songwriter or producer may let anyone watch
   them create live, for free or for a host-set viewer price, while keeping the creative stage
   small and controlled.
9. **A live Cookup may be simulcast externally.** The host can send a curated program feed to
   supported social destinations. External viewers never receive the private Writer's Room,
   backstage conversation, files, rights data or unselected screens.
10. **Paid Cookups require a sound payout layer.** Funūn must explain every cent, show the host the
    economics before publication, keep ticket economics separate from music rights, and rely on a
    compliant payment provider for sensitive payout credentials and regulated money movement.
11. **Studio unlocks core video and Cookup hosting.** The host or room owner's entitlement pays for
    the session; a Writer-tier Member, invited collaborator or account-free guest may join as a
    viewer or admitted creative without subscribing. Team expands capacity and operations rather
    than becoming the first tier allowed to host or earn.
12. **Cookups needs a focused audience destination.** “Cookups by Funūn” should feel standalone to
    viewers and repeat followers while using the same Funūn identity, event, payment, notification
    and trust systems. A separate native viewer app is a later evidence-gated shell, not a second
    marketplace or backend.

These are locked product inputs. Planning may decide architecture and rollout, but must not turn
account creation into a prerequisite for Cookup entry, collapse viewers into creatives, make paid
attendance imply music rights, expose a private room through broadcasting, or launch host charges
before the ledger and payout controls exist.

The governing doctrine is `.planning/deliberations/cookups-product-doctrine.md`. When this brief
contains a changeable product parameter and the doctrine contains a permanent principle, the
principle governs. Neither document is evidence that an unshipped capability is available.

## Product distinction

- **Writer's Room:** the persistent home of a work—lyrics, takes, notes, versions, provenance,
  contributors and rights workflows.
- **Cookup:** a scheduled gathering where people meet to create. It may attach to an existing
  Writer's Room or start without a work and create one after the session.
- **Cookup event card:** the bounded public/shareable description of that gathering. It never
  exposes the underlying private Writer's Room merely because the event is discoverable.
- **Creative stage:** the small interactive surface for the host, co-hosts and admitted creative
  participants. Camera, microphone, DAW screen sharing, uploads, lyrics or notes are capability
  grants, not consequences of buying a ticket.
- **Viewer broadcast:** the scalable host-curated program shown to an audience in Funūn and,
  optionally, on external social destinations. It is not a mirror of the creative stage or room.

A Cookup is therefore the event layer above the Writer's Room. It may use live chat, video, screen
sharing, DAW playback and rapid artifact exchange as those capabilities ship, but it owns the
schedule, invitation, attendance and post-session handoff rather than the media vendor.

## Host scheduling flow

The host can schedule from:

- an existing Writer's Room: **Schedule a Cookup for this song**; or
- the Green Room / Cookups surface: **Start something new**.

The form should support:

- public Cookup title and optional internal/private work association;
- host and optional co-hosts;
- date, start time, timezone, expected duration and optional recurrence later;
- creative brief, genre/vibe, reference and roles wanted;
- participant capacity and optional role-specific seat counts;
- viewer capacity and creative-seat capacity as separate limits;
- access mode: private link, request to join, or public/open subject to capacity;
- pass policy per audience: free, paid, invite, application or complimentary;
- viewer price and creative-seat price where enabled, with the exact host proceeds and fees shown
  before publication;
- lobby/admission setting;
- whether chat, video, screen share and file contribution are enabled;
- whether an existing beat, instrumental, prompt or reference pack is available;
- recording setting, **off by default**, with explicit participant consent before any recording;
- external-broadcast setting: none, full public simulcast, public preview leading to Funūn access,
  or selected destinations;
- replay setting separate from live admission and recording consent;
- cancellation, rescheduling and reminder behavior.

Attaching a private work does not make its title, files, roster, rights state or activity public.
The host chooses the safe public-facing Cookup description separately.

## Cookup event cards

Cookup cards are required, not decorative. They are the unit people share, discover and return to.

### Card content

- Cookup title
- Host avatar, display name and `@handle` when the host has one
- Scheduled date/time rendered in the viewer's timezone
- Duration
- Scheduled / starting soon / live / ended / cancelled state
- Genre, vibe or short creative brief
- Roles wanted
- Seats remaining or full state when capacity is used
- Access label: Open, Request to join, or Invite/link only
- Pass labels and prices: Free to watch, Paid viewer pass, Creative seat, Application required,
  Invite only or the applicable combination
- External-live destinations when the host elects to disclose them
- Guest reassurance: **No Funūn account required** where applicable
- Primary action appropriate to state: RSVP, Request a seat, Join Cookup, Enter lobby, Full, or
  View recap

### Card placements

- The host's Green Room/profile
- A future Cookups discovery surface
- Relevant Green Room/feed activity, subject to visibility
- The associated Writer's Room for authorized members
- Notifications and calendar/reminder surfaces
- A shareable external URL with an Open Graph preview suitable for text, social and email

### Privacy boundary

The external/public card is a projection, not the event or work record. It must never include raw
email, phone, legal name, PRO/IPI, splits, private collaborator data, private work notes, unreleased
audio URLs or storage paths. A host may use a public Cookup title different from the private song
title.

## “Anyone can join” — the exact meaning

Anyone may participate without creating a Funūn account **when the Cookup's access mode, capacity
and host controls permit it**. This removes the account wall; it does not remove the event's door.

- A private Cookup can be joined by a non-member holding a valid, unexpired guest invitation.
- A request-to-join Cookup can accept a non-member applicant.
- A public/open Cookup can admit a non-member directly or through a host-controlled lobby.
- A full, cancelled, ended, blocked or revoked Cookup remains unavailable.
- Hosts and co-hosts can admit, mute, remove and report participants, subject to an auditable
  moderation model.
- “Anyone can watch” never means “anyone can enter the creative stage.” Viewer admission and
  creative-stage admission remain separate even for a free public Cookup.

Do not implement this as one permanent public room URL. Guest credentials must be event-scoped,
time-bounded and revocable. Public entry may mint an event-scoped guest session after appropriate
rate limits, consent and abuse checks. The exact email/one-time-code requirement is a planning
decision, but a display name alone must not be the durable identity for authored contributions.

## Guest experience and acquisition loop

### Before joining

The guest sees the event card, host, local start time, brief, roles, access rules and what the
session may capture. The primary action says **Join as guest** or **RSVP as guest**, not “Sign up to
continue.” The guest accepts Cookup terms, privacy notice and live-media consent appropriate to the
enabled features.

### During the Cookup

The guest receives an event-scoped identity and only the capabilities granted for that Cookup.
They may participate in enabled chat/video/screen-share and contribute permitted artifacts. They
cannot browse the host's other works, the permanent room, private roster data, rights identifiers,
contracts, splits, payout data or unrelated Member profiles.

### After the Cookup

Do not interrupt the creative session with a signup wall. At the useful moment afterward, offer:

> Keep your contributions, recap and creative connections—claim your Funūn profile.

If the guest joins:

- link the account to the existing guest participant rather than creating a second person;
- preserve attendance, chat/artifact attribution, consent and moderation history;
- let them claim only their own contribution identity;
- retain any explicit invitation into the permanent Writer's Room;
- never transform attendance into a credit, split or ownership claim.

If the guest does not join, the event keeps the minimum lawful/auditable participant and
contribution record under the retention policy; it does not manufacture a public profile.

This is the acquisition loop: **shared card → useful guest session → attributable contribution →
optional account claim → continued collaboration**. Track conversion without dark patterns or
hiding core participation behind signup.

## Cookups audience destination and following

Cookups must serve people who enjoy watching music get made but do not identify as creators. Do not
send that audience through the Sound Vault, splits, Contract Locker, PRO/IPI settings or a fake
artist-profile setup. The near-term product is a dedicated, mobile-first **Cookups by Funūn**
destination inside the same platform, with `/cookups` as the planning target for its canonical web
entry and a PWA-quality experience where practical.

### Audience navigation

- **Discover** — public and eligible Cookups, with safe host/format/category discovery.
- **Following** — upcoming and live events from followed hosts and series.
- **Upcoming** — RSVPs and purchased passes in local time.
- **Live now** — immediate entry to currently available events.
- **My tickets** — orders, admission status, receipts and refund/cancellation state.
- **Replays** — only recordings the attendee is entitled to view and the participants authorized.
- **Notifications** — per-host, per-series and channel/frequency controls.

The public event card remains accessible without an account. A person may attend a free eligible
Cookup or complete guest checkout without creative onboarding. Persistent following, cross-device
tickets, reminders and replay history are the natural moment to offer a lightweight Funūn account.
If the person later becomes a creator, the same identity grows capabilities rather than creating a
second account or losing attendance/purchase history.

### Follow model

An audience member may follow:

- an individual host;
- a recurring Cookup series or collective; and
- later, a genre, format, verified organization or curated topic when recommendation quality and
  moderation justify it.

The first follow prompt should appear after meaningful interest—RSVP, attendance, ticket purchase
or event completion—with clear notification choices. Do not auto-follow someone because a ticket
was purchased or because the viewer appeared in a Cookup. Host and series follows must be
independently removable.

Following is a content-discovery relationship only. It does not create a professional connection,
collaborator-roster entry, Writer's Room membership, creative seat, message permission, credit,
ownership or split-sheet status. Blocks, host/event suspensions and notification opt-outs must be
enforced across discovery and delivery without rewriting historical orders or attendance.

### One ecosystem, not a second platform

The audience surface uses the same:

- Funūn account and guest-to-account claim path;
- host identity and verification state;
- Cookup/event records and canonical URLs;
- follows, blocks, moderation and notification preferences;
- checkout, ticket, refund, ledger and payout records; and
- replay entitlements and consent records.

Hosts create and operate events inside full Funūn. A focused audience shell may offer **Host in
Funūn** or **Become a host** rather than duplicating Writer's Room, rights or payout administration.
Social broadcasts and ads should return to the canonical Funūn event card, where a viewer can join,
buy and follow the host for the next event.

### Future native viewer app decision gate

A separate **Cookups by Funūn** iOS/Android shell may be worthwhile later, primarily for watching,
following, push notifications, tickets, chat/reactions, replays and casting. It must still use the
same identity and backend; do not fork the marketplace, follower graph, host reputation, ticket
library or payout system.

Do not authorize a native app merely because the feature can be packaged as one. Revisit when
evidence shows:

- a meaningful recurring audience that does not use creative tools;
- “host is live” push notifications materially improve attendance;
- mobile is the dominant viewing surface;
- enough recurring event supply exists to keep the destination alive;
- following and replay drive retention between live events; and
- native payment, store-policy, moderation, privacy and support economics have been re-researched
  for the intended jurisdictions at decision time.

The product flywheel is: **social preview → event card → guest attendance → follow host/series →
return for the next Cookup → buy or claim a pass → optionally take a creative seat → eventually
create inside Funūn**. Every arrow is optional and measurable; none may be implemented as a hidden
signup or notification-consent trick.

## Subscription entitlement ladder

Do not create a separate “Cookups plan.” Cookups and Writer's Room video belong in the approved
Member ladder: **Writer → Studio → Team → Entourage**. Entitlement follows the session's accountable
host/owner, not every person in the room. Otherwise one unpaid collaborator would break a paid
host's session and account-free entry would stop being real.

### Writer — free

- Join an eligible Writer's Room video session when invited.
- Join a Cookup as an admitted viewer or creative, including through the guest path.
- Receive a controlled introductory hosting experience if cost testing supports it; the exact
  count/minutes are deliberately not promised yet.
- No independent unlimited video or Cookup-hosting entitlement.

### Studio — $19/month

- Start video in Writer's Rooms the Member owns or is authorized to host.
- Host private or public Cookups with free, paid, invite-only or application-based passes.
- Use the core stage: one camera per creative participant, microphone, chat, one authorized shared
  screen with DAW/system audio where supported, event cards, lobby, basic moderation and attendance.
- Sell viewer and creative passes under the standard Cookup transaction economics.

Studio is the core unlock because it represents active music creation. Do not require Team before a
creator can earn their first dollar; the standard transaction fee already lets Funūn participate in
that success.

### Team — $49/month

- Everything in Studio, with higher cost-tested stage/audience/event allowances.
- Multiple co-hosts and moderators, recurring series and stronger operational controls.
- Paired secondary camera sources, additional simultaneous feeds, production switching and saved
  scene/layout presets.
- Social simulcast, advanced audience/conversion analytics and priority support when those features
  ship.
- Eligibility for improved Cookup transaction economics after the discount is validated.

The candidate Team technology fee is **3% rather than Studio's 5%**, but 3% is not a public promise
until payment, broadcast, support and risk costs are measured. At a two-point difference, the $30
monthly price step from Studio to Team breaks even at approximately $1,500 in monthly ticket sales;
that relationship must be recalculated if either subscription price or fee changes.

### Entourage — custom

- Pooled organizational use for labels, management companies and multi-artist rosters.
- Multiple authorized hosts, scoped roles, negotiated capacity, reporting and support.
- Branded or recurring event programs where agreed.

### Standard Cookup transaction economics

- **5% Funūn technology fee** on successfully retained paid viewer and creative-pass revenue.
- **0% Funūn fee** on free and complimentary passes, collected tax and fully refunded revenue.
- Payment processing and provider costs are shown separately at actual cost.
- **0% Funūn fee on tips initially**, with processing still applicable; revisit only with evidence.
- The buyer sees an all-in price from the event card/checkout rather than a low headline price that
  expands at the final step.
- The host sees estimated proceeds before publishing and the immutable order breakdown afterward.

If a host cancels or Funūn materially fails to deliver the paid experience, Funūn must not profit
from the failed transaction. The refund policy must state how unrecoverable processor costs are
allocated rather than hiding them inside a “non-refundable technology fee.” Jurisdiction-specific
fee, tax and consumer-disclosure rules require counsel review before public launch.

### Entitlement authority still to resolve in implementation planning

The principle is settled; the ownership edges are not. Planning must define the accountable payer
for a personal room, a shared Member workspace, a transferred work, a co-hosted Cookup and an
Entourage organization. Access cannot be granted merely because any participant happens to hold a
higher plan, which would make entitlements bypassable. Likewise, a host downgrade, failed renewal
or suspension must never eject active participants without a deterministic session and event
policy.

## Roles, passes and interaction boundaries

### Host and co-host

The host controls the event policy, program feed, admissions and moderation. A co-host receives
only delegated event controls; co-host status does not automatically create a payment entitlement
or ownership interest in music created during the Cookup.

### Creative seat

A creative seat may include stage camera/microphone, DAW playback or screen share, lyrics/notes,
artifact uploads and other direct creation capabilities. The host can make creative seats free,
paid, application-based, invite-only or a mixture using complimentary codes. Payment secures the
defined access; it never promises a credit, placement, release, collaboration outcome or ownership.

### Viewer pass

A viewer pass sees only the curated broadcast surface and may receive host-enabled reactions,
polls or moderated Q&A. Viewer chat must not silently become authorship evidence or part of the
permanent song record. The host may promote a viewer into an available creative seat through an
explicit grant; when the destination seat costs more, the product must explicitly charge or comp
the difference rather than silently changing the purchase.

### Admission combinations

Pricing attaches to the pass, not to the event as one undifferentiated switch. Supported product
shapes must include:

- free viewing + free/invite/application creative seats;
- free viewing + paid creative seats;
- paid viewing + invite/application creative seats;
- paid viewing + paid creative seats;
- complimentary viewer or creative passes within an otherwise paid event; and
- later, free live viewing with an independently priced replay, if recording and participant
  consent permit it.

A free RSVP still creates an event-scoped admission record so capacity, revocation, moderation and
attendance work consistently. Do not force account creation merely because the pass price is zero.

## Open Studio and scalable audience design

Open Studio lets a songwriter, producer or other creator open the act of making music to a broad
audience. It can be free, ticketed or mixed. The experience should feel intimate without placing
every viewer in the same peer-to-peer media room:

- a small interactive WebRTC stage serves the host and creative participants;
- the host selects cameras, DAW share, approved lyrics or a holding scene for a composed program;
- a scalable broadcast path distributes that program to viewers;
- audience participation uses reactions, moderated questions and deliberate stage promotion; and
- private Writer's Room navigation, notifications, messages, rights fields, files and backstage
  discussion stay outside the program output.

Funūn must not promise low-latency distributed musical performance. Conversation, high-quality
host audio, DAW playback/screen share and rapid exchange of recorded takes come first.

## Multi-camera, shared-screen and program production

Multi-camera support means two related capabilities and planning must not collapse them:

1. **Multiple participants' primary cameras.** Each admitted creative participant may publish a
   camera and microphone, subject to the stage limit. The room may render gallery, focused-speaker,
   side-by-side or host-selected layouts.
2. **Multiple sources from one participant/location.** A producer may pair a phone or other device
   as a named secondary source—such as `Producer desk`, `Keyboard`, `Vocal booth` or `Live room`—
   without creating a second person in attendance or rights/provenance records.

A paired camera device joins through a short-lived, event/room-scoped authorization. Its microphone
and speaker default off to prevent feedback; enabling either is a deliberate action. Removing the
person, revoking the source or ending the session terminates the paired feed. Camera labels are
presentation metadata, not new participant identities.

### Shared screen and DAW audio

Authorized creatives can share a display, application window or browser surface. The desired DAW
experience supports:

- DAW window or whole-display selection;
- camera beside the DAW rather than replacing it;
- host focus/enlarge controls;
- system/application audio where the browser and operating system permit it; and
- a music-oriented audio mode that evaluates stereo capture and reduced speech processing rather
  than assuming noise suppression and echo cancellation are always desirable.

Picture sharing is easier than dependable DAW audio. Do not promise direct Logic, Pro Tools,
Ableton, FL Studio or other application audio until each supported operating-system/browser path is
verified. The product needs a layered fallback:

1. browser-supported screen plus system audio;
2. documented high-quality routing for supported setups;
3. future Funūn producer bridge/plugin or virtual source that sends a DAW output directly; and
4. direct take/stem upload from the DAW to the room when live routing is unavailable, without
   requiring a permanent WAV on the producer's desktop where the integration can avoid it.

### Host production switcher

The host or delegated co-host can compose the program from authorized sources using scenes such as:

- main camera;
- camera + DAW;
- two-person split;
- creative-stage grid;
- lyrics or approved visual surface;
- submitted-song playback;
- holding/emergency screen; and
- public-preview layout.

Creative-stage participants may see more authorized working feeds than the viewer audience. Funūn
viewers and social destinations receive only the currently selected program output. A source being
connected does not put it on stage; being on stage does not put it in the program; being in the
program does not authorize external simulcast or recording. The UI must expose these as four
separate, unmistakable states and log the host/co-host action that changes public distribution.

### Tier and architecture boundary

- **Studio:** one primary camera per participant plus one shared-screen source and simple layouts.
- **Team:** multiple paired sources/angles, more simultaneous feeds, co-host switching and saved
  layouts/scenes.
- **Entourage:** negotiated production capacity, branded scene packages and organizational source/
  operator controls.

The vendor-neutral media architecture must support independent published tracks/sources, an SFU or
equivalent selective-forwarding layer, adaptive subscription/quality, source-specific mute/remove,
device and network recovery, and server/cloud composition or equivalent for scalable viewer/social
outputs. Exact source counts, resolution, frame rate and participant/viewer limits are cost and
device-performance decisions for vendor evaluation, not marketing promises now.

## Social simulcast

Simulcast makes social networks discovery channels for a canonical Funūn Cookup rather than the
place where the event's identity, admission and records live. The host-facing control room should
eventually support destination selection, connection health and immediate stop controls while
producing one intentional outgoing program.

Supported policies:

- **Full public simulcast:** appropriate for a free public Cookup when the host chooses it.
- **Public preview:** a trailer, lobby, opening segment or host-selected excerpt points to the
  Funūn event card for full access.
- **Funūn-only paid broadcast:** the full viewer program stays behind Funūn admission.
- **No external stream:** private or otherwise non-simulcast Cookup.

External broadcast must be impossible to enable accidentally for a private or paid-only program.
Every on-stage participant receives an unambiguous **Broadcasting externally** state. Hosts need
mute, remove, emergency slate and stop-everywhere controls. Recording, replay and short-form clips
remain separate choices with their own permissions. Platform eligibility, ingest methods, terms
and API availability must be re-verified during vendor planning; no destination is promised until
that review is complete.

The event card remains the canonical share target. It carries the local start time, host, format,
remaining seats, pass prices, replay policy and appropriate call to action. External social chat
should initially remain outside the permanent Writer's Room record; a later aggregation feature
requires its own moderation, consent, identity and retention decision.

## Paid admission and payout doctrine

Cookups create a marketplace relationship. Two distinct products must not be conflated:

1. **Funūn-managed payouts:** Funūn collects Cookup admission and pays a verified host through a
   compliant connected-account provider.
2. **Contributor-authorized payout-information sharing:** a contributor deliberately provides
   payment instructions to a label, distributor or manager who will pay outside Funūn. That is a
   separate permissioned product with different consent and audit requirements.

For Funūn-managed Cookups, the governing doctrine is **every cent must be explainable**. The
processor moves money; Funūn's reconciled, append-oriented ledger explains the commercial state.
Each order must preserve an immutable snapshot of:

- ticket/pass type, unit price, quantity and currency;
- discounts, promotional codes and complimentary admission;
- taxes or other required collections;
- processor fee;
- Funūn technology fee;
- host proceeds calculated under the order's original terms;
- refunds and partial refunds;
- disputes, chargebacks, reserves and adjustments; and
- amounts pending, available, paid, failed or reversed, with provider references and an audit
  actor/reason for every manual action.

The host must see the concrete buyer price, estimated host proceeds, Funūn technology fee,
processor fee treatment and applicable tax treatment before publishing. “The host keeps almost
all of it” is a product principle, not sufficient financial disclosure.

Start with **one payout owner per Cookup**. A co-host, creative participant or songwriter is not a
revenue recipient merely because of that role. Multi-party host revenue sharing comes later only
with explicit allocation terms, identity/tax onboarding, deterministic rounding and refund/
dispute behavior; it must never be inferred from song splits.

Suggested money lifecycle:

`order_created → payment_pending → paid → host_earnings_pending → available → payout_pending → paid_out`

Side paths include `payment_failed`, `refunded`, `partially_refunded`, `disputed`, `chargeback`,
`payout_failed`, `reversed` and provider reconciliation exceptions. Collection can occur at
purchase, but host earnings should remain visibly pending until the event and the defined
cancellation/refund policy permit release. Historical orders are never recalculated using current
fees.

Before charging, the host must complete the payment provider's required identity, payout-account,
country/currency and tax onboarding, accept the host/content/cancellation/refund terms and have a
usable payout destination. Additional policy is required for minors, organizations, suspended
hosts, negative balances and high-risk activity. Funūn stores safe provider/account status and
references, not raw bank credentials. Stripe Connect is the current natural rail, but the domain
model and ledger must not depend on provider-only state as their source of truth.

Cancellation, rescheduling, event failure, material broadcast failure, duplicate charges,
no-shows, host removal, disputes and chargebacks need explicit policies before paid beta. Paid
launch also requires reconciliation, idempotent webhooks, least-privilege financial operations,
append-only audit history, support tooling and summary-only operational alerts with no raw payout
credentials.

Ticket economics and music rights remain orthogonal. Paying to watch or create does not buy a song
share; being paid as the Cookup host does not establish authorship; and charging for a creative
seat cannot waive protectable contributions. Credits, ownership, splits and executed agreements
continue through their existing explicit workflows.

## Participant facts that must remain separate

The model and UI must distinguish:

- invited;
- requested a seat;
- admitted / attended;
- host or co-host;
- contributed a file, lyric, note or performance;
- proposed for a credit;
- credit confirmed by the appropriate people;
- invited to the permanent Writer's Room;
- accepted permanent room membership;
- included in a split discussion; and
- signed an executed split or other agreement.

No state silently advances to another. A Cookup host controls the event, not every participant's
rights.

## Event lifecycle

`draft → scheduled → lobby_open → live → wrapping_up → completed`

Terminal side branches include `cancelled` and `ended_early`. Capacity may make a scheduled/live
event `full` without changing its lifecycle. Rescheduling creates a recorded schedule revision and
notifies RSVP'd participants rather than silently moving the time.

After completion, the host can:

1. review attendance and contributed artifacts;
2. keep or discard session artifacts according to consent and retention rules;
3. create a new Writer's Room or attach approved artifacts to the existing one;
4. invite selected participants into the permanent room;
5. propose credits without declaring them;
6. begin a split discussion when appropriate; and
7. publish a privacy-safe recap or schedule the next Cookup.

## Proposed program phases

### Phase A — Scheduled private Cookups, cards and admission identity

- Host scheduling
- Event lifecycle
- Shareable event card and external route
- Calendar/reminder basics
- Account-free guest invitation and event-scoped identity
- Capacity, lobby, revocation and host moderation
- Viewer and creative pass types, initially free/invite/application only
- Entitlement authority and enforcement shape, with Studio as the core hosting unlock and free
  participation preserved
- No video-provider commitment required

This phase deliberately launches no paid admission. It proves event identity, access boundaries and
guest conversion before money depends on them.

### Phase B — Interactive live studio and creative handoff

- Room member and guest presence
- Live text boundary decided against DMs, Studio Notes, timed comments and lyric comments
- Provider-neutral video/voice/screen-share integration
- One primary camera per creative participant and a single authorized screen-share source
- DAW/system-audio capability matrix, music-oriented audio evaluation and artifact-upload fallback
- Camera/screen previews, clear source labels and source-specific mute/remove/rejoin behavior
- Recording off by default and consent-aware
- Connection/rejoin behavior
- Session tray for references, takes, stems, notes and lyric ideas
- Provenance linking artifact, contributor identity, session and destination work/version
- Recap and host review
- Create/attach Writer's Room flow
- Guest account claim without attribution rewrite
- Credit proposal and split-discussion prompts, never automatic rights

### Phase C — Viewer broadcast, Open Studio and social simulcast

- Small interactive stage plus scalable viewer delivery
- Host scene/program controls and high-quality music-oriented audio evaluation
- Team-scale paired secondary cameras, multiple-source switching and saved scene/layout presets
- Explicit source-connected → stage → program → external/recorded state boundaries
- Free public Open Studio format
- Canonical event-card conversion from external destinations
- Full, preview, Funūn-only and no-external broadcast policies
- Broadcast consent/status, emergency controls and destination health
- No paid-only full-stream simulcast leakage

### Phase D — Paid passes, ledger and host payouts

- Free, paid and mixed viewer/creative pass configuration
- Guest checkout without mandatory membership
- Connected-account host onboarding and one payout owner per event
- Immutable order economics and reconciled internal money ledger
- Transparent fee/proceeds preview
- Studio standard 5% technology-fee implementation and a cost-validated decision on any Team
  discount before it is advertised
- Refund, cancellation, reschedule, dispute, reserve and payout-failure handling
- Financial operations, reconciliation, audit and support tooling
- Controlled beta before broad paid-event discovery or advertising

Payment and ledger design may proceed in parallel with earlier phases, but no host may charge until
Phase D's controls are operational and tested end to end.

### Phase E — Discovery, growth and marketplace maturity

- Public/request-to-join cards
- Role/capacity matching
- Applications and host selection where relevant
- Safety, reports, blocks, eligibility and repeat-host controls
- Curated label/publisher/A&R/mentor/challenge formats
- Social campaign attribution, host storefront/history and event trust signals
- Cookups by Funūn audience home: Discover, Following, Upcoming, Live now, tickets, replays and
  notification preferences
- Lightweight audience-account claim without creative onboarding or duplicate identity
- Host and series following kept separate from professional connections and collaborator access
- PWA/mobile-web quality before a native-app commitment
- Replay and clips only after recording, participant and music-rights policies are settled
- Multi-party host revenue allocation only after the one-payee model is reconciled in production
- Native viewer-app decision checkpoint using repeat attendance, notification lift, mobile share,
  event supply, replay retention and reviewed store/payment economics

Start with private shareable Cookups, but do not design Slice 1 so account-free public/request access
requires a different identity model later.

## Non-goals and safety boundaries

- Cookups do not promise latency suitable for geographically distributed musicians performing in
  tight real-time synchronization. Conversation, DAW playback/screen share and rapid take exchange
  come first.
- Video recording is not automatic and cannot be enabled secretly by the host.
- A guest link is not permanent Writer's Room access.
- Discoverability never exposes the attached unreleased work.
- Cookups do not replace Studio Notes, timed comments, lyric comments or direct messages without an
  explicit conversation-surface decision.
- The live-media vendor remains undecided. Zoom Video SDK, Daily, LiveKit, Agora and other options
  may be evaluated later against UX, cost, privacy, recording, screen share and infrastructure
  requirements.
- The broadcast vendor remains undecided. Build requirements around a composed program output,
  scalable viewer delivery and supported-destination egress rather than a named provider.
- Free large-audience Cookups still create media cost. Audience, duration, host-plan or sponsorship
  limits must be set from measured economics rather than silently degrading free events.
- Paid access must not ship as a thin checkout placed in front of an unreconciled event or payout
  state machine.

## Planning questions still open

1. Which Cookup access modes ship in Slice 1: link-only, request-to-join, open, or a subset?
2. Does a public guest verify email before entering, before contributing, or only when claiming?
3. Which fields appear on a card for a host with no public profile?
4. Can a guest join video/chat only, or also upload artifacts in Slice 1?
5. What participant cap is safe and affordable before vendor selection?
6. What happens to guest-authored chat/artifacts when the guest never claims an account?
7. What age, community-safety and recording-consent rules apply by jurisdiction?
8. Who may publish a recap and which participants must approve names, images or excerpts?
9. Which audience interactions ship first: reactions, polls, moderated Q&A or stage requests?
10. What high-quality audio and DAW-routing experience is achievable across supported devices?
11. Which social destinations and ingest methods are eligible at launch, and what failure behavior
    applies when one destination drops while the Funūn stream remains healthy?
12. What preview length and visual treatment protects a paid Cookup while still converting an
    external audience?
13. What technology-fee model, processor-fee presentation, payout delay and reserve policy pass
    legal, tax, risk, support and host-economics review?
14. What objective thresholds trigger free-event audience/duration limits or sponsored capacity?
15. Does replay become its own pass, and how are participant, composition, master, sample and
    platform permissions represented before it can be sold?
16. Which browsers/operating systems can capture each supported DAW's system audio without an
    additional driver, and what exact UX appears where they cannot?
17. How many published/subscribed video sources can target devices sustain before the UI must
    automatically reduce quality, pause thumbnails or refuse another angle?
18. Which persistent audience actions require account claim, and how does a guest ticket/follow
    intent merge without duplicate identity or lost notification consent?
19. Do viewers follow hosts, series or both in the first release, and which notification events are
    opt-in by default versus individually enabled?
20. What identity is visible in audience chat/reactions, especially for someone who has no public
    creative profile?

## Definition of a successful first release

A Funūn host schedules a private free Cookup, defines viewer and creative access, and shares its
event card with a person who has no Funūn account. That person enters through a valid guest path
without signing up. Capacity, lobby, revocation and removal work; the guest sees only the event
scope; attendance creates no room or rights status; the completed event can create or update a
Writer's Room through an explicit host review; and the guest can later create an account that
claims their existing participant identity without duplicating or rewriting contribution history.

The broader program succeeds when that same event model safely supports a free or paid Open Studio,
a curated Funūn viewer broadcast, optional social preview/full simulcast, transparent checkout and
a reconciled host payout—without exposing the private room, confusing audience access with creative
rights, or making membership mandatory for attendance.
