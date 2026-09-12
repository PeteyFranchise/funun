---
created: 2026-09-11
area: security / repository governance
title: Enable GitHub security automation before Beta
recurring: false
priority: high
status: pending-owner-time
---

# Enable GitHub security automation before Beta

## Why this is pending

Funūn should add GitHub-native controls that catch leaked credentials,
vulnerable dependencies, and common code-level security defects before they
reach production. This is an owner settings task and may require paid GitHub
products if the repository remains private.

No GitHub setting was changed when this todo was written.

## Current repository baseline

- `.github/workflows/quality.yml` runs on pull requests and pushes to `main`.
- It already runs `npm ci`, strict TypeScript, ESLint, the complete Jest suite,
  a production dependency audit, and a full dependency audit.
- No `.github/dependabot.yml` is checked in.
- No CodeQL workflow is checked in; GitHub default setup would not add one.
- Secret-scanning and push-protection settings cannot be proven from local code
  and must be inspected in GitHub.

## Owner time estimate

- Initial settings and first scans: approximately 30–60 minutes.
- Alert review or credential rotation may take longer if existing findings are
  discovered.

## Before changing settings

- [ ] Confirm whether `PeteyFranchise/funun` is public or private and whether it
  is user-owned or organization-owned.
- [ ] Record the current GitHub plan and whether **GitHub Secret Protection** and
  **GitHub Code Security** are available or require purchase.
- [ ] Confirm at least two trusted people can administer security settings so
  one lost account cannot block incident response.
- [ ] Open the repository's **Security and quality** area and record existing
  dependency, secret, and code-scanning alerts before enabling new controls.
- [ ] Decide who receives security-alert notifications: initially Leadership
  and the designated Product/Engineering/IT owner.

## Step 1 — Dependabot

Dependabot is the first setup step because alerts and security updates are
generally available without purchasing the private-repository Code Security or
Secret Protection products.

- [ ] Enable the dependency graph if it is not already enabled.
- [ ] Enable **Dependabot alerts**.
- [ ] Enable **Dependabot security updates**.
- [ ] Add a reviewed `.github/dependabot.yml` for weekly npm and GitHub Actions
  version checks only when routine version-update PRs are desired.
- [ ] If version updates are enabled, group compatible patch/minor updates and
  cap open PRs so the queue does not overwhelm the team.
