# Writer's Room Live Sessions and DAW Bridge — Approved Product Plan

**Owner approval:** 2026-09-23
**Execution:** Phases 44, 44.1, 44.2, 45, 45.1, and 45.2
**Status:** Direction locked; implementation and migrations have not started

## Bottom line

The Writer's Room should become a live creative workspace: recognizable room members, truthful room
presence, persistent room chat, optional video/audio sessions, a producer's DAW screen as the shared
stage, synchronized playback of protected takes, and eventually direct DAW audio transfer through a
desktop companion. Video is valuable because it keeps collaborators inside the song, but Funūn should
not build or operate its own WebRTC network for beta. Screen-share/call audio is reference-quality and
must never become the uploaded master or evidence of approval. Funūn Bridge—not a multi-format plugin—is
the first practical path to removing manual export/find/upload/delete work. Native plugins, high-fidelity
live DAW audio, and call recording remain explicit research/legal gates rather than implicit scope.

## Locked decisions

1. **Room members** is the heading; **These people have access to this Writer's Room.** is the supporting
   copy.
2. Show all room-member profile pictures with initials fallback and a compact overflow treatment.
3. A green status means **Here now: this Member currently has this Writer's Room open**, not general
   platform activity and not proof they are actively writing.
4. Room chat is persistent and room-scoped. It is distinct from anchored section comments, durable Studio
   Notes, and private/cross-project direct messages.
5. Video is an optional **Start a session** action. Nobody auto-joins and idle page presence costs no video
   minutes.
6. Beta live sessions use a managed provider. Daily, LiveKit, Twilio, and Zoom Video SDK are documented
   options, not a choice. Provider selection requires a dedicated comparison and owner decision when this
   phase begins. No self-hosted SFU.
7. Initial sessions support camera, microphone, device selection, participant strip, DAW-window screen
   sharing, network/reconnect states, and at most six participants.
8. Screen sharing is for seeing the DAW. Browser/system audio varies by browser/OS and WebRTC media is
   reference-quality; it is not a master, durable take, rights fact, or approval.
9. Recording, transcription, and call compositions are off in v1.
10. Stored takes may be played in sync during a call. Each authorized listener streams the protected
    asset; WebRTC control messages synchronize transport but do not retransmit the master through the call.
11. Existing “major DAW support” means marker-file compatibility today, not a native connector. The
    connector is new work.
12. **Funūn Bridge** is the first connector: secure desktop sign-in, project-to-room mapping, a managed
    Funūn Drop folder, resumable upload, explicit target confirmation, provenance, and protected pull.
13. The useful promise is **no manual file handling**, not literally zero local bytes. Bridge uses a safe
    temporary spool for crash recovery and deletes it only after server verification under the chosen
    retention setting.
14. A room may be changed only through an explicit chooser listing currently authorized rooms. Never
    infer a cross-room destination from a filename.
15. Native plugin research evaluates AU/VST3 first and AAX after demand/requirements validation. Network
    work never runs on a realtime audio thread.
16. Chat, calls, screen sharing, synchronized playback, and uploads do not establish authorship, credit,
    splits, ownership, approval, custody, or delivery authority.
17. Automated large-file DAW ingestion is blocked on storage attribution/admission and resumable-upload
    controls. Production is at migration 227; migration 228 is reserved and unavailable.

## Product experience

### Room header

```text
Room members                                      2 here now
These people have access to this Writer's Room.

[avatar ●] [avatar ●] [avatar] [avatar] [+4]     [Start a session] [Room chat · 3]
```

- Green is accompanied by accessible **Here now** text.
- A camera badge means **In the session**; it does not replace the room-presence light.
- Pending invitations are visibly separate from accepted room members.
- Member popovers show full display name, `@handle`, role/access, and presence, solving same-first-name
  ambiguity without exposing private identifiers.

### Room chat

- Desktop: collapsible right rail that remains available while the room scrolls.
- Mobile: focused drawer/bottom sheet.
- Initial messages support text, replies, `@mentions`, timestamps, and minimal reactions after scope check.
- No generic attachment store in v1. Audio/documents remain in structured room surfaces.
- **Convert to Studio Note** and **Attach to section/take** bridge lightweight conversation to durable
  context without automatically turning every message into a formal record.

### Live session

- The DAW window/screen share becomes the large stage; cameras are small participant tiles.
- Prefer a selected application/window to a whole monitor and warn about notifications/other unreleased
  projects before full-screen sharing.
