# CodeQL triage and beta branch gates — summary

## Initial state

- GitHub secret scanning and push protection were enabled.
- Dependabot alerts and security-update pull requests were enabled; automatic merge remained disabled.
- CodeQL default setup completed its first JavaScript/TypeScript scan successfully.
- The initial CodeQL scan produced 44 alerts: 25 critical, 14 high, and 5 medium.
- No repository ruleset or legacy `main` branch protection was configured.
- The five most recent Quality and security workflow runs failed at `npm ci` because `package-lock.json` was incomplete.

## Evidence-based triage

- Confirmed: `scripts/provision-test-admin.mjs` printed a generated or supplied password to terminal output.
- Confirmed defense-in-depth: middleware derived a server-side fetch destination from the incoming request origin.
- Confirmed operational blocker: `package-lock.json` omitted transitive packages required by `npm ci`.
- Test-only findings: the PDF parser ReDoS alert and four migration-test regex alerts are not reachable from production runtime.
- Trusted local-tool findings: seven Supabase verification/provision scripts use an operator-supplied Supabase base URL and are not web entry points.
- Same-origin browser findings: eighteen request-forgery alerts are relative browser API requests; IDs only select same-origin route paths whose server handlers independently authenticate and authorize.
- Trusted URL findings: delivery and cover-art links are server-generated signed URLs or local `blob:` preview URLs; the public signup link is built from trusted deployment configuration.
- Session identity finding: tab identity stores a user ID, workspace class, and label, never the password or access token that CodeQL associated with the sign-in response.

## Remediation

- Passwords are no longer accepted as command-line arguments or printed by the test-admin utility. An optional environment value may set the password; otherwise the user completes the forgot-password flow.
- Middleware claim completion now uses an HTTPS endpoint whose hostname must be exactly `funun.studio` or `www.funun.studio`; invalid or absent configuration fails closed.
- Regenerated the npm lockfile so clean CI installation resolves the complete dependency graph.

## Local verification

- `npm ci --dry-run --ignore-scripts`: passed.
- `npm run typecheck:strict`: passed.
- `npm run lint`: passed with only ESLint's legacy-configuration deprecation notice.
- `npm test -- --runInBand`: 574 suites and 7,052 tests passed.
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilities.
- `npm audit --audit-level=high`: zero vulnerabilities.
- `npm run build`: passed; 151 pages generated.

## Remaining rollout

- Push the remediation commit and require the GitHub Quality and security workflow to pass.
- Let CodeQL rescan the changed sources.
- Dismiss only the traced non-production/trusted-boundary findings with specific comments.
- Configure an enforced `main` ruleset after both required checks are green.
