# Spike 006b: SignWell Mobile Embedded Signing

**Type:** comparison (with 006a docuseal-mobile-embed)
**Status:** VALIDATED ✓ (UX at phone viewport; API-key-gated items listed)
**Date:** 2026-07-18
**Tags:** esign, signwell, mobile, embedded, sync-licenses
**Deliberation:** `.planning/deliberations/esign-split-sheet-economics.md` · **Feeds:** 16-09 (SignWell adapter)

## Validates

Given SignWell's embedded signing, when exercised at a 375×812 phone viewport, then a signer completes fields and a drawn signature without leaving the host page.

## Method

Exercised SignWell's own live embedded demo (`signwell.com/api-demo/embedded-signing/`) — a fake "WORKFLOW" host app that launches the real SignWell signing widget in an embedded iframe — at 375×812, as a signer: intake form → embedded widget → guided signing → drawn signature → Agree & Finish. No account created; test data only.

## Investigation Trail

1. Demo intake (host-app side): name/email/license fields, mobile-clean, CONTINUE TO SIGN → SignWell widget loads **in the same page** (host header remains visible throughout — genuinely embedded).
2. **Initial render glitch:** on first load the document overflowed horizontally at 375px (text off right edge, horizontal scrollbar). It settled to fit-to-width after interaction. Worth re-checking on a real phone — a first-paint overflow is exactly the kind of jank studio signers would hit.
3. Signing model is **document-centric with guided navigation**: a "CLICK TO START" affordance plus yellow field tabs ON the document (vs DocuSeal's bottom-sheet wizard). Pre-filled fields (name, license terms, email) merged into the doc correctly.
4. Tapping the Sign field tab opened the signature modal. NOTE: the field tab is a small on-document target (~60×20 CSS px) — precision-tap territory on a phone, and the automation initially missed it too. DocuSeal avoids this class of problem by never making the document a tap surface.
5. Signature modal: near-full-screen on mobile, **Type / Draw / Upload** tabs, ink color choices, clear. Drew 3 strokes via pointer drag → registered, Save.
6. Saved signature landed on the document; a "Final Step" banner appeared with a large **AGREE & FINISH** (Electronic Signature disclosure linked). Tapped → flow complete.
7. **Post-completion, the DEMO redirected to SignWell's marketing site.** In a real integration the documented `completed` / `closed` events fire to the host app, which controls post-signing UX — but 16-09 must verify the widget does NOT navigate the host page on completion and must handle the completed event explicitly. Flagged into the 16-09 notes below.

## Results

| Check | Result |
|---|---|
| Completes in-page (no redirect during signing) | ✓ — host header visible throughout signing; redirect occurred only post-completion and is demo-site behavior to verify in 16-09 |
| Usable at 375px | ✓ with caveats — initial horizontal overflow on first paint; on-document field tabs are small targets |
| Drawn signature with pointer/thumb | ✓ — modal canvas, registered strokes |
| Signature alternatives | ✓ — Type / Draw / Upload (no camera capture, unlike DocuSeal) |
| Field navigation | ✓ — guided CLICK TO START + on-document tabs; no wizard; fewer steps for a doc with few fields, more hunting for many-field docs |
| Legal disclosure | ✓ — Electronic Signature Consent linked at final step |

**Verdict: VALIDATED** for the sync-license use (16-09): embedded signing works at phone size and the polish is buyer-appropriate. For the SPLIT-SHEET studio scenario, DocuSeal's bottom-sheet wizard is meaningfully more phone-native than SignWell's document-centric tabs — see comparison in the deliberation doc.

## API doc-read findings (for 16-09)

- Auth: **`X-Api-Key` request header** (confirmed via SignWell's own developer resources).
- Embedded signing: two-step — API returns an embedded signing URL; SignWell's JS library displays it in iframe/modal. Documented events: **`completed`**, **`closed`**.
- Webhooks: HMAC signature verification is stated to exist, but the exact header name/scheme is still not confirmed from public docs → **16-09 Task 1's blocking doc-read checkpoint stands; do not guess the HMAC scheme.**
- No keyless sandbox: all API calls, including test mode, need a real key (matches 16-09's user_setup note).

## API-key-gated items (for the account-holder pass)

- Multi-party async signing (3 collaborators, separate links, days apart).
- Real-device touch + cellular load; WebView/PWA behavior.
- Confirming the widget never navigates the host page on completion (vs the demo's marketing redirect).
- Webhook event delivery + signature verification against a test endpoint.
