# Phase 25: Funūn Team / Internal Accounts & AE Assignment - Context

**Gathered:** 2026-08-05
**Status:** Captured — NOT yet planned. Enables Model A's AE assignment + lead routing (Phase 23).
**Source:** owner direction during buyer-onboarding discussion (2026-08-05)

<domain>
## Phase Boundary

Introduce a **new account type for Funūn employees** — the people who actually run the business — so
they operate **inside the product**, not just over email/spreadsheets. Primary driver: Funūn's buyer
side is **relationship-driven**, so each **buyer company gets one Account Executive (AE)**, and AEs/BD/
leadership need first-class accounts to be assigned work, notified, and to oversee deals.

**In scope:**
- **Funūn employee accounts** — a distinct principal type alongside artist (user) and buyer accounts,
  with roles (AE, BD, leadership/admin).
- **AE ↔ buyer-company assignment** — leadership assigns one AE per buyer company; the AE shepherds that
  company's onboarding (Phase 23) and relationship.
- **Lead / work routing** — new-buyer signups and relevant buyer activity land in the right employee's
  **in-app queue** AND fire **email** (Resend), so it's part of their daily human systems (a light CRM/work
  surface, not a full CRM).

**Out of scope / later:** a full CRM; commission tracking; org-chart/HR features; fine-grained internal
permissions beyond what AE/BD/leadership need for beta.
</domain>

<decisions>
## Direction (from the discussion)
- Funūn employee accounts are a **third account type** — very different from both artist and buyer accounts.
- **One AE per buyer company** (assigned by leadership) → relationship-driven sales.
- Leads/activity route to **both** the responsible employee's **in-app account** and **email**.
</decisions>

<open_questions>
## Open — to reason through before planning
1. **Identity model** — how employee accounts sit in the Phase 15 capability model. A new principal type?
   A flag on `auth.users`? A dedicated `funun_staff` table + roles? RLS implications of a "staff" principal
   that can see across buyer orgs (and possibly artist data) for support.
2. **Roles + powers** — AE / BD / leadership(admin). Who assigns AEs? Who sees all companies vs only theirs?
   How this relates to the **existing platform-admin** used by `/admin/*` today (are current admins = leadership?).
3. **Assignment model** — `buyer_orgs.ae_user_id`? A join table for history/handoffs? Reassignment flow.
4. **Work queue surface** — where employees see their leads/companies (a `/team` or `/admin` surface), and
   what "daily systems" means minimally (a queue + email is probably enough for beta).
5. **Notification fan-out** — signup → admin queue + assigned AE (if any) + BD email; how routing decides
   the recipient before an AE is assigned.
6. **Security** — a staff principal with cross-tenant visibility is a high-value target; audit + least-privilege.
</open_questions>

<canonical_refs>
## Canonical References
- Phase 15 (account/capability model) — where a 3rd principal type must fit.
- `app/(admin)/` + `app/api/admin/*` — today's platform-admin surfaces (leadership overlap?).
- `supabase/migrations/080_buyer_orgs_members.sql` — buyer orgs AEs get assigned to.
- `lib/buyers/createBuyerAccount.ts` — where AE assignment could hook in at buyer creation.
- Phase 23 (`23-CONTEXT.md`) — the consumer of AE assignment + lead routing.
</canonical_refs>

---

*Phase: 25-funun-team-accounts-ae*
*Context: 2026-08-05 — captured from the buyer-onboarding discussion (AE-driven sales motion)*