- Chat remains available beside the call.
- A call can become audio-only, but camera and screen share are never required.
- Cost/session controls: one active session per work, max six participants, duration warning, idle timeout,
  owner-visible usage, feature flag, and provider-usage alerts.

### Synchronized take playback

- The host selects an existing authorized take and controls play/pause/seek.
- Every participant fetches the same protected object through existing access rules.
- Realtime messages carry take ID, transport state, position, and monotonic server/client timing; periodic
  correction handles drift and reconnect.
- The selected take remains the durable source. The video vendor never becomes the master-audio store.

### Funūn Bridge

```text
DAW bounce → managed Funūn Drop → Bridge validates/spools → signed resumable upload
          → server verifies → take/version + provenance → Writer's Room/chat/Diary
```

Bridge shows target room, take label, format, duration, sample rate, bit depth, channels, size, and
checksum before **Send to this room**. It supports **Choose another room** from an authorized list and
requires an extra confirmation for cross-room delivery. The reverse path places a protected selected
take in `Funūn Imports/<work>` for deliberate DAW import; direct insertion into a DAW track is plugin work.

## Current repository baseline

- Private, membership-authorized Supabase Realtime presence already exists
  (`components/catalogue/WriterRoomPresence.tsx:68-155`;
  `supabase/migrations/143_writer_room_presence_authorization.sql:23-58`). It untracks when the document
  becomes hidden and heartbeats only while visible.
- Current browser take upload already uses a signed two-step control plane and sends bytes directly to
  private Supabase Storage rather than through Next.js (`lib/catalogue/version-upload-client.ts:55-133`).
- Upload intent verifies `contribute` access and fails its limiter closed
  (`app/api/works/[workId]/versions/upload-intent/route.ts:23-35`).
- The Writer's Room per-take cap is 50 MB (`lib/catalogue/audio-mime.ts:11-13`), insufficient for many
  five-minute 24-bit WAV bounces; Phase 45 must not pretend that limit supports studio workflows.
- The major-DAW direction is currently marker export, with Audition verification still gated and Logic,
  Ableton, FL Studio, and Pro Tools intended eventually
  (`.planning/todos/pending/2026-09-16-audition-export-withheld-pending-format-verification.md:33-55`).

## Provider and cost posture — snapshot 2026-09-23

Provider pricing changes, so execution must re-check official pages before contracting or launch.

