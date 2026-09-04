---
title: Complete Member and Client Partner identity continuity
area: authentication / account context / Client Partners
status: pending
created: 2026-09-04
---

# Member and Client Partner identity continuity

## Why this exists

The September 4 account foundation supports one existing Member identity plus one verified
Client Partner organization relationship. It intentionally does not fabricate safe credential
linking or multi-organization switching.

Example: Jordan signs in with a Netflix email, uses The Crate for Netflix, and also writes and
produces songs in a personal Member workspace. If Jordan leaves Netflix, the company must be
able to revoke Netflix access without taking Jordan's personal catalogue with it.

## Future build A — verified personal continuity

- Add a personal login/recovery method before a corporate email is the only key to a personal
  Member workspace: provider-verified secondary email, passkey, or both.
- Require proof of control of every credential. Typing an address is never linking.
- Define conflict handling when the personal address already belongs to another auth identity;
  never auto-merge catalogues, contracts, rights, payouts, or histories.
- Add recovery, lost-device, email-change, organization-offboarding, and support escalation
  flows with immutable audit history.
- Notify all verified credentials when one is added, removed, promoted, or used for recovery.
- Require recent authentication and step-up verification for credential and payout changes.
- Ensure revoking an employer relationship removes only that organization context and its
  sessions; personal Member access and records remain.
- Review Supabase Auth capabilities and current security guidance at implementation time.

## Future build B — multiple Client Partner organizations

- Add an explicit active organization context selected from authorized memberships.
- Carry the selected organization through server-side page and API authorization; never trust
  a client-supplied org id without membership validation.
- Audit every `/sync` page, `/api/buyer/*` route, cache key, realtime channel, notification,
  export, email, and analytics event for cross-organization leakage.
- Keep shortlists, briefs, requests, agreements, purchases, staff assignments, and reporting
  organization-scoped.
- Provide a visible organization switcher and unambiguous acting-as indicator.
- Handle membership revocation during an active session and invalidate cached context.
- Add adversarial tests for IDOR, stale tabs, concurrent revocation, duplicated invitations,
  and identities with Member plus several Client Partner relationships.

## Do not do

- Do not use professional role “Music Supervisor” as a Crate access grant.
- Do not rewrite `app_metadata.role` to switch workspaces.
- Do not silently create a second buyer membership while routes still call `maybeSingle()`.
- Do not combine Client Partner licensing records with the Member Contract Locker.
- Do not allow a Funūn Team Member identity to gain Member or Client Partner context.

## Entry condition

Start with a dedicated auth/security design review and provider capability validation. Build
credential continuity before promising corporate-email portability; build the active-org
selector before permitting more than one Client Partner membership per identity.
