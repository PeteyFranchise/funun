# Staff and personal session switching roadmap

## Objective

Record the newly observed cross-tab account-switching problem as a dedicated future
build in the account architecture roadmap.

## Scope

- Document the current browser-session limitation and safe beta workaround.
- Define an explicit, intentional switch between Personal Workspace and Funūn Team.
- Require persistent active-identity labeling and protection against silent cross-tab
  identity changes.
- Capture security, recovery, audit, and multi-tab acceptance criteria.
- Planning only; no authentication, session, database, or production behavior changes.

## Files expected to change

- `.planning/ROADMAP.md`
- `.planning/quick/260905-staff-personal-session-switching/SUMMARY.md`

## Validation plan

- Confirm the roadmap names both of the affected account identities and preserves the
  rule that privileged Team Member identities remain separate from Member identities.
- Confirm the roadmap includes an immediate workaround, product scope, security rules,
  and definition of done.
- Run `git diff --check`.

## Risks and coordination notes

- An account switcher must not weaken the separate privileged identity boundary.
- Shared browser cookies cannot safely represent two simultaneous Supabase identities;
  the future build needs a deliberate re-authentication or separately scoped session
  design rather than a cosmetic navigation toggle.
