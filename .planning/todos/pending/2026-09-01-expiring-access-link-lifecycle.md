---
created: 2026-09-01T06:00:00-04:00
title: Implement expiring access across Sound Vault, The Crate and Contract Locker
area: security-access
priority: near-term-planning
status: ready-for-gsd-discussion
depends_on:
  - Sound Vault custody D-01 through D-05
  - Contract Locker signing-provider lifecycle review
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/sound-vault-master-custody.md
  - lib/watermark/signed-url.ts
  - app/api/selects/[token]/download/route.ts
  - lib/esign/provider.ts
---

## Owner-approved outcome

Unify external access behind revocable parent grants and short-lived child media/storage
credentials. Preserve The Crate's continuously browsable protected-preview experience
and Contract Locker's permanent legal records without exposing permanent asset or
signing URLs.

This TODO is an implementation destination, not a claim that every listed control is
already live.

## Locked rules

- External links expire and can be revoked.
- Parent access grants and short-lived media/storage credentials are separate.
- No child credential may outlive its parent grant.
- Clean masters, sensitive documents and attributed downloads require named recipients.
- The Crate uses renewable authorized preview sessions, never permanent audio URLs.
- Crate previews resolve only protected derivatives; never clean masters.
- Signing invitations expire or close; executed legal records persist in Contract Locker.
- Renewals issue new credentials and remain auditable.
- Expired/revoked links reveal no contextual information.
- Revocation cannot retrieve content already downloaded or captured.

## GSD discussion agenda

### Current-surface audit

- Inventory every signed URL, share token, download route, storage accessor, signing
  invitation and email link.
- Classify each as bearer, named-recipient, authenticated membership or internal access.
- Find credentials whose lifetime exceeds or bypasses the intended authorization grant.
- Confirm no preview route can resolve clean-master storage.

### Shared access-grant model

- Define subject, object, action, purpose, start, expiration, revocation, usage limit,
  issuer and authority snapshot.
- Store only token hashes and define safe rotation/reissue behavior.
- Define audit events and neutral expired/invalid responses.
- Decide recent-authentication and recipient-verification rules per sensitive action.

### The Crate

- Preserve catalogue admission/withdrawal as the long-lived availability state.
- Add per-request protected-preview authorization and short media credentials.
- Support transparent renewal during active authorized sessions.
- Stop new streams immediately on withdrawal while preserving pitches/deals/history.
- Define bearer shortlist versus named-recipient/team-share policy.
- Reserve forensic personalization initially for higher-risk downloads and advances.

### Contract Locker and e-signature

- Map provider invitation, opened, signed, completed, expired, voided and replaced states.
- Ensure an unchanged document can be re-invited without rewriting its legal version.
- Ensure a changed document voids the prior request and creates a successor version.
- Land executed PDF and signature evidence in authenticated Contract Locker storage.
- Remove dependency on old email links for permanent document access.

## Recommended implementation stages

1. **Inventory and threat model** - enumerate current access paths and classify risk.
2. **Shared grant foundation** - parent grants, hashed tokens, expiry/revocation and audit.
3. **Protected media credentials** - short-lived preview/download URLs subordinate to
   current authorization.
4. **The Crate renewable sessions** - transparent authorized playback plus withdrawal.
5. **Named delivery controls** - watermarked/clean delivery identity, limits and recent auth.
6. **Contract lifecycle normalization** - provider events, expiry, void/reissue and
   persistent Contract Locker access.
7. **Central access console** - active grants, recipients, uses, renewals and revocation.
8. **Security verification** - leakage tests, replay tests, race/revocation testing,
   cross-account checks and incident runbook.

## Acceptance pilot

- An authorized buyer browses and plays ten active Crate songs across a normal session
  without encountering broken-expiry UX.
- Inspecting the client reveals no permanent storage URL or clean-master path.
- Withdrawing one song blocks new plays while preserving prior activity and deal records.
- A seven-day external shortlist expires to a neutral state and can be intentionally renewed.
- A named watermarked download respects its 24-hour and download-count limits.
- A clean-master test requires named identity and recent authentication.
- A split-sheet invitation expires, is reissued, completes and leaves its signed PDF and
  certificate accessible through authenticated Contract Locker.
- Revocation tests show no new child credentials after revocation and existing child
  credentials die within the documented short lifetime.

## Claude / GSD instruction

Do not implement one universal bearer-token system. Reconcile each surface with its
threat model and D-04 action permissions. Preserve Phase 31's never-clean-master preview
boundary and the existing e-sign provider abstraction. Treat provider-specific signing
URLs as adapters to a Funūn-owned lifecycle record, not the source of truth for the
legal document.
