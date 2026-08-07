// ─── Buyer role enum (D-13: two tiers only, requester + approver) ────────
export const BUYER_ROLE_VALUES = ['requester', 'approver'] as const

export type BuyerRole = (typeof BUYER_ROLE_VALUES)[number]

export const BUYER_ROLE_LABELS: Record<BuyerRole, string> = {
  requester: 'Requester',
  approver: 'Approver',
}

// ─── BuyerOrgStatus (migration 095: pending_onboarding -> active) ─────────
export const BUYER_ORG_STATUS_VALUES = ['pending_onboarding', 'active'] as const

export type BuyerOrgStatus = (typeof BUYER_ORG_STATUS_VALUES)[number]

// ─── BuyerOrg (migration 080: buyer_orgs; migration 095: status/use_case) ─
// Mirrors the column-grant allowlist on the migrations — verified_at and
// created_by (080) are private (admin-audit only) and deliberately
// excluded here; status and use_case (095) were added to the authenticated
// GRANT SELECT allowlist and are included. contact_name/contact_email/
// contact_phone/contact_role/source (095) are staff-only lead/CRM fields,
// NOT in the authenticated grant, and are deliberately excluded here too —
// this type stays honest to the column-privilege allowlist.
export type BuyerOrg = {
  id: string
  name: string
  is_personal: boolean
  verified: boolean
  created_at: string
  status: BuyerOrgStatus
  use_case: string | null
}

// ─── BuyerMember (migration 080: buyer_members) ───────────────────────────
// Mirrors the column-grant allowlist on the migration — invited_by is
// private (admin-audit only) and deliberately excluded here.
export type BuyerMember = {
  id: string
  org_id: string
  user_id: string
  buyer_role: BuyerRole
  is_org_admin: boolean
  created_at: string
}
