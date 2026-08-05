# Phase 24: Buyer Onboarding · Model B — Self-Serve Creator Access - Context

**Gathered:** 2026-08-05
**Status:** Captured (future / post-beta) — NOT yet planned; sequenced after Model A (Phase 23) ships
**Source:** owner two-model decision (2026-08-05)

<domain>
## Phase Boundary

The **second** of Funūn's two buyer-onboarding models (see Phase 23 for Model A). Model B is the
**self-serve** path for **smaller content creators** — instant buyer accounts created straight from
the browse, **no BD in the loop**. Shape reference: **Musicbed / Marmoset-self-serve** — Marmoset runs
a separately-surfaced self-serve licensing arm off the **same catalogue** as its sales-led custom arm;
Funūn follows that template.

**Reuses from Phase 23 (shared foundation — do NOT rebuild):** the public Browse Catalogue, the
Funūn-styled Login/Register modal, existing-buyer login, the Funūn logo.

**Adds (the parts Model A deliberately skipped):**
- **Self-serve instant accounts** — "Register" creates a live buyer account with no admin approval.
- **Account/org bootstrap** — rewire the `handle_new_user` buyer branch (today it early-returns with
  no org, assuming an admin created one first) to auto-provision a buyer org/membership on self-serve signup.
- **Billing** — likely subscription and/or pay-per-license via Stripe; plan tiers.
- **Transact-gate** — the protection that keeps artists safe when the buyer ISN'T vetted (e.g. verify
  before a license request reaches an artist), since Model B removes the human vetting Model A relies on.
</domain>

<decisions>
## Direction (from the two-model decision)
- Model B = **instant self-serve** (the counterpart to Model A's request-and-approve).
- Individual/creator-scale accounts (vs Model A's company/team org-first) — confirm at planning.
- Post-beta: build after Model A proves the funnel + supply is deep enough to open the demand side.
</decisions>

<open_questions>
## Open — to settle when this phase is discussed/planned
1. **Monetization** — subscription (Artlist/Epidemic-style) vs pay-per-license (Musicbed/Marmoset-style)
   vs both? This shapes the whole flow + the Stripe work.
2. **Account granularity** — individual creator accounts vs still org-based? Auto-create a personal org?
3. **The transact-gate** — what unvetted self-serve buyers can and can't do; what "verified enough to
   license" means; how artists stay protected. (Ties to the catalogue-inclusion + signing models.)
4. **Separate branded surface?** — Marmoset's self-serve arm is separately surfaced/branded but same
   catalogue. Does Funūn's self-serve get its own storefront/brand, or is it the same buyer portal with
   a different account type?
5. **`handle_new_user` rewrite** — buyer branch auto-bootstraps org + membership on signup (schema/RLS impact).
6. **Interaction with pre-cleared terms + inclusion model** — self-serve licensing likely REQUIRES
   pre-cleared terms per song (no human to negotiate); depends on those deliberations resolving.
</open_questions>

<canonical_refs>
## Canonical References
- Phase 23 (`23-CONTEXT.md`) — the shared modal + public browse this builds on.
- `supabase/migrations/080_buyer_orgs_members.sql` — `handle_new_user` buyer branch to rewrite.
- `lib/buyers/createBuyerAccount.ts` — the admin-path account creation to adapt for self-serve.
- `lib/stripe/connect.ts` + Phase 16 Stripe work — billing substrate.
- `.planning/deliberations/buyer-catalogue-inclusion-model.md` + `sync-license-signing-model.md` —
  self-serve licensing leans hard on both.
- Musicbed / Marmoset self-serve licensing — the model reference.
</canonical_refs>

---

*Phase: 24-buyer-onboarding-self-serve (Model B)*
*Context: 2026-08-05 — captured as the future half of the two-model buyer-onboarding strategy*
