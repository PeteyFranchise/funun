# Zoom Video SDK vs Meeting SDK for the Writer's Room

**Captured:** 2026-09-23
**Purpose:** Decision-time reference for Phase 44.1
**Decision status:** Informational only. Zoom is not selected, and no Zoom SDK is approved for installation.

## Plain-language difference

- **Meeting SDK puts a Zoom meeting inside Funūn.** The experience retains Zoom's meeting model and much
  of its familiar interface and behavior.
- **Video SDK gives Funūn Zoom's real-time media infrastructure as building blocks.** Funūn designs the
  interface, session behavior, authorization, and relationship to the Writer's Room.

The simplest analogy is: Meeting SDK rents a furnished Zoom conference room; Video SDK supplies the
plumbing and electricity while Funūn designs the studio.

Zoom's own product material describes Meeting SDK as displaying the familiar Zoom meeting/webinar
experience inside an app, while Video SDK supports a custom interface over Zoom's audio, video, screen
sharing, chat/data, API, and webhook infrastructure:

- [Zoom Video SDK product page and SDK distinction](https://www.zoom.com/en/video-sdk/)
- [Zoom Video SDK documentation](https://developers.zoom.us/docs/video-sdk/)
- [Zoom developer pricing and customization FAQ](https://zoom.us/pricing/developer)

## Meeting SDK

### What Funūn would gain

- The fastest route to a familiar, meeting-shaped experience.
- Mature Zoom meeting controls and behaviors with less custom call-interface work.
- A potentially useful disposable prototype if the only question is whether Members want video at all.

### What Funūn would give up or complicate

- The room would feel more like Zoom embedded in Funūn than a native creative workspace.
- Zoom meeting concepts could compete with Funūn's existing room membership, `Here now` presence,
  persistent room chat, notifications, and access-removal rules.
- It is a less natural fit for a layout where the DAW share is the stage, collaborators are a compact
  strip, and Funūn take/Bridge controls sit beside the session.
- Meeting chat, participants, scheduling, and recording affordances create product pressure to duplicate
  or blur Funūn's systems even if those features are disabled.

The build-effort advantage is an inference from accepting more of Zoom's supplied meeting experience; it
must still be validated in a spike rather than assumed.

## Video SDK

### What Funūn would gain

- A Funūn-owned **Start a session** flow instead of a Zoom-meeting metaphor.
- Funūn room membership can remain the authority for token minting, joining, reconnecting, removal, and
  session controls.
- The desired DAW-centered layout can be built directly: large application/window share, small cameras,
  room chat beside it, and later synchronized-take and Bridge controls.
- On-demand sessions, screen sharing, computer-audio sharing, data channels, APIs, webhooks, and
  short-lived authorization fit the provider-neutral Phase 44.1 design.
- Zoom exposes Web original-sound `hifi` and `stereo` modes worth testing for musical collaboration:
  [Zoom Web sound options](https://developers.zoom.us/docs/video-sdk/web/audio-sound-options/).

### What Funūn must build and own

- Accessible camera, microphone, device, participant, share, reconnect, network, leave, and end controls.
- Server-side session authorization, short-lived credentials, webhook verification, forced removal,
  usage reconciliation, cost caps, idle cleanup, observability, and incident behavior.
- Browser/OS capability detection and honest fallback copy. Zoom documents computer-audio sharing in
  Chrome and Edge, while non-Chromium browsers cannot capture computer audio through `getDisplayMedia`:
  [Zoom browser-sharing options](https://developers.zoom.us/docs/video-sdk/web/share-browser-options/).
- Regression work when Zoom enforces SDK minimum versions.

Video SDK avoids operating Funūn's own SFU, but it does not make the feature a low-effort embed.

## Conditional recommendation

**If the owner selects Zoom as Funūn's managed media vendor, Video SDK is the stronger product fit for the
Writer's Room.** Funūn is designing a persistent creative workspace, not adding a generic meeting. The
DAW-as-stage layout, Funūn-controlled room authorization, persistent Funūn chat, synchronized protected
take playback, and future Bridge controls all benefit from owning the experience.

Meeting SDK remains coherent for a very fast throwaway demand prototype, or if the owner deliberately
wants the standard Zoom meeting experience. It is not the preferred production architecture for the
currently approved Writer's Room design.

This is only a recommendation between Zoom's two SDK families. It does **not** select Zoom over Daily,
LiveKit, or Twilio, and it does not authorize package installation or production integration.

## What must be tested before a Zoom decision

1. Two-to-six-person custom Video SDK sessions using the exact proposed Funūn layout.
2. DAW application/window legibility and system-audio behavior across macOS/Windows and
   Chrome/Edge/Safari, including explicit unsupported states.
3. Voice mode versus original-sound `hifi`/`stereo`, with measured latency, artifacts, echo behavior,
   CPU, and bandwidth. Neither result is a master-quality transfer.
4. Removed/blocked Member behavior across token mint, join, reconnect, and mid-session revocation.
5. Abandoned-session termination, idle timeout, webhook reorder/retry, spend caps, usage reconciliation,
   and provider-outage recovery.
6. Accessibility, mobile viewing, screen-share privacy warnings, bundle/runtime impact, and any
   `SharedArrayBuffer` or security-header consequences.
7. Confirmation that provider recording, transcription, summaries, retained provider chat, PSTN, and
   guest entry remain disabled.
8. A side-by-side demo and cost model against Daily, LiveKit, and Twilio before the owner selects a vendor.

## Pricing caution

As of 2026-09-23, Zoom advertises 20 free Build Platform credits, participant-time session measurement,
and flexible credit plans. Its public pricing page does not expose a stable credit-to-session-minute
conversion in static content. Phase 44.1 must verify the current checkout or written quote, included
credits, overage conversion, support, regional/data terms, and any ancillary-service charges rather than
using Zoom's older 10,000-free-minute/$0.0035 historical model.

## Decisions deliberately left open

- Which managed provider Funūn will use.
- Whether Zoom's measured musical-audio behavior is competitive.
- Budget, maximum duration, idle timeout, alerts, and beta population.
- Whether a disposable Meeting SDK prototype would add evidence beyond the Video SDK comparison.
- Recording. Phase 45.2 remains a separate legal/product research gate.
