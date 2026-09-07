import {
  isBundleExcluded,
  PERMISSION_TIER,
  type WorkspacePermission,
} from '@/lib/workspaces/permissions'

// ─── The Member-facing permission vocabulary (WSR-27, R-18) ───────────────
// Pure, zero-I/O copy module — no Supabase client, no side effects, in the
// same shape as `lib/workspaces/permissions.ts` itself.
//
// `PERMISSION_LABELS` in `lib/workspaces/permissions.ts` IS THE OPS/ADMIN
// LABEL SET AND STAYS EXACTLY AS IT IS. It is deliberately not what a
// Member sees: "Access clean masters" and "Edit metadata" are the
// vocabulary of an audit surface and an admin matrix, written for someone
// who already knows what the permission model is. This module is the other
// half — the Member-facing vocabulary for the WSR-27 consent surface, where
// somebody is being asked to hand a stranger authority over their own
// catalogue and has to understand the question without a glossary.
//
// THE STRINGS BELOW ARE COPIED VERBATIM FROM THE APPROVED UI-SPEC
// (.planning/phases/38.0.1-workspace-authorization-remediation/
// 38.0.1-UI-SPEC.md, the "Plain-Language Permission Copy" and "Copywriting
// Contract" tables). They are not paraphrased here and must not be
// paraphrased in a component: a reworded permission is a different question
// than the one that was reviewed, asked at the exact moment consent is
// given. Change the UI-SPEC first, then this file.
//
// NO SURFACE MAY EVER SHOW A MEMBER A PERMISSION SLUG OR AN OPS-FACING
// LABEL. A Member who misreads what they are approving has still approved
// it (T-38.0.1-12-05), so the record below is typed as a FULL
// `Record<WorkspacePermission, string>`: adding a permission to the
// catalogue without adding copy here is a compile error, not a runtime
// blank row on a consent screen.
//
// D-37 VOCABULARY RULE: the word "verified" is never used about a stored
// document anywhere in this copy — Funūn records that an agreement was
// attached or uploaded, and never attests to what is inside it.

// ─── Plain-language copy, one sentence per grantable permission ───────────
export const PERMISSION_PLAIN_COPY: Record<WorkspacePermission, string> = {
  view_summaries: 'See a summary of your songs and releases',
  view_metadata: 'See your song details — titles, credits, dates',
  edit_metadata: 'Change your song details — titles, credits, dates',
  access_writers_room: "Open your Writer's Room drafts and notes",
  upload_audio: 'Upload audio to your songs',
  download_protected_audio: 'Download your preview audio — not the final master',
  access_clean_masters: 'Download the final master files of your songs',
  invite_collaborators: 'Invite other people to work on your songs',
  view_split_sheets: "See who's credited and their share on your songs",
  view_contracts: 'See your contracts and agreements',
  upload_contracts: 'Upload or draft contracts for you',
  request_signatures: 'Ask people to sign a contract for you',
  view_private_rights_identifiers:
    'See your private ID numbers — like your IPI or SoundExchange ID',
  edit_rights_information:
    'Suggest changes to your rights info — you always confirm before anything changes',
  manage_registrations: 'Handle copyright and royalty registrations for your songs',
  approve_releases: 'Approve a release before it goes out',
  deliver_assets: 'Send your final files to a store or partner',
  view_earnings: 'See how much your music is earning',
  act_on_behalf: 'Act and speak for you — every action is labeled with their name and yours',
}

// ─── Tags (UI-SPEC Copywriting Contract) ──────────────────────────────────
// Exported as named constants rather than inlined in a component, so the
// approved wording lives in exactly one place and a test can assert it.

/** Rendered beside an authority-tier permission (D-21). Informational —
 * never a button. */
export const AUTHORITY_TIER_TAG = 'Needs a signed agreement'

/** Rendered beside one of the three D-40 bundle-excluded permissions. Says
 * the two things that are actually true of them: they are never swept in
 * with a preset, and every use is written to the audit log. */
export const SENSITIVE_PERMISSION_TAG = 'Granted one at a time · every use logged'

/**
 * Rendered ONCE at the very bottom of the consent page, muted — not
 * repeated per card. States the D-42 structural exclusion as the absence it
 * is. Deliberately written in the Member's own words ("payout and tax
 * details"): the two excluded capability names are not permissions at all,
 * and printing either of them here would put a grantable-looking token in
 * front of someone for the first time on the one screen where grants are
 * made.
 */
export const STRUCTURAL_EXCLUSION_FOOTNOTE =
  "Payout and tax details are never part of any workspace request — there's no permission for it, here or anywhere in Funūn."

// ─── Describe one permission for the consent surface ──────────────────────
export type MemberPermissionDescription = {
  permission: WorkspacePermission
  copy: string
  tier: 'operational' | 'authority'
  sensitive: boolean
  tags: string[]
}

/**
 * Everything the WSR-27 surface needs to render one permission row: its
 * plain sentence, its tier, whether it is bundle-excluded, and the tag
 * strings those two conditions call for.
 *
 * COMPOSES, NEVER DUPLICATES. Tier comes from `PERMISSION_TIER` and
 * sensitivity from `isBundleExcluded` — both read from
 * `lib/workspaces/permissions.ts` on every call. A second copy of either
 * axis here would be a place for the surface to disagree with the
 * authorization layer about what a permission is.
 *
 * Both tags are never returned together, because no catalogue value is both
 * authority-tier and bundle-excluded — the five authority permissions and
 * the three sensitive ones are disjoint sets today, and the paired test
 * asserts that premise rather than assuming it. Never throws.
 */
export function describePermissionForMember(
  permission: WorkspacePermission
): MemberPermissionDescription {
  const tier = PERMISSION_TIER[permission]
  const sensitive = isBundleExcluded(permission)

  const tags: string[] = []
  if (tier === 'authority') tags.push(AUTHORITY_TIER_TAG)
  if (sensitive) tags.push(SENSITIVE_PERMISSION_TAG)

  return {
    permission,
    copy: PERMISSION_PLAIN_COPY[permission],
    tier,
    sensitive,
    tags,
  }
}
