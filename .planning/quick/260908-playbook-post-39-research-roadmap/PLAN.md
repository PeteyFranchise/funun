# Playbook Post–Release 39 Research Roadmap

## Objective

Preserve ten possible post–Release 39 Playbook capabilities as a future research and exploration backlog without presenting them as approved product commitments, launch requirements, or sequenced releases.

## Scope

- Add one discoverable entry to the main Funūn roadmap.
- Create a dedicated Playbook research brief covering each proposed capability.
- For every capability, record the opportunity, questions requiring research, key guardrails, and an evidence-based trigger for reconsideration.
- Keep Releases 27–31 as the operational-v1 horizon and Releases 32–39 as optional enterprise maturity work; do not assign release numbers to this research backlog yet.

## Files expected to change

- `.planning/ROADMAP.md`
- `.planning/deliberations/playbook-post-39-research-roadmap.md`
- `.planning/quick/260908-playbook-post-39-research-roadmap/SUMMARY.md`

## Validation plan

- Confirm all ten owner-requested research areas appear in the dedicated brief.
- Confirm the main roadmap links to the brief and labels it non-committed, post–Release 39 exploration.
- Run `git diff --check` on the documentation changes.

## Risks and coordination notes

- The worktree contains concurrent, uncommitted Playbook and Phase 38 work. This task only adds a new quick-plan folder, a new deliberation, and one additive roadmap bullet.
- No code, migration, production configuration, commit, push, or deployment is in scope.
- These concepts must not be treated as approved releases until usage evidence, research, privacy/security review, and owner discussion justify promotion into a formal phase.