- [Daily](https://www.daily.co/pricing/video-sdk/): 10,000 video participant-minutes free monthly, then
  $0.004/participant-minute at the first paid tier; audio-only is $0.00099/participant-minute. Any video
  or screen share makes the session video-priced. Cloud video recording is $0.01349/recorded minute plus
  $0.003/minute storage.
- [Twilio Video](https://www.twilio.com/en-us/video/pricing): $0.004/participant-minute, up to 50
  participants, unlimited TURN; recording is $0.004/recorded participant-minute, composition $0.01/minute,
  and storage $0.00167/GB/day after the first 10 GB.
- [LiveKit Cloud](https://livekit.com/pricing): Ship begins at $50/month and includes 150,000 WebRTC
  minutes plus 250 GB downstream transfer; overages are $0.0005/minute and $0.12/GB at the captured tier.
- [Zoom Video SDK](https://www.zoom.com/en/video-sdk/): this is the customizable Video SDK, not the
  Zoom Meeting SDK. Zoom currently advertises 20 free Build Platform credits, participant-time billing,
  and flexible credit plans on its [developer pricing page](https://zoom.us/pricing/developer), but the
  public page does not expose a stable credit-to-session-minute conversion in its static content. The
  comparison must verify the live checkout/quote and recording or ancillary-service rates before
  selection. Zoom is technically credible because its Web SDK supports a Funūn-owned interface,
  on-demand sessions, [screen and computer-audio sharing](https://developers.zoom.us/docs/video-sdk/web/share-browser-options/),
  chat/data channels, APIs, webhooks, and short-lived JWT authorization. It also exposes Web
  [original-sound high-fidelity/stereo switches](https://developers.zoom.us/docs/video-sdk/web/audio-sound-options/);
  those are reasons to test it with DAWs, not evidence that WebRTC audio is master quality.

Illustrative four-person, 90-minute room: 360 participant-minutes, or $1.44 marginally at Daily/Twilio.
Daily's free allowance covers about 27 such rooms/month. One hundred such rooms use 36,000 participant-
minutes: about $104 at Daily after the free allowance and $144 at Twilio. LiveKit stays inside its minute
allowance but may exceed included bandwidth depending on adaptive video and screen-share bitrate.
Zoom uses the same participant-time shape for session measurement, but its current credit conversion must
be inserted into this model only after it is verified at the owner checkpoint.

Cost controls are product requirements, not an operations afterthought. Do not record by default, auto-
connect idle viewers, leave abandoned sessions alive, or ship without per-room duration and global usage
alerts.

## Audio-transfer economics and limits

A five-minute stereo WAV is roughly 86 MB at 24-bit/48 kHz and 173 MB at 24-bit/96 kHz. Phase 45 must
define distinct policies for reference mixes, full-quality bounces, stems, and masters; use signed
resumable TUS upload; and integrate quota/ledger ownership before automation.

[Supabase's current documentation](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
recommends TUS for files over 6 MB and supports signed resumable upload tokens. Current Pro billing includes
100 GB storage and 250 GB egress, then lists $0.021/GB-month storage and $0.09/GB uncached egress
([billing reference](https://supabase.com/docs/guides/platform/billing-on-supabase)). Storage itself is
usually inexpensive; repeated downloads, accumulating stem versions, and uncontrolled sync are the risks.

## Build-effort posture

These ranges are planning estimates, not commitments:

- Managed-provider proof of concept: 3–7 engineering days.
- Production beta live sessions without recording: approximately 4–8 engineering weeks.
- Recording/moderation/call-history expansion: another 3–6 weeks after legal/privacy decisions.
- Secure Mac/Windows Bridge beta: approximately 6–12 weeks after the architecture/security gate.
- Credible multi-format AU/VST3/AAX plugin: multiple months plus permanent host/OS QA; do not schedule it
  until Bridge usage validates the demand.

## Phase map

### Phase 44 — Room members, presence, and persistent chat

Compact member identity/presence first, then an authorized persistent room conversation, desktop rail,
mobile drawer, notifications, moderation/retention decisions, and note/section bridges.

### Phase 44.1 — Managed live-session pilot

Managed-provider comparison, owner selection, provider abstraction, server-minted room tokens,
session/cost lifecycle, camera/mic/
device controls, DAW-window screen share, access revocation, reconnect, and owner UAT. No recording.

### Phase 44.2 — Synchronized protected-take playback

One authoritative host/transport protocol, protected per-listener playback, drift correction, reconnect,
and live-session integration. Never relay master audio through the video call.

### Phase 45 — Funūn Bridge

Threat model and OS checkpoint, device authorization/revocation, signed resumable upload, managed spool,
room mapping, explicit cross-room targeting, provenance, pull-to-folder, storage attribution, and staged
Mac/Windows rollout.

### Phase 45.1 — Native plugin and high-fidelity live-audio research

Research only: AU/VST3/AAX feasibility, SDK/licensing/signing, audio-thread safety, host QA, bus capture,
original-sound/reference modes, and demand evidence. No plugin implementation authorization.

### Phase 45.2 — Session recording research

Research/legal only: consent jurisdictions, retention/deletion/export, recording access, creative-evidence
copy, storage/cost, provider behavior, and participant controls. No recording implementation authorization.

## Cross-cutting safety and rights rules

- Validate room membership at token mint, join, reconnect, upload intent, completion, download, and every
  persistent chat mutation—not only at page load.
- Removing/blocking a person stops new chat, session, playback, upload, and download access promptly.
- Provider secrets and desktop device credentials remain server/OS-keychain only.
- Do not log media tokens, signed URLs, local file paths, unreleased titles, chat content, or raw audio
  metadata in summary alerts.
- Calls and chat are creative context. They cannot silently alter splits, authorship, permissions, custody,
  release authority, or Song Passport facts.
- Any migration is unassigned until execution-time preflight and remains human-gated. Never claim it was
  applied because SQL or code was authored.

## Success measures

- Members can recognize who has access and who is actually here without false online claims.
- Collaborators can coordinate in the room without duplicating comments, Studio Notes, or DMs.
- A producer can share a DAW window and the room remains usable on poor/reconnecting networks.
- Participants can audition one protected take in sync without transmitting master audio through WebRTC.
- A producer can bounce once into a managed location and send the result to the correct room without
  browsing for a file, while retaining explicit confirmation and crash recovery.
- Video/storage spend is attributable, bounded, observable, and feature-flagged.
- No workflow claims chat, presence, call participation, or upload activity establishes rights.
