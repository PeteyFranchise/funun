# Staff and personal session switching roadmap — summary

## What changed

- Added a dedicated account roadmap build for explicit switching between a privileged
  Funūn Team Member identity and a separate personal Member identity.
- Recorded the current shared-cookie cause and the separate-browser-profile beta workaround.
- Defined persistent active-identity labeling, an account-change interstitial, deliberate
  switching, re-authentication, authorization recomputation, audit expectations, edge cases,
  and a multi-tab definition of done.
- Preserved the existing security doctrine: linking switchable identities must not merge
  their data, roles, permissions, or ownership.

## Validation run

- Confirmed the roadmap distinguishes Team/Personal identity switching from Client Partner
  organization-context switching.
- Confirmed the roadmap includes the observed founder account scenario, immediate workaround,
  product scope, security requirements, edge cases, and acceptance criteria.
- `git diff --check`: passed.

## Remaining risks or follow-ups

- The authentication/session design still requires a dedicated planning phase before code.
- No production behavior changed in this roadmap-only update.
