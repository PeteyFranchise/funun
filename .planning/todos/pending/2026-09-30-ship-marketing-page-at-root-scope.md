# Ship the marketing page at `/` — build scope

**Written:** 2026-09-30
**Decision:** raw-document adapter (Codex, `CODEX-RESPONSE-260930-marketing-page-port-to-root-route.md`)
**Governing requirement:** the shipped page is an **exact replica** of the frozen bench render.
**Size:** phase, not a quick task — 5 work units, one of which is a genuine unknown.

---

## FROZEN BASELINE

Do not start from a re-measurement. Implementation is against this revision:

```
source : private/bench/marketing.html
sha256 : faf382a95319b2c304de57a0bc8c3c894997ab33619c96b754f5821d34c61157
lines  : 2133   (css 775 · js 923 · 3 inline <script> blocks)
frozen : 2026-09-30T16:58:29Z  (re-frozen; the 15:52 freeze was invalidated by the CTA edits)
manifest: private/bench/baseline/FROZEN-INVENTORY.txt
```

If `marketing.html` changes, re-freeze and re-baseline. An inventory from an earlier
revision is not a baseline — this bit us already: figures quoted to Codex were stale
because the file was still being edited.

---

## ⚠️ THE TWO THINGS THAT WILL BREAK IT

### 1. The fonts are blocked by the app's CSP — **highest fidelity risk in the port**

Verified 2026-09-30:

| | |
|---|---|
| app policy | `style-src 'self' 'unsafe-inline'` · `font-src 'self' data:` |
| page loads | stylesheet from `fonts.googleapis.com`, woff2 from `fonts.gstatic.com` |
| result at `/` | **both blocked** — every heading falls back to a system font |

Neither Codex nor the original scoping caught this. It is invisible on the bench (no CSP
there) and only appears once served under the app's policy.

**Fix: self-host, do not widen the CSP.** Self-hosting preserves exactness, keeps the
policy tight, and removes a third party from the critical render path. Widening
`style-src`/`font-src` to Google would loosen the policy for the entire application to
serve one page.

Production needs only **Inter** plus **the one chosen display face** (Grand Hotel at
freeze time). Yellowtail, Monoton and Lobster exist solely for the bench's hero type
switcher and must not ship.

**Match the metrics or the layout moves.** Download the exact woff2 files the frozen
render loads, keep the same `unicode-range` subsets and the same `font-display: swap`,
and verify text wrapping is unchanged — a different subset or version shifts line
breaks, which is design drift by another name.

The four woff2 URLs in the frozen render are recorded in the inventory file.

### 2. The asset manifest cannot be produced by grepping

- literal grep of the source → **40** paths
- the rendered page with the carousel exercised → **45** resources

Paths are constructed in JS (`src="'+d.shot+'"` at :2023, `src="'+esc(v.a.src)+'"` at
:1392) and carousel panels only fetch their image when their tab is selected. A grep
silently misses whatever is behind an interaction.

**Produce the manifest from the rendered page**, with every carousel tab clicked, every
popover opened and the pricing toggle flipped — then diff it against the files actually
copied into `public/`. A missing asset is a broken image on the live homepage.

---

## THE FIVE WORK UNITS

### 1 · Assets and fonts
Self-host Inter + the chosen display face; copy the ~41 images to `public/marketing/`;
generate the manifest from the rendered page; assert every referenced path exists.

### 2 · Sanitize the artifact → `assets/marketing/landing.html`
**Strip, do not toggle.** The production document *is* the shipped state; it must not
contain `body[data-ship]`, the bench toolbar, either preview button, the toggle script,
dev warnings, the four `.flag` notes, `.ph-art` / `.phnote` labels, or internal
commentary. CSS-hidden text still ships and is still readable.

**Preserve CSS that affects visible geometry.** `main{padding-top:44px}` (line 48)
survives independently of the toolbar it was spaced for. Removing the toolbar does not
authorize "correcting" that. Defer unused-CSS cleanup until parity is proven.

Add real `<head>` metadata (no Metadata API here): title, description,
`<link rel="canonical">` to the public root, Open Graph, Twitter card, icons,
`lang="en"`, viewport.

Replace the sign-in dialog per the ruling below.

Insert `nonce="__CSP_NONCE__"` on each of the 3 inline `<script>` blocks.

### 3 · Route handler → `app/marketing-document/route.ts`
Read the artifact, replace the placeholders with the `x-nonce` request header value,
return `text/html; charset=utf-8` with `Cache-Control: private, no-store`.

**Do not parse and reserialize the HTML** — a serializer introduces drift on its own.
String replacement only.

**Fail closed** if: `x-nonce` is absent, any placeholder survives, any `<script>` lacks
a nonce, or the replacement count is not exactly 3.

Direct requests to this path must redirect to `/` or return non-indexable, so the
document is never indexed at two URLs.

Follow the `outputFileTracingIncludes` pattern at `next.config.mjs:37-51` so Vercel
bundles the artifact.

