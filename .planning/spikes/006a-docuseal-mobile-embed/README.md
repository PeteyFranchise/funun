# Spike 006a: DocuSeal Mobile Embedded Signing

**Type:** comparison (with 006b signwell-mobile-embed)
**Status:** VALIDATED ✓
**Date:** 2026-07-18
**Tags:** esign, docuseal, mobile, embedded, split-sheets
**Deliberation:** `.planning/deliberations/esign-split-sheet-economics.md` (research item 1b)

## Validates

Given DocuSeal's embedded signing form, when exercised at a 375×812 phone viewport (fields, scroll, drawn signature), then a signer completes the flow without leaving the page, redirects, or pinch-zoom archaeology.

## Method

Exercised DocuSeal's own public direct-link demo template (`https://docuseal.com/d/LEVGR9rhZYf86M` — the exact template their React/Vue/Angular embed samples reference) in a real browser at 375×812, driving it like a signer: email gate → field wizard → drawn signature → completion. This is the same `DocusealForm` component Funūn would embed, running on DocuSeal's cloud.

No account was created; no real personal data entered (test email `funun-spike-test@example.com`, test name). The demo template is published by DocuSeal for exactly this purpose.

## Investigation Trail

1. `docuseal.com/embedding` at mobile width — page renders SDK samples for React/Vue/Angular/JS + web component (`<docuseal-form>` via `cdn.docuseal.com/js/form.js`). Samples reference a live public template slug → used it directly as the test target.
2. Entry: email-to-start gate, single field + full-width START. Clean at 375px. (Embedded usage can prefill `data-email`, skipping this screen entirely — Funūn would pass the collaborator's email.)
3. Field flow is a **bottom-sheet wizard**: document preview on top with the active field highlighted (dashed outline + auto-scroll), active field's input in a fixed bottom sheet with a full-width NEXT and step dots (4 steps). The signer NEVER hunts for fields on the PDF or pinch-zooms. This is the pattern that makes phone signing viable.
4. Name field: typed value appeared on the document in real time; wizard auto-advanced with auto-scroll to the date field on page 1.
5. Date field: **"Set Today" one-tap button** + native date input fallback. Tapped once, done.
6. Optional image field: clearly labeled optional, skippable with NEXT.
7. Signature step: large full-width canvas (~341×116 CSS px), with THREE capture modes — draw, **type-to-sign** (Tt), and **camera capture** (photograph a wet signature — notable for the studio scenario). "Sign and Complete" disabled until signature exists; eSignature Disclosure linked above the button.
8. Drew 3 strokes via pointer drags → canvas registered ink (verified programmatically: 6,114 ink pixels; submit button flipped enabled). Pointer-drag = touch on a real device.
9. Submit → **"Document has been signed!"** completion sheet with Download and Send-copy-via-email actions. Drawn signature visible on the document. Zero navigation events left the page across the entire flow.

## Results

| Check | Result |
|---|---|
| Completes entirely in-page (no redirect) | ✓ — one URL, start to finish |
| Usable at 375px without pinch-zoom | ✓ — bottom-sheet wizard; document is reference, not input surface |
| Tap targets | ✓ — full-width buttons, large inputs throughout |
| Drawn signature with pointer/thumb | ✓ — registered ink, enabled submit |
| Signature alternatives | ✓ — type-to-sign + camera capture + draw |
| Multi-field navigation | ✓ — auto-advance + auto-scroll + step dots; fields also jumpable via header chips |
| Decline path | ✓ — present with reason capture |
| Legal disclosure | ✓ — eSignature Disclosure linked at signature step |
| Load weight on cellular | ⚠ INCONCLUSIVE — transferSize mostly opaque in this harness; retest on a real phone/cellular during the key-gated phase |

**Verdict: VALIDATED.** DocuSeal's embedded signing at phone size is genuinely good — the bottom-sheet wizard + Set-Today + camera-capture details are exactly the studio-with-a-phone affordances the locked requirements (D-18b) demand. The mobile-UX disqualification test does NOT disqualify the front-runner.

## Caveats / not proven here

- This exercised DocuSeal's **cloud demo**; a self-hosted instance's UX should be identical (same open-source form component) but was not tested.
- White-labeling (removing DocuSeal branding from the embedded form) not verified — pricing/plan question, belongs to 007.
- Multi-party async flow (3 collaborators signing days apart, each via their own link) not exercised — needs an account/API; covered by the harness pattern in 006b or a follow-up keyed spike.
- Real-device touch (vs pointer emulation), cellular load time, and WebView/PWA behavior still deserve a 10-minute pass on an actual phone when an account exists.
