# Phase 23: Buyer Onboarding · Model A — Sales-Led B2B Access + Buyer Company Account Model - Context

**Gathered:** 2026-08-05
**Status:** Discussion in progress — Model A specifics being nailed down before planning
**Source:** owner direction + Marmoset login-modal reference screenshot

<domain>
## Phase Boundary

Funūn's buyer side runs **two onboarding models** (owner, 2026-08-05), built in sequence:
- **Model A — Sales-Led B2B (THIS phase):** larger, Funūn-brokered deals with businesses (ad agencies,
  film/ad production companies, brands with dedicated marketing teams). Relationship-driven, **AE-assisted**.
- **Model B — Self-Serve Creator (Phase 24, later):** smaller content creators, **instant** accounts. Out of scope here.

This phase delivers **Model A + the buyer company account model + the shared front-end foundation**:
1. Open the **Browse Catalogue to public (logged-out) browsing** (today `/buyers/catalog` walls logged-out
   visitors; the `isPublic` "Login" button in `CatalogBrowserLight` is scaffolding for a browse that doesn't exist yet).
2. The Funūn-styled **Login/Register modal** (light `.fnbl`, Funūn logo), opened from the public browse.
3. **Existing buyers log in** (Supabase email/password).
4. **Light-touch Register → creates a buyer company account.** Capture a little info (minimum: work email +
   phone); an account is created (not a bare lead). Both "Register" and "Talk to a sales rep" doors do this.
5. **AE assignment + AE-assisted onboarding.** Funūn leadership assigns **one Account Executive** per buyer
   company; the AE helps the buyer complete full onboarding. (AE accounts come from Phase 25.)
6. **Buyer company account model** — see decisions.

**Out of scope / deferred:** self-serve **instant** accounts (Phase 24); the Funūn **employee accounts** that
back AE assignment (Phase 25 — Model A may stub AE until then); subscription/billing (Phase 24); the sync-library
**supply** pipeline (Phase 26).
</domain>

<decisions>
## Implementation Decisions (settled)

### Onboarding model — RESOLVED (refined 2026-08-05)
- **Light-touch Register creates a buyer company account** — minimum viable info is **work email + phone**;
  that's enough to create the account. NOT a bare lead (earlier framing), and NOT full self-serve access:
  the account is created, then an **AE completes onboarding**.
- Both **"Register"** and **"Talk to a sales rep"** doors feed this same flow (two front doors, one pipeline).
- Funūn can fully **manage/edit** buyer accounts from the admin side.

### Buyer company account model
- **Company-scoped** (org-first, B2B). A company has **multiple members** (people who make music purchases).
- **Cross-company purchase visibility:** members can see **what's happening across their company** — who is
  purchasing what. Critical for the person **green-lighting spend**.
- Implies a **spend-approver / company-admin role** (sees all company purchases, oversees spend) distinct
  from an individual purchaser role.
- **Very different from artist (user) accounts** — its own account type, shape, and admin tooling. Do not
  reuse the artist-profile model.

### AE (Account Executive) assignment
- Every buyer company is assigned **one AE** (a Funūn employee) by leadership → relationship-driven sales.
- Depends on **Phase 25** (Funūn employee accounts). Model A can **stub** AE (e.g. a nullable assignment)
  until Phase 25 lands.

### Public browse
- Catalogue becomes **browsable logged-out**. A logged-out visitor can **browse + play previews**; any
  **engagement** (shortlist / License) pops the modal ("create an account"). Email + phone is enough to create one.

### Lead / notification routing
- A new-buyer signup lands in an **admin queue**; once Phase 25 exists, it ALSO routes to the assigned
  **AE's / BD's in-app account** + a **Resend email** — part of the team's daily human systems.
- Capture fields (B2B qualifying): **company, contact name, work email, phone, role, use-case**
  (agency / film-TV / brand / other).

### Design
- Funūn light `.fnbl` modal mirroring the Marmoset reference (Login title, email/password, remember-me,
  gradient Submit, forgot-password, divider, Register CTA), Funūn-branded, plus a **"Talk to a sales rep"**
  path, Funūn wordmark. Opens over the browse (scrim, like the License modal in `CatalogBrowserLight.tsx`).

### Logo
- Adopt one of the 5 wordmark explorations (`~/Desktop/Fununbuyerbrowse/FUNUN Logo Exploration.html`).
</decisions>

<open_questions>
## Open — to reason through before planning
1. **Account model schema** — how buyer companies + members + roles + AE link extend the existing
   `buyer_orgs`/`buyer_members` (Phase 16). What's the role set (purchaser, spend-approver/admin)?
2. **How "created but not onboarded" is represented** — an account state (e.g. `pending_onboarding` →
   `active`) the AE advances? What can a pending buyer do before onboarding completes (browse only? shortlist?)?
3. **Cross-company purchase visibility** — the spend-oversight view (what the approver sees), and RLS so a
   member sees their company's activity but not others'.
4. **Register vs Talk-to-sales** — same form or different copy/fields per door? (Both create an account.)
5. **AE stub** — if Phase 25 isn't ready, how is AE represented in the interim (nullable? a default queue)?
6. **Public preview audio** — still simulated (real preview audio deferred). OK to expose publicly?
7. **Login flows** — do we need forgot-password / resend-activation wired now, or login-only for beta?
</open_questions>

<canonical_refs>
## Canonical References
- Reference screenshot: Marmoset login modal (owner-provided) — layout to mirror, Funūn-branded.
- `components/buyer/CatalogBrowserLight.tsx` — the browse; its `isPublic` **Login** button (~line 321,
  currently a no-op) is the modal trigger; License-modal/scrim pattern is the modal analog.
- `app/(buyer-portal)/buyers/catalog/page.tsx` — the currently-walled catalogue route (opens up to public here).
- `supabase/migrations/080_buyer_orgs_members.sql` — `buyer_orgs`/`buyer_members` + `handle_new_user` buyer branch.
- `lib/buyers/createBuyerAccount.ts` + `app/api/admin/buyer-orgs/route.ts` — admin account creation to build on.
- `components/buyer/fnbl-theme.ts` — light token system for the modal.
- `app/(auth)/signin/` — existing Supabase auth pattern.
- `.planning/phases/25-funun-team-accounts-ae/25-CONTEXT.md` — the AE/employee-account dependency.
- `~/Desktop/Fununbuyerbrowse/FUNUN Logo Exploration.html` — the 5 logo options.
</canonical_refs>

<deferred>
## Deferred
- Self-serve **instant** buyer accounts, subscription/checkout, transact-gate → **Phase 24 (Model B)**.
- Funūn **employee accounts** backing AE assignment → **Phase 25**.
- Sync-library **supply** (what songs exist to buy) → **Phase 26**.
- OAuth/SSO buyer login.
</deferred>

---

*Phase: 23-buyer-onboarding-login-register (Model A + buyer account model)*
*Context: 2026-08-05 — owner two-model decision, refined (account-created + AE-assisted)*