### 4 · Routing — anonymous only
```
middleware: rewrite '/' → '/marketing-document'  ONLY when user is null
authenticated '/' → falls through to app/page.tsx, role redirects unchanged
```

**Do not move role routing into middleware.** Codex's catch, verified: `middleware.ts`
runs `if (user && !isAuthRoute)` to fire collaborator-claim completion for users whose
rows are not yet linked. An authenticated redirect inserted above that block silently
skips the side effect — a collaborator never gets linked, and no test sees it.

### 5 · Verification — `scripts/verify-marketing-artifact.mjs` + parity
Assert: artifact hash matches the frozen source modulo the sanitization diff; exactly 3
nonce placeholders; **zero** occurrences of `data-ship`, `class="flag"`, `ph-art`,
`phnote`, `data-authopen`, `Bench 02`; every manifest asset present in `public/`; no
`fonts.googleapis.com` or `fonts.gstatic.com` reference survives.

Then parity: screenshot the frozen bench shipped-state and the deployed `/` at several
widths and diff. Codex is right that this bounds rather than proves — but for a
*document-preserving* port the residual risks are environmental and enumerable (fonts,
asset bytes, base-URL resolution, nonce placement, header differences), not "did a human
recreate 775 lines of CSS correctly".

---

## THE SIGN-IN RULING (accepted, with its cost stated)

One credential surface, at `/signin`. Keep the nav treatment, make it a plain link,
remove `data-authopen` (2 occurrences) and its handler, remove the mock dialog and its
password field.

**This is an explicit interaction-fidelity exception.** Resting appearance is identical
— the dialog is closed by default — but clicking Sign in navigates instead of opening
the approved modal. Codex's trilemma, which is real: you cannot simultaneously keep the
exact modal, maintain one live credential form, and serve the document outside React.
Reusable modal authentication is a prerequisite project, not a last-mile port task.

---

## SETTLED 2026-09-30 — both pre-build questions answered

1. **Canonical host: `https://www.funun.studio`.** Align the two hardcoded strings
   (`lib/auth/postSignInPath.ts:22`, `app/email-preview/page.tsx:10`); both are
   inconsequential — `APP_ORIGIN` is only the base for a self-consistent same-origin
   check, and email-preview is a dev-only page. The 11 test files that mention the bare
   host are **fixtures, not assertions** — leave them.
   **The change with real effect is `NEXT_PUBLIC_APP_URL` in Vercel**, which builds the
   links in invites, workspace invitations, split-sheet approvals and profile URLs.
   Owner action, not a code change.
2. **`/` is public during beta.** Confirmed by the owner.

### ⚠️ Consequence: "Start free" is not true during beta either

Signup is **invite-gated**. `app/(auth)/signup/page.tsx` has a `GateState` of
`'denied'`, and an uninvited visitor gets:

> **A secure invitation link is required** — Ask your inviter to resend your link, or
> join the waiting list and we'll reach out when a spot opens.

…followed by a waitlist email form, then *"You're on the list."* That landing is well
built and graceful. The problem is upstream: a **public** marketing page whose buttons
all say **"Start free"** promises an account a stranger cannot get. This is the same
defect as the "Start a trial" CTA the owner already rejected, and consistency says fix
it the same way.

**This also breaks an assumption in the paid-tier todo**
(`2026-09-29-paid-tier-interest-capture-before-stripe.md`), which says someone choosing
a paid tier ends by *"creating a free profile"*. During invite-only beta **there is no
free profile for a stranger** — they reach the same waitlist.

That is not a setback; it simplifies the design and it fits machinery that already
exists. During beta:

- **Every** CTA — free or paid — lands on the existing waitlist gate.
- The **tier they chose** is the extra signal, carried through and recorded.
- `artist_waitlist` already has dedupe, unsubscribe and an opt-out page.
- The consent line belongs exactly here, at the waitlist form, where the person can
  see what they are joining.

**Owner decision needed:** what the CTAs should say while signup is invite-gated.
"Request an invite" and "Join the waitlist" are both honest; "Start free" is not.

## TECHNICALLY EXACT ≠ READY TO PUBLISH

Separate approval. Still on the page: placeholder testimonials (three dead composers,
owner-approved as obviously-not-real), dead social and contact destinations, and
`href="#"` controls. Also unresolved: the Spotify mark over "not Spotify editorial", and
the paid-tier interest capture
(`2026-09-29-paid-tier-interest-capture-before-stripe.md`) which the pricing CTAs now
promise.

## RELATED

- `.planning/reviews/CODEX-RESPONSE-260930-marketing-page-port-to-root-route.md` — the
  decision and the full residual-risk analysis, with a verification table
- `.planning/reviews/CODEX-RESPONSE-260926-marketing-page-editor-doctrine.md` — who may
  change marketing copy; bears on any future rewrite
- `private/bench/baseline/` — frozen hash and inventory
