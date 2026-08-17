# Watermark pipeline — approach + decision record

Status: **LOCKED — owner-approved 2026-08-16** at the Task 2 blocking-human checkpoint
(31-01-PLAN.md). The recommended default below was approved as-is (in-house, no package
installed). Vercel tier confirmed **Pro** (live billing dashboard, 2026-08-16) — so the Hobby
10s function cap does NOT bind. Async/pre-computed rendering stays the chosen design (cost/UX +
keeping a clean-master transcode out of the request path), but as a good-practice choice, not a
forced requirement. 31-12's async implementation stands unchanged.

This is a decision record, not code. The type contract lives in
[`lib/watermark/provider.ts`](./provider.ts) — that is what 31-12 (render pipeline) and
31-13 (shareable player) actually import.

## What this pipeline is for

R12 (shareable Selects player) requires that every audio stream and download served to an
unauthenticated token viewer be watermarked — never a clean master (T-31-01). Two distinct
renders, per D-01:

- **Stream preview** — a subtle **audible** tag, present while the recipient plays the track
  in the browser player. Must stay unobtrusive enough that a genuine 30s+ evaluative listen
  (R13's qualified-listen bar) still reads as a real listen, not a degraded one.
- **Forensic download** — a **clean-sounding, inaudible** watermark, present in the
  full-length (or AE-capped, per D-02) file the recipient can download to test-sync into a
  rough cut. Per D-03, the forensic payload encodes **both** the Selects and the
  recipient/share-token, so a leaked file traces back to exactly who it was issued to.

## Recommended default (Claude's discretion — owner confirms)

- **Audible-tag character (stream preview):** a brief, soft, sub-audible tonal pulse at fixed
  intervals — not a spoken voice tag. This is the `31-UI-SPEC.md` "Watermark character
  (Claude's discretion)" default, carried over here as the concrete implementation target.
  **Flagged A2** — the owner locks the exact tag character (pulse cadence/frequency, or an
  alternative) at the Task 2 checkpoint before 31-12 builds it.
- **Forensic approach (download):** in-house, ffmpeg-class tone-injection for the stream tag,
  paired with a spread-spectrum / LSB-style forensic encode for the download, rather than a
  third-party forensic-watermarking service/SDK. Rationale: no vendor lock-in, no per-render
  cost, and the payload shape (Selects + share-token) is fully under our control. **Flagged
  A2** — the owner confirms in-house vs. third-party service at the same checkpoint. If a
  third-party package is named as an alternative, it MUST clear the Package Legitimacy Gate
  (npmjs.com/authoritative-source verification) before any install — see Prohibitions below.

## Architecture decision: async, pre-computed, never inline

Per RESEARCH.md Pitfall 5 (Vercel Hobby tier, 10s `maxDuration`, not re-verified live this
session — A4): a per-share forensic render is compute-heavy audio transcoding and cannot run
synchronously inside a request handler. The contract in `provider.ts` reflects this:

- Both `renderStreamPreview` and `renderForensicDownload` are **async** (`Promise`-returning).
- Renders are **pre-computed** — rendered once per `(track, share_token)`, either at Send time
  (when the AE shares a Selects) or lazily on first open, and the result is **stored to a
  private bucket**.
- The player and download link are served via a **signed URL** against the stored render —
  never a live/inline transcode per request.
- `WatermarkRenderStatus` (`pending` / `ready` / `failed`) exists so the UI can show an
  interim "processing" state instead of blocking on the render.

**Corrected 2026-08-16 (live-dashboard check):** Vercel tier is **Pro** (Pro Plan — Active),
NOT Hobby — an earlier checkpoint answer said Hobby, but the billing dashboard shows Pro. So the
10s function cap does NOT bind. Async/pre-computed rendering remains the design (keeps a heavy
clean-master transcode out of the request path, and is better for cost/UX), but it is a
good-practice choice rather than a hard requirement. 31-12's async implementation stands; the
interface does not change either way.

## Sequencing (A2)

Per the phase objective: the stream-preview tag + the play/react/approve player flow ship
first on the async-render architecture above. The forensic-download feature is sequenced as a
**fast-follow** if the watermarking spike (in-house tone-injection + forensic encode) runs
long. This keeps the rest of Slice 1 (Selects, the shareable player, engagement tracking)
unblocked regardless of how the forensic-download spike resolves.

## Prohibitions (enforced by this plan)

- **No watermarking/forensic package is installed by this plan.** `provider.ts` declares an
  interface only — no method bodies, no imports of any not-yet-installed package.
- **No package installs until the Task 2 blocking-human checkpoint clears them.** Any
  `[ASSUMED]`/`[SUS]` package proposed for 31-12 must be verified against an authoritative
  source (npmjs.com/package/&lt;name&gt; — publish date, download counts, source repo) per the
  Package Legitimacy Gate before install. A `[SLOP]` package is forbidden outright.
- **No synchronous per-request forensic render.** See Architecture decision above — this is a
  T-31-SC / Pitfall-5 mitigation, not a style preference.

## What 31-12 builds against this record

1. Implement `WatermarkProvider` (the interface in `provider.ts`) using whichever approach the
   owner locks at the Task 2 checkpoint.
2. Wire `renderStreamPreview` / `renderForensicDownload` into the Send-time or lazy-render flow
   described above.
3. Store outputs to a private bucket (mirroring `lib/storage/index.ts`'s bucket conventions);
   never the public asset bucket.
4. The player (31-13) signs and serves only the returned `WatermarkRenderResult.path` — never
   `WatermarkRenderInput.masterAudioPath`.
