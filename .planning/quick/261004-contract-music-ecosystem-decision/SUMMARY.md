# Contract–Music Ecosystem Decision Record — Summary

## What changed

- Added a standalone product decision mapping agreements across Song Passport, Sound Vault, Contract Locker, and The Crate.
- Defined each system's responsibility and the cross-system lifecycle from rights evidence through buyer licensing and delivery.
- Defined a many-to-many `contract_resource_links` concept covering works, recordings, releases, contributors, listings, deals, payments, amendments, and supersession.
- Defined how executed agreements may support Passport facts without silently proving or overwriting them.
- Defined Sound Vault agreement/readiness gates and The Crate's buyer-safe clearance boundary.
- Recorded an agreement taxonomy with the reason each instrument exists and a foundation → catalogue authority → buyer transaction build order.

## Validation run

- Confirmed composition, recording/master, release, catalogue-authority, and buyer-deal scopes remain distinct.
- Confirmed Contract Locker remains the agreement lifecycle owner while other systems consume authorized references.
- Confirmed catalogue admission and professional roles never imply licensing/signing authority.
- Confirmed buyers receive limited clearance signals and their own deal documents, not upstream private agreements.
- Confirmed executed-contract and payment gates precede clean-master delivery.
- `git diff --check` passed for both new task paths.

## Coordination note

Claude was concurrently working in the repository. This task created only uniquely named, additive files and did not modify any shared roadmap, phase, TODO, blueprint, migration, or runtime file.

## Workflow note

Native `/gsd-quick` invocation was unavailable in this Codex session, so the AGENTS.md manual quick-task fallback was used.

