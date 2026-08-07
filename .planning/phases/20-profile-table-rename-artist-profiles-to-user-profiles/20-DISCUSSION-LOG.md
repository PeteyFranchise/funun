# Phase 20: Profile Table Rename — Discussion Log

**Date:** 2026-07-24
**Mode:** discuss (default, interactive) · no SPEC (the `what` is locked in the ROADMAP Phase 20 locked-inputs block)
**Areas selected:** all three — Zero-downtime rename plan, Type & symbol renaming scope, Smoke-test gate before drop

*(Human-reference audit only — decisions live in 20-CONTEXT.md.)*

## Zero-downtime rename plan
| Question | Options (rec = recommended) | Selected |
|---|---|---|
| Rename strategy | Compatibility view (rec) / coordinated deploy window / permanent dual-name alias | Compatibility view |
| Sequencing | 2 pushes, deploy between (rec) / 1 push + tight deploy / you decide | 2 pushes, deploy between |

## Type & symbol renaming scope
| Question | Options (rec = recommended) | Selected |
|---|---|---|
| Symbol depth | Table + query strings + the `ArtistProfile` type (rec) / DB + query strings only / everything incl. locals | Table + query strings + the type |

## Smoke-test gate before drop
| Question | Options (rec = recommended) | Selected |
|---|---|---|
| Smoke-test set | Full set (rec) / core set / you decide | Full set |
| Drop timing | Short soak then drop (rec) / drop immediately after smoke tests / you decide | Short soak, then drop |

**Deferred ideas:** none — stayed in scope.
**Claude's discretion:** precise per-file sequencing of the ~79 runtime ref updates, generated-types regen, the exact `CREATE VIEW` body + RLS/write-through mechanics, migration file bodies.
**Note:** every area landed on the recommended (Phase-19-informed) default.
