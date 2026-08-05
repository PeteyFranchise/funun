# Phase 23: Buyer Onboarding — Public Login / Register & Sales-Assisted Access - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning (one open decision to settle first — see Decisions)
**Source:** owner direction + Marmoset login-modal reference screenshot

<domain>
## Phase Boundary

Give prospective buyers a way to get INTO the buyer portal from the **public Browse
Catalogue** (Phase 22's `isPublic` browse). Clicking **Login** opens a Funūn-styled
modal — in the light `.fnbl` design, with the Funūn name/colors/logo — that offers:
1. **Log in** (existing buyers: email/password, remember-me, forgot-password),
2. **Register** — a **self-serve** path to a buyer account created from the browse page, and
3. **Talk to a sales rep** — a sales-assisted path for buyers who need to be set up.

This closes the current gap: today there is **no self-serve buyer signup** — buyers are
admin-created (16-03, D-12: an admin makes the buyer org + invites the first org-admin).
This phase adds the buyer-facing on-ramps.

**In scope:** the login/register modal (light `.fnbl`, Funūn logo), wiring the public
catalogue's Login button to open it, the login flow, the self-serve register flow (per the
decision below), the sales-rep request path, and the Funūn logo adoption.

**Out of scope / deferred:** the deep CRM/sales tooling behind "talk to a sales rep" (beyond
capturing the lead); anything the onboarding-model decision defers.
</domain>

<decisions>
## Implementation Decisions

### Design
- Funūn-styled modal in the **light `.fnbl` system** (Phase 22 tokens), matching the Marmoset
  login-modal layout from the reference: centered card, **Login** title, email + password
  fields, "Remember me", a gradient **Submit**, "I forgot my password!", a divider, a
  **Register** CTA ("Don't have an account? …"), and a resend-activation line. Adapt copy +
  add the **"Talk to a sales rep"** path. Use the **Funūn wordmark/logo** (not "Marmoset").
- High fidelity to the buyer light design; the modal opens over the browse (scrim, like the
  License modal already in `CatalogBrowserLight.tsx`).

### Access paths
- **Two on-ramps:** (1) self-serve **Register** from the browse; (2) **Talk to a sales rep**
  (a request/contact path) for buyers who need assisted setup.

### OPEN DECISION — the buyer onboarding model (settle BEFORE building Register)
Does self-serve **Register** create a live buyer account **instantly**, or is it
**request-and-approve** (sales/admin-gated)? This must reconcile with:
- **16-03 / D-12** — buyers are currently **admin-created** (admin makes the org + invites the
  first org-admin); `handle_new_user`'s buyer branch (migration 080) deliberately early-returns
  with **NO** `user_profiles`/org row, assuming an admin created the org first.
- **Phase 15 capability model** — artist → instant, **industry → admin-approved** (D-02). Buyers
  may follow the industry pattern (request → approve) rather than instant self-serve.

Sub-questions: does a self-serve buyer get a **personal org auto-created**, or **join/request an
existing** org? Individual vs company signup? If instant, `handle_new_user`'s buyer branch + a
`buyer_orgs`/`buyer_members` bootstrap must change. If request-and-approve, Register becomes a
lead-capture that routes to the same admin `/admin/buyer-orgs` approval the sales path uses.
**Recommendation to confirm:** request-and-approve (consistent with the industry-account gate and
the current admin-created model) — "Register" and "Talk to sales" both create a buyer *request*;
an admin/sales rep provisions the account. Revisit self-serve-instant post-beta.

### Logo
- Adopt one of the **5 wordmark explorations** (`~/Desktop/Fununbuyerbrowse/FUNUN Logo Exploration.html`)
  — the FUNŪN wordmark where the 2nd U is the Arabic Nūn (bowl + dot). Pick one; used in the modal + top-nav.

### Claude's Discretion
- Modal component structure; whether register/login/sales are tabs or stacked sections.
- The sales-rep request storage (reuse an existing table vs a small `buyer_signup_requests`),
  pending the onboarding-model decision.
</decisions>

<canonical_refs>
## Canonical References
- Reference screenshot: Marmoset login modal (owner-provided) — layout to mirror, Funūn-branded.
- `components/buyer/CatalogBrowserLight.tsx` — the public browse; its `isPublic` **Login** button
  (currently a no-op) is the trigger; its License-modal/scrim pattern is the modal analog.
- `components/buyer/fnbl-theme.ts` — the light token system for the modal.
- `app/(buyer-portal)/buyers/access/page.tsx` — the existing buyer access landing.
- `lib/buyers/createBuyerAccount.ts` + `app/api/admin/buyer-orgs/route.ts` — how buyers are
  created today (admin path) — the register/sales flows reconcile with this.
- `supabase/migrations/080_buyer_orgs_members.sql` — `handle_new_user` buyer branch + buyer tables.
- `app/(auth)/signin/` — existing Supabase auth pattern.
- `~/Desktop/Fununbuyerbrowse/FUNUN Logo Exploration.html` — the 5 logo options.
</canonical_refs>

<deferred>
## Deferred Ideas
- Self-serve-instant buyer signup (if the decision lands on request-and-approve for beta).
- Full sales CRM integration behind "talk to a sales rep" (beyond lead capture + notify).
- OAuth/SSO buyer login.
</deferred>

---

*Phase: 23-buyer-onboarding-login-register*
*Context gathered: 2026-08-05 — owner direction + Marmoset login reference*
