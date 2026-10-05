# Contract Counsel and Collaboration Policy

## Objective

Record the owner's direction that every publishable Funūn contract template receives attorney review, that Funūn does not act as users' legal counsel, and that users may collaborate with their own attorneys through Funūn accounts.

## Scope

- Add a research-library governance document covering template review, user counsel, role separation, and publication gates.
- Link that governance from the contract research library.
- Update the existing Contract Locker/legal-services deliberation with the clarified owner direction.
- Keep the current deal memo in `research_only` status; no template is promoted by this policy update.

## Files expected to change

- `research/contracts/README.md`
- `research/contracts/GOVERNANCE.md` (new)
- `.planning/deliberations/contract-locker-generation-and-legal-services.md`
- This quick task's `SUMMARY.md` after validation

## Validation

- Confirm the documents consistently distinguish template-review counsel from a user's retained counsel.
- Confirm the Terms of Service language is described as counsel-approved policy work, not treated as a complete legal safeguard by itself.
- Confirm user-lawyer collaboration requires client authorization and role-based access.
- Confirm the current template remains research-only and ineligible for generation/e-sign/Contract Locker use.
- Run `git diff --check` on only the task paths.

## Risks and coordination

- This records product direction; it does not draft final Terms of Service language or provide legal advice.
- Privilege, confidentiality, conflicts, attorney verification, jurisdiction, retention, and access-revocation behavior remain counsel/product decisions.
- Existing unrelated worktree changes will not be touched.

