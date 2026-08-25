// ─── Fast-add auto-invite decision helpers (260825-i4i follow-up) ─────────
// PartyPicker's fast-add form (components/split-sheets/PartyPicker.tsx) used
// to POST /api/collaborators and stop — its own copy promised "they'll fill
// in the rest", which was never true because nothing ever invited them.
// This file holds the two pure decisions that wire an automatic invite send
// onto that flow without ever blocking the party-add itself:
//
//   1. isAutoInviteEligible — should we even attempt an invite? (email
//      required; a phone-only party is skipped silently, no error.)
//   2. extractAutoInviteLink — given whatever POST /api/collaborators/[id]/
//      invite returned (success, cooldown reuse, or failure/throw), what
//      link (if any) should the fast-add result area surface?
//
// Both are pure and DOM-free so they're testable under the repo's jsdom-less
// jest setup — the component itself is covered by tsc/lint/build only.

export type AutoInviteResponseBody = {
  ok?: boolean
  inviteLink?: string
  emailSent?: boolean
  skipped?: boolean
  error?: string
}

/**
 * A fast-added party is only eligible for an automatic invite when they
 * have an email — sendCollaboratorInvite() (lib/collaborators/invite.ts)
 * requires one and 400s without it. Phone-only fast-adds must never fire
 * the invite call at all, per the phone-only edge case: skip silently, no
 * error, the party is still added.
 */
export function isAutoInviteEligible(collaborator: { email?: string | null }): boolean {
  return Boolean(collaborator.email && collaborator.email.trim())
}

/**
 * Extracts the invite link to surface in the fast-add result area, or
 * `null` when there is nothing to show. `null` is also the correct result
 * for every failure mode (non-ok response, missing body, a thrown/caught
 * network error passed in as `body: null`) — the caller treats `null`
 * identically to the phone-only case and finalizes the add immediately, so
 * a broken invite can never block the party from being added or the
 * picker from closing.
 *
 * Both the cooldown-reuse path (`skipped: true`) and the email-send-
 * failure path (`emailSent: false`) still return `ok: true` with a real
 * `inviteLink` from sendCollaboratorInvite() — those are successes for
 * this function's purposes and their link is surfaced exactly like a
 * freshly-sent invite's.
 */
export function extractAutoInviteLink(
  res: { ok: boolean },
  body: AutoInviteResponseBody | null
): string | null {
  if (!res.ok || !body) return null
  return body.inviteLink ?? null
}
