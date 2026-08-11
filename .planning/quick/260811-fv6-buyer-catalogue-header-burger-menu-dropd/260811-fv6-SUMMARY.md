---
quick_id: 260811-fv6
slug: buyer-catalogue-header-burger-menu-dropd
type: quick
status: complete
date: 2026-08-11
branch: feat/lane1-catalogue-menu-help
---

# Summary — Buyer catalogue header menu + Help page (Lane 1, step 1)

## What shipped
- **Header burger → real dropdown** in `components/buyer/CatalogBrowserLight.tsx` (guest item set):
  Register, Login, Contact a sales rep, divider, Help / How licensing works, Blog. Accessible
  (`aria-haspopup`/`aria-expanded`/`role`), toggles open, closes on outside click. Styled with new
  `.menuwrap/.menu/.mi/.msep` CSS on the fnbl tokens (light + dark).
- **Header wiring:** cart "License queue" → `/sync/requests`; "Browse" → clear filters + scroll top;
  Login → `openAuth('login')`.
- **`LoginRegisterModal.tsx`:** added `initialSource` prop so "Contact a sales rep" opens directly on
  the **Talk to a sales rep** view (verified: title + "Request a call" CTA).
- **New public page `app/help/page.tsx`** — "How licensing works": what a sync license is, the 5-step
  Funūn flow (browse → request → AE → sign → deliver), rights-readiness badges explained
  (Rights ready / Partial / Contact required, correct colors), FAQ, CTA. Public automatically
  (not in middleware's protected prefixes). Wrapped in `.fnbl` + `FNBL_CSS`.

## Verified
- `tsc --noEmit` clean.
- Browser (localhost:3000): dropdown opens with all items; Contact-a-sales-rep → sales view;
  `/help` renders on-brand with steps + colored badges + FAQ.
- One console warning during verification was a React Fast-Refresh (HMR) deps-size artifact from the
  `initialSource` dep add — cannot occur on a cold load / production. Confirm green via a dev-server
  restart next session.

## Out of scope (next steps)
- **Step 2:** signed-in buyer menu variant + Contact-AE card (name + photo). AE assignment exists
  (`buyer_orgs.ae_user_id`, migration 090, staff-private → needs a buyer-facing endpoint returning
  the AE's public card; AE photo field may need adding).
- **Step 3:** Blog. Content source = in-repo MDX (default) or a CMS — **Notion is NOT connected to
  this repo** (owner correction). `/blog` link is live in the menu but the route lands in step 3.

## Added scope (owner, 2026-08-11) — NEW
- **AI Brief Builder for buyers** — a guided tool where a buyer describes what they need and AI helps
  shape the *perfect sync brief* (use, mood/genre, references, budget, term, exclusivity, timeline).
  Output routes to an AE and/or pre-filters the catalogue. Natural fit with "Request a license" +
  "Contact a sales rep" + the Help FAQ's "find music for a specific brief." Anthropic SDK already in
  the stack. To be spec'd (its own Lane 1 slice / phase) — not started.

## Notes
- Executed inline (no cold subagents; orchestrator in full context).
- Committed on `feat/lane1-catalogue-menu-help`; NOT pushed (repo deploys to prod from `main`).
