# Phase 25: Funūn Team / Internal Accounts & AE Assignment + Staff Permissions - Context

**Gathered:** 2026-08-05
**Status:** Captured — NOT yet planned. Enables Model A's AE assignment, buyer-account provisioning/editing, and lead routing (Phase 23).
**Source:** owner direction during buyer-onboarding discussion (2026-08-05, expanded)

<domain>
## Phase Boundary

Introduce a **new account type for Funūn employees** — the people who run the business — operating
**inside the product** under a **staff permission model**. Primary drivers: Funūn's buyer side is
**relationship-driven** (an **AE per buyer company**), and staff **operate client accounts on the client's
behalf** (create them, help onboard, edit their details) — which must be **access-gated** so only
authorized staff touch a given client's data.

**In scope:**
1. **Create Funūn team member accounts** — a provisioning flow. Staff accounts are **not self-serve**:
   bootstrapped from an owner/superadmin seed; **leadership creates** the rest.
2. **Staff roles + permissions (RBAC)** — team accounts carry an access level; privileged actions are gated:
   - **Create client (buyer) accounts** — permissioned staff (AE/BD) provision a buyer company account from
     the Funūn side (generalizes today's platform-admin-only `/admin/buyer-orgs` → `createBuyerAccount`).
   - **Edit portions of client accounts** — permissioned staff edit **specific parts** of a buyer account,
     **scoped by access** (likely their **assigned** companies + a **subset of fields**), not blanket access
     to all clients.
3. **AE ↔ buyer-company assignment** — leadership assigns one AE per buyer company; AE shepherds onboarding
   (Phase 23) + the relationship.
4. **Lead / work routing** — new-buyer signups + relevant buyer activity land in the right employee's
   **in-app queue** AND fire **email** (Resend) — a light work surface, not a full CRM.

**Out of scope / later:** full CRM; commission tracking; HR/org-chart; permission granularity beyond what
AE/BD/leadership need for beta.
</domain>

<decisions>
## Direction (from the discussion)
- Funūn employee accounts are a **third principal type** — distinct from artist and buyer accounts.
- **Staff accounts are provisioned, not self-serve** (owner/superadmin bootstrap → leadership creates more).
- **Access-gated capabilities:** only staff **with the permission** can create buyer accounts or edit
  (portions of) them. Editing is **scoped** (assigned companies + subset of fields), not blanket.
- **One AE per buyer company** (assigned by leadership); leads/activity route to in-app queue **and** email.
</decisions>

<open_questions>
## Open — to reason through / settle at planning
1. **Identity model** — how staff accounts sit in the Phase 15 capability model. New principal type? A
   `funun_staff` table + roles? RLS for a "staff" principal that can read/write **across** buyer orgs
   (scoped by permission) and see limited artist data for support.
2. **Bootstrap** — who creates the FIRST staff account (a seed migration / the platform owner / existing
   admin)? How the chain of "leadership creates staff" starts.
3. **Reconciliation with existing platform-admin** — `/admin/*` today uses a platform-admin gate. Are current
   admins = leadership? Does staff RBAC **subsume/replace** the existing admin check, or sit alongside it?
   (Creating buyer accounts moves from admin-only to permissioned-staff — this gate must be reconciled, not duplicated.)
4. **Permission model shape** — role-level (AE / BD / leadership each imply a capability set) vs explicit
   per-capability grants; **field/section-level** edit scope on buyer accounts; **assignment-scoped** editing
   (AE edits only their companies). How coarse is enough for beta?
5. **Which buyer-account portions are staff-editable** — company profile/contact/AE fields yes; billing,
   membership, or purchase history? Define the editable surface (mirrors the artist-profile `EDITABLE_FIELDS` allowlist pattern).
6. **Audit** — staff actions on client data (create/edit) should be logged (who, what, when) — high-value target.
7. **Assignment model** — `buyer_orgs.ae_user_id` vs a join table (history/handoffs); reassignment flow.
8. **Work-queue surface** — where staff see leads/companies (`/team` or extend `/admin`); minimal = queue + email.
</open_questions>

<canonical_refs>
## Canonical References
- Phase 15 (account/capability model) — where a 3rd principal type must fit.
- `app/(admin)/` + `app/api/admin/*` — today's platform-admin surfaces (the gate to reconcile).
- `app/api/admin/buyer-orgs/route.ts` + `lib/buyers/createBuyerAccount.ts` — the buyer-creation path staff RBAC generalizes.
- `app/api/profile/route.ts` — the `EDITABLE_FIELDS` allowlist pattern for scoped field editing.
- `supabase/migrations/080_buyer_orgs_members.sql` — buyer orgs staff create/assign/edit.
- Phase 23 (`23-CONTEXT.md`) — consumer of AE assignment, buyer-account provisioning + editing, lead routing.
</canonical_refs>

---

*Phase: 25-funun-team-accounts-ae*
*Context: 2026-08-05 — buyer-onboarding discussion + staff account-creation & permissions expansion*