- [ ] Apply `dependencies` and `security` labels where useful.
- [ ] Keep **automatic merge disabled** during Beta.
- [ ] Require every Dependabot PR to pass Funūn's complete `Quality and
  security` workflow and receive human review.

### Dependabot validation

- [ ] Confirm the Dependabot page lists the root npm manifest and lockfile.
- [ ] Confirm the first dependency scan completes successfully.
- [ ] Triage every existing alert by exploitability and production reach.
- [ ] Never dismiss an alert solely because the upgrade is inconvenient;
  document compensating controls and a review date when deferring it.

## Step 2 — Secret scanning and push protection

- [ ] If the repository is private, confirm and approve the GitHub Secret
  Protection cost before enabling it.
- [ ] Enable **Secret scanning**.
- [ ] Enable **Push protection**.
- [ ] Enable validity checks if offered, understanding that GitHub may contact
  the issuing provider to determine whether a credential is active.
- [ ] Consider generic/AI-detected secret scanning after reviewing its expected
  false-positive volume.
- [ ] Restrict bypass authority to a very small Leadership or IT/security group.
- [ ] Require a written reason for every bypass and review bypass events.
- [ ] Do not create custom patterns until Funūn has a genuine internal token
  format that GitHub's provider patterns do not recognize.

### Existing-secret response

For every credible finding:

1. Revoke or rotate the credential at its provider immediately.
2. Update the secret in Vercel, Supabase, GitHub Actions, or the appropriate
   managed secret store.
3. Redeploy or restart consumers when required.
4. Confirm the old credential no longer works.
5. Remove it from Git history when exposure warrants history rewriting, with a
   coordinated plan for every clone and branch.
6. Record the incident and resolution without copying the secret into a ticket,
   Playbook entry, commit message, or chat.

Deleting the string from the newest commit is not sufficient remediation.

### Secret-protection validation

- [ ] Confirm scanning completes across Git history and all branches.
- [ ] Review and disposition every initial alert.
- [ ] Use GitHub's documented harmless/test procedure to confirm push
  protection blocks a supported pattern; never test with a live credential.
- [ ] Confirm bypass notifications reach the designated reviewers.

## Step 3 — CodeQL

- [ ] If the repository is private, confirm and approve the GitHub Code
  Security cost before enabling it.
- [ ] Choose **CodeQL default setup** for JavaScript/TypeScript.
- [ ] Start with GitHub's default query suite; expand only after the initial
  signal/noise level is understood.
- [ ] Confirm analysis runs on the default branch, protected branches, pull
  requests, and its scheduled cadence.
- [ ] Inspect the CodeQL tool-status page and verify JavaScript/TypeScript file
  coverage is credible.
- [ ] Triage the first scan before making CodeQL a required merge check.

### CodeQL validation

- [ ] The first scan completes without configuration or build failure.
- [ ] Every Critical/High result has an owner and disposition.
- [ ] False positives are documented narrowly; do not suppress an entire rule
  family to hide one noisy result.
- [ ] Confirm CodeQL does not receive application secrets through workflow
  configuration.

## Step 4 — Make the controls enforceable

Do this only after the existing direct-to-`main` release workflow is converted
to a branch-and-pull-request workflow. Enabling it prematurely can block an
urgent owner release.

- [ ] Create a `main` branch ruleset.
- [ ] Require pull requests before merging.
- [ ] Require the existing **Quality and security** status check.
- [ ] Require CodeQL after its first clean, stable scan.
- [ ] Block force pushes and branch deletion.
- [ ] Require conversations to be resolved before merge.
- [ ] Keep bypass authority minimal and review every bypass after use.
- [ ] Decide separately whether one approving review is practical during early
  Beta; do not create a rule the current staffing model must routinely bypass.

## Step 5 — Operating rhythm

- [ ] Add or confirm a private `SECURITY.md` reporting path that reaches a
  monitored Funūn mailbox and does not direct reporters to public issues.
- [ ] Review Critical alerts immediately and High alerts within one business
  day during Beta.
- [ ] Review Medium dependency/code findings weekly.
- [ ] Review secret-protection bypasses monthly, even when none are expected.
- [ ] Review GitHub administrator access quarterly and after every team-member
  departure.
- [ ] Record material findings in the incident/readiness system without storing
  credentials or unnecessary personal data.

## Definition of done

- [ ] Dependabot alerts and security updates are enabled and producing usable
  results.
- [ ] Secret scanning and push protection are enabled, or a documented interim
  control is active because licensing is not yet approved.
- [ ] CodeQL default setup is enabled, or a documented interim SAST control is
  active because licensing is not yet approved.
- [ ] Initial alerts are triaged; any exposed live credentials are rotated.
- [ ] Required checks are enforced on `main` once the PR workflow is adopted.
- [ ] Alert ownership, response expectations, and bypass review are documented.
- [ ] A harmless validation confirms each enabled control operates as intended.

## If paid GitHub products are deferred

- Keep Dependabot and the existing `npm audit` CI gates enabled.
- Add a reviewed secret-scanning job using a reputable pinned scanner such as
  Gitleaks, without sending repository contents to an unapproved third party.
- Evaluate a maintained SAST alternative such as Semgrep Community Edition.
- Pin third-party GitHub Actions to immutable commit SHAs before relying on
  additional marketplace workflows.
- Revisit GitHub Secret Protection and Code Security before public Beta or when
  the cost of maintaining equivalent controls exceeds the license cost.

## Guardrails

- Do not auto-merge dependency updates.
- Do not paste live secrets into GitHub issues, pull requests, workflow logs, or
  test fixtures.
- Do not dismiss a secret alert before revoking the credential when exposure is
  plausible.
- Do not give Dependabot, CodeQL, or third-party Actions more repository or
  secret access than required.
- Treat these tools as automated detection layers, not a replacement for RLS,
  authorization tests, threat modeling, production monitoring, or human review.
