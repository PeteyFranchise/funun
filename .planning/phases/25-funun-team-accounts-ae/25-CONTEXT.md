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
## Naming & vocabulary (owner 2026-08-05) — user-facing labels vs internal identifiers
- **Client Partner** = the buyer/client-company account (user-facing name). The account is a
  **Buyer · Client Partner**. UI + console say **"Client Partners"** (and **"My Client Partners"** for
  an AE/BD's scoped list). **Internal table stays `buyer_orgs`** (already live, migration 080) — do NOT
  rename it; only the label changes.
- **Funūn Team Member** = the internal employee account (user-facing name), replacing "staff" in all
  UI/console text ("Team Members", "Add Team Member"). **Internal identifiers stay** (`funun_staff`,
  `staff_role`, `requireStaff`, `lib/staff/*`) — synonyms, no code churn; only labels change.
- **Team Member role types** — the account is **typed by role**, and the set is **extensible** as roles
  become real:
  - **Now:** **Leadership / Executive** (top tier; today's `app_metadata.is_admin` → **Leadership Admin**
    via the D-02/A1 fallback — confirmed), **Account Executive (AE, sales)**, **BD**.
  - **Future (add one at a time — each its own capability def + a migration extending the role CHECK):**
    **A&R**, **IT**, **Operations**. Not built now; the `staff_role` CHECK enum stays closed at
    `('leadership','ae','bd')` for this phase and is widened per-role later.
- **Routes (user-visible):** prefer the user-facing names — `/admin/team-members`, `/admin/my-client-partners`,
  `/admin/client-partners` — even though the underlying tables keep their internal names.
- Confirmed: today's `is_admin` → **Leadership**, and AEs see only **their assigned Client Partners** (assignment-scoped).

## Direction (from the discussion)
- Funūn employee accounts are a **third principal type** — distinct from artist and Client Partner (buyer) accounts.
- **Staff accounts are provisioned, not self-serve** (owner/superadmin bootstrap → leadership creates more).
- **Access-gated capabilities:** only staff **with the permission** can create buyer accounts or edit
  (portions of) them. Editing is **scoped** (assigned companies + subset of fields), not blanket.
- **One AE per buyer company** (assigned by leadership); leads/activity route to in-app queue **and** email.

## Locked defaults (owner-approved 2026-08-05 — plan against these)
1. **Identity / reconciliation — generalize `is_admin`, don't duplicate.** Today's admin gate is a single
   binary `app_metadata.is_admin === true` (checked in `app/(admin)/layout.tsx` + per page via `lib/admin/gate.ts`,
   no roles). Generalize it into a **staff role**: **leadership** (= today's `is_admin: true`, full access),
   **AE**, **BD**. Extend `lib/admin/gate.ts` as the single authority — **no parallel auth path**. Staff role
   carried on `app_metadata` (an optional `funun_staff` table for profile/assignment data is the planner's discretion).
2. **Bootstrap — seed like `is_admin` today.** The first **leadership** account is seeded the same way
   `is_admin` is set now (owner via Supabase dashboard / service role). Leadership then creates further staff
   **in-app** (setting their role). No self-serve staff signup; no chicken-and-egg.
3. **Permission granularity — role-level + scoped, beta-simple.** Capabilities are **role-level**
   (leadership / AE / BD imply capability sets), **NOT** a per-capability grant matrix. Buyer-account **editing
   is assignment-scoped** (an AE edits only *their* assigned companies) and limited to a **field allowlist**
   (mirror the `EDITABLE_FIELDS` allowlist pattern in `app/api/profile/route.ts`).
4. **Audit — log staff writes to client data.** Staff create/edit actions on buyer accounts are recorded
   (who / what / when) — staff hold cross-tenant access, so the trail is required.
</decisions>

<open_questions>
## Open — for the planner to resolve (the 4 locked defaults above are settled)
- **RLS shape for the staff principal** — how leadership/AE/BD read/write across buyer orgs scoped by
  permission (and any limited artist-data access for support), on top of the existing RLS.
- **Which exact buyer-account fields are staff-editable** — define the allowlist (company profile / contact /
  AE fields yes; decide on billing / membership / purchase history), per default #3's field-allowlist approach.
- **Assignment storage** — `buyer_orgs.ae_user_id` vs a join table (assignment history / handoffs); reassignment flow.
- **`funun_staff` table vs `app_metadata`-only** — whether staff need a profile/assignment row (default #1 leaves this to the planner).
- **Work-queue surface** — where staff see leads/companies (`/team` or extend `/admin`); minimal = queue + email.
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
