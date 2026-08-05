# Phase 23: Buyer Onboarding · Model A — Sales-Led B2B Access - Context

**Gathered:** 2026-08-05
**Status:** Discussion in progress — Model A specifics being nailed down before planning
**Source:** owner direction + Marmoset login-modal reference screenshot

<domain>
## Phase Boundary

Funūn's buyer side will run **two onboarding models** (owner, 2026-08-05), built in sequence:
- **Model A — Sales-Led B2B (THIS phase):** larger, Funūn-brokered deals with businesses —
  ad agencies, film/ad production companies, brands with dedicated marketing teams. Buyers are
  **vetted/provisioned**, not self-serve.
- **Model B — Self-Serve Creator (Phase 24, later):** smaller content creators self-serving
  **instant** accounts (Musicbed / Marmoset-self-serve shape). Out of scope here.

This phase delivers **Model A + the shared front-end foundation both models reuse**:
1. Open the **Browse Catalogue to public (logged-out) browsing** — today `/buyers/catalog` walls
   logged-out visitors to `/buyers/access`; the `isPublic` "Login" button in `CatalogBrowserLight`
   is scaffolding for a public browse that does not exist yet.
2. The Funūn-styled **Login/Register modal** (light `.fnbl`, Funūn logo), opened from the public
   browse's Login button.
3. **Existing buyers log in** (Supabase email/password).
4. **New-buyer interest → lead pipeline:** both **Register** and **Talk to a sales rep** create a
   buyer **lead**; an admin/BD converts it into a real buyer account via the existing admin path
   (`/admin/buyer-orgs` → `createBuyerAccount`). No instant self-serve accounts in Model A.

**In scope:** public browse mode/route; the login/register modal (shared); existing-buyer login +
forgot-password; the Register + Talk-to-sales lead capture + where leads land + BD notification;
Funūn logo adoption; org-first (B2B) account shape.

**Out of scope / deferred to Phase 24 (Model B):** self-serve **instant** account creation, the
`handle_new_user` buyer-branch rewrite, subscription/checkout + plan tiers, the transact-gate for
unvetted buyers.
</domain>

<decisions>
## Implementation Decisions (settled)

### Onboarding model — RESOLVED
- Model A = **request-and-approve**. Register + Talk-to-sales both create a buyer **lead**; an
  admin/BD provisions the account. This reconciles cleanly with 16-03/D-12 (buyers admin-created)
  and Phase 15 (industry accounts admin-approved) — **no auth surgery** needed. Self-serve-instant
  is Model B (Phase 24).

### Public browse
- The catalogue becomes **browsable logged-out**. The modal's **Login** button lives there. (Exactly
  what a logged-out visitor can DO — see open questions.)

### Account shape
- Model A buyers are **companies/teams** — an **org-first** B2B account (a buyer brings their team).

### Design
- Funūn light `.fnbl` modal mirroring the Marmoset reference (Login title, email/password,
  remember-me, gradient Submit, forgot-password, divider, Register CTA, resend-activation) —
  Funūn-branded, plus a **"Talk to a sales rep"** path, Funūn wordmark. Opens over the browse
  (scrim, like the License modal already in `CatalogBrowserLight.tsx`).

### Logo
- Adopt one of the 5 wordmark explorations (`~/Desktop/Fununbuyerbrowse/FUNUN Logo Exploration.html`).
</decisions>

<open_questions>
## Open — Model A specifics to settle in discussion (before planning)

1. **Register vs Talk-to-sales — one pipeline or two?** Both produce a lead. Are they two front
   doors into one `buyer_signup_requests` flow (different copy/fields), or genuinely distinct flows
   (e.g. Register = a form, Talk-to-sales = a "contact us" that emails BD)? *(lean: one pipeline, two doors)*
2. **What does the lead capture collect?** Enough for BD to qualify a B2B buyer — company, contact
   name, role, work email, use-case/deal type (agency / film-TV / brand), maybe budget band. Which fields?
3. **Where do leads land, and who's notified?** New `buyer_signup_requests` table + an admin queue in
   `/admin/buyer-orgs`? Email/Resend notification to BD? Reuse anything existing?
4. **What can a logged-out public browser DO?** Browse + play preview only, with shortlist/license
   gated behind an account/lead? Or more? *(lean: browse + play; any engagement → the modal)*
5. **Public preview audio** — still simulated (no preview URLs; real preview audio is deferred). OK
   for public browse, or does public exposure raise the "what do we stream to anonymous visitors" question?
6. **Login flows scope** — do we need forgot-password + resend-activation wired now, or is login-only
   enough for the few existing/provisioned buyers in beta?
7. **After approval** — a provisioned Model-A buyer lands in the existing gated portal (`/buyers/*`).
   Anything special on first login (welcome, org setup)?
</open_questions>

<canonical_refs>
## Canonical References
- Reference screenshot: Marmoset login modal (owner-provided) — layout to mirror, Funūn-branded.
- `components/buyer/CatalogBrowserLight.tsx` — the browse; its `isPublic` **Login** button (line ~321,
  currently a no-op) is the modal trigger; its License-modal/scrim pattern is the modal analog.
- `app/(buyer-portal)/buyers/catalog/page.tsx` — the currently-walled catalogue route (redirects
  logged-out → `/buyers/access`); this is where public-browse is opened up.
- `components/buyer/fnbl-theme.ts` — light token system for the modal.
- `lib/buyers/createBuyerAccount.ts` + `app/api/admin/buyer-orgs/route.ts` — the admin provisioning
  path leads convert into.
- `supabase/migrations/080_buyer_orgs_members.sql` — `handle_new_user` buyer branch + buyer tables.
- `app/(auth)/signin/` — existing Supabase auth pattern (login/forgot-password).
- `~/Desktop/Fununbuyerbrowse/FUNUN Logo Exploration.html` — the 5 logo options.
</canonical_refs>

<deferred>
## Deferred (to Phase 24 — Model B)
- Self-serve **instant** buyer accounts (no BD in loop).
- `handle_new_user` buyer-branch rewrite + auto org bootstrap.
- Subscription/checkout + plan tiers.
- The transact-gate that protects artists from unvetted buyers.
- OAuth/SSO buyer login.
</deferred>

---

*Phase: 23-buyer-onboarding-login-register (Model A)*
*Context: 2026-08-05 — owner two-model decision; Model A active, Model B → Phase 24*
