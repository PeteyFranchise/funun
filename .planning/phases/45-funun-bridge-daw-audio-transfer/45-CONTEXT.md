# Phase 45: Funūn Bridge — Direct DAW Audio Transfer — Context

**Captured:** 2026-09-23
**Status:** Owner-approved direction; architecture/security gate first
**Migration:** Unassigned/human-gated; migration 228 unavailable

## Goal

Remove manual Desktop/find/upload/delete work by giving producers a secure companion that watches a
managed drop location, uploads completed DAW bounces directly to the chosen authorized Writer's Room, and
pulls selected protected takes into a managed import location.

## Locked decisions

- **BR-01:** Desktop companion first; do not begin with AU/VST3/AAX plugins.
- **BR-02:** Promise **no manual file handling**, not literal zero local bytes. Use a managed crash-safe
  spool and remove it only after server verification according to user retention settings.
- **BR-03:** Each DAW project may map to one default room. Cross-room send uses an explicit chooser and
  confirmation; filenames never determine destination.
- **BR-04:** Only rooms where the current user has server-verified contribute authority are targets.
- **BR-05:** Upload displays target, label, format, duration, sample rate, bit depth, channels, size, and
  checksum before send, unless the user deliberately enables a scoped trusted auto-send mode later.
- **BR-06:** Use signed resumable direct-to-storage upload and server completion verification; Bridge never
  receives a service-role key or reusable storage credential.
- **BR-07:** Device authorization is revocable, least-privilege, OS-keychain protected, and independently
  auditable. Choose PKCE/deep-link versus device-code flow during architecture; do not invent auth.
- **BR-08:** Provenance records Member, device, room/work, source application when trustworthy, original
  filename display only, audio facts, checksum, and time—never a raw local filesystem path.
- **BR-09:** Reverse pull places an authorized asset in `Funūn Imports/<work>` for deliberate DAW import.
  Automatic insertion onto a DAW track is plugin work.
- **BR-10:** Current 50 MB take ceiling is not studio-WAV-ready. Define reference-mix/full-bounce/stem/master
  classes, formats, limits, retention, and billing before widening it.
- **BR-11:** Storage attribution/admission, concurrency, incomplete-upload cleanup, checksum/deduplication,
  and quota ownership are launch prerequisites.
- **BR-12:** OS rollout order is an owner decision based on beta-user DAW/OS evidence; no platform is
  silently deprioritized during implementation.
- **BR-13:** Upload/pull does not grant custody, ownership, authorship, credit, approval, or delivery rights.

## Existing foundation

The browser already requests an authorized upload intent, uploads directly to private Supabase Storage,
and completes a `work_versions` row. Phase 45 reuses the control-plane doctrine, not the browser cookie/
Blob implementation. Supabase supports signed TUS resumable upload; Bridge needs a separate device auth
and hardening boundary.

## Hard blockers

No implementation beyond research scaffolding until the owner approves OS order, auth flow, code-signing/
update channel, local spool retention/encryption, audio classes/limits, storage attribution dependency,
and support/privacy posture.
