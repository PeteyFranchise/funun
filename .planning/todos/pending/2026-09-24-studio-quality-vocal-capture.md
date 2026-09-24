---
created: 2026-09-24T00:00:00Z
title: Studio-quality vocal capture — record a keeper vocal in-app, deliver it to a DAW
area: catalogue
severity: medium
status: pending
discuss: candidate for an upgraded (paid) artist tier — see "Tier question" below
---

## The question this answers

A vocalist has a good microphone and a real chain — preamp, interface, maybe a
compressor. **Can they record a keeper vocal into Funūn that a producer pulls into their
DAW for the final mix?**

Yes. The storage layer is already right and the encoder already exists. Three things in
today's capture path would each, on their own, disqualify a master.

Owner-raised 2026-09-24 during the bench-01 design session.

## What is wrong today

### 1. The microphone constraints are bare

`components/catalogue/HumCaptureButton.tsx:121`

```js
navigator.mediaDevices.getUserMedia({ audio: true })
```

Bare `true` lets the browser apply its defaults: echo cancellation, noise suppression,
and **automatic gain control**. AGC rides the level on a sustained vocal — it pumps.
That alone makes the result unusable as a keeper, and it is invisible until a producer
opens it.

### 2. Every candidate codec is lossy

`lib/catalogue/hum-capture.ts` — `CANDIDATE_MIME_TYPES` is
`audio/webm;codecs=opus`, `audio/mp4`, `audio/aac`.

Opus is excellent for speech and streaming and wrong for a stem someone will EQ and
compress. What it discards cannot be recovered.

### 3. `encodeWav()` writes 16-bit

`lib/catalogue/record-over-beat.ts` — `bytesPerSample = 2`, `setInt16`, format chunk
declares 16.

16-bit is a *delivery* format. You track at 24-bit so a singer can set a conservative
level and still have resolution left.

## What is already right

- `lib/storage/index.ts` — `ALLOWED_AUDIO_TYPES` already accepts `audio/wav`,
  `audio/x-wav`, `audio/flac`. The storage layer is ready for lossless.
- `MAX_AUDIO_SIZE = 250MB`. Five minutes of 24-bit/48k mono WAV is ~43MB; stereo ~86MB.
- `tus-js-client` already handles resumable upload of large files.
- Web Audio processes internally in **32-bit float**, so nothing is lost before encoding.
- `encodeWav()` exists and needs a wider sample format, not a rewrite.

## The four changes

1. **Constraints for the master path:**
   `{ echoCancellation:false, noiseSuppression:false, autoGainControl:false,
   channelCount:1, sampleRate:48000, deviceId:<the interface> }`
   Then **verify with `track.getSettings()`** — browsers do not always honour these, and
   silently ignoring that is exactly how a pumping vocal ships. If the browser refuses,
   say so and fall back to the upload path rather than recording something unusable.

2. **Do not use `MediaRecorder` for the master path.** Capture raw Float32 through an
   **`AudioWorkletNode`**, which runs on the audio thread so a UI repaint cannot glitch
   the take. (`ScriptProcessorNode` is deprecated and will glitch.) `MediaRecorder`
   stays perfectly fine for hums and rough takes — this is a second, parallel path, not
   a replacement.

3. **24-bit (or 32-bit float) in `encodeWav()`**, preserving the true sample rate.

4. **Never normalise or re-encode server-side.** Deliver the bytes that arrived.

## The limit software cannot fix — and does not need to

**Monitoring latency.** Browser round-trip is typically 20–60ms, unusable for tracking a
vocal. The answer is not code: every decent interface offers **direct hardware
monitoring**. The singer listens through the interface, not through the app.

This is onboarding copy, not engineering — but it has to be said plainly, or people will
try to monitor in the browser and conclude the feature is broken.

## The genuinely hard part

**Capture offset.** When the beat plays through the browser and the vocal is captured
through the browser, there is a device-dependent gap (output latency + input latency +
buffer). Uncompensated, every take lands a few milliseconds late and the producer nudges
it by hand forever.

Needs a one-time loopback calibration per device. The hook already exists:
`clipTimelineWindow()` in `record-over-beat.ts` accepts a `timingOffsetMs`.

## What the producer should receive

- **24-bit WAV at the true rate**, unprocessed and un-normalised
- **Spotted to a known timeline position** so it drops in aligned rather than by ear
- **The room's timed notes as DAW markers** — `renderAudacityLabels()` and
  `renderMarkerCsv()` already exist in `lib/catalogue/take-export-formats.ts`
- **BPM and key** from the song passport

## Tier question — to discuss

**This is a candidate for an upgraded artist plan, and that conversation has not
happened yet.**

Note what is different about it: every paid-tier artefact in the repo today is
**buyer-side** —

- `docs/buyer-paid-tiers-and-content-protection.md`
- `.planning/phases/24-buyer-onboarding-self-serve/24-RESEARCH-paid-tiers.md`
- `.planning/deliberations/post-beta-ai-pricing-and-governance.md`

A studio-capture tier would be the **first artist-facing paid feature**, which is a
distinct business-model question, not an extension of the buyer tiers. Things to settle
before building:

- Is lossless capture the paid line, or is the paid line **storage** (24-bit WAV is
  ~20× a compressed hum, and 250MB per track adds up fast)?
- Does a free account still get lossless *upload* while paying for lossless *capture*?
  Charging for one and not the other is hard to explain.
- Phase 24 self-serve is already ON HOLD pending a business-model discussion — fold this
  into that conversation rather than opening a second one.
- Strategic framing worth weighing: this changes Funūn from where a song is *sketched*
  to where a keeper vocal is *cut*. That may be worth more as an acquisition feature
  than as a paywall.

## Why this is implementation-ready

Three of the four changes are parameters on code that already ships. The fourth
(AudioWorklet) is a new, self-contained module that does not touch the existing hum path.
The offset calibration is the only genuinely new engineering.

## Files

- `components/catalogue/HumCaptureButton.tsx` — the bare `getUserMedia({audio:true})`
- `lib/catalogue/hum-capture.ts` — `CANDIDATE_MIME_TYPES`, all lossy
- `lib/catalogue/record-over-beat.ts` — `encodeWav()` at 16-bit, `clipTimelineWindow()`'s
  `timingOffsetMs`
- `lib/storage/index.ts` — `ALLOWED_AUDIO_TYPES`, `MAX_AUDIO_SIZE`
- `lib/catalogue/take-export-formats.ts` — marker export for the producer's DAW
- `lib/song-passport/schema.ts` — BPM/key travelling with the delivery
