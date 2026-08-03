// ─── Buyer role enum (D-13: two tiers only, requester + approver) ────────
export const BUYER_ROLE_VALUES = ['requester', 'approver'] as const

export type BuyerRole = (typeof BUYER_ROLE_VALUES)[number]

export const BUYER_ROLE_LABELS: Record<BuyerRole, string> = {
  requester: 'Requester',
  approver: 'Approver',
}

// ─── BuyerOrg (migration 080: buyer_orgs) ─────────────────────────────────
// Mirrors the column-grant allowlist on the migration — verified_at and
// created_by are private (admin-audit only) and deliberately excluded here.
export type BuyerOrg = {
  id: string
  name: string
  is_personal: boolean
  verified: boolean
  created_at: string
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
