# Phase 19: Profile & Identity Model Cleanup — Discussion Log

**Date:** 2026-07-23
**Mode:** discuss (default, interactive) · SPEC-locked (5 requirements)
**Areas selected:** all four — Claim pre-fill confirm (R2), Correction flag flow (R4), Licensee note (R5), Settings rights section (R1)

*(Human-reference audit only — not consumed by downstream agents. Decisions live in 19-CONTEXT.md.)*

## R2 — Claim pre-fill confirm
| Question | Options (rec = recommended) | Selected |
|---|---|---|
| Confirm surface | Settings confirm-and-lock (rec) / first-login modal / signup onboarding step | Settings confirm-and-lock |
| Granularity | Per-field (rec) / one 'all correct' button / accept-all + edit | Per-field |
| Provenance | Name the source (rec) / generic / none | Name the source |
| Before confirm, data flows? | Live but flagged (rec) / hold inactive / you decide | Live but flagged |

## R4 — Correction flag flow
| Question | Options (rec = recommended) | Selected |
|---|---|---|
| Flag entry | Contract Locker credit view (rec) / dedicated 'My credits' list / approval page | Contract Locker credit view |
| Owner notify | Bell + email (rec) / bell only / email only | Bell + email |
| Flag payload | Structured field + value (rec) / + optional note / free-text | Structured field + value |
| Owner applies | Guided deep-link + staged + void/amendment (rec) / notify only / you decide | Guided |

## R5 — Licensee note
| Question | Options (rec = recommended) | Selected |
|---|---|---|
| Placement | Boxed callout by parties block (rec) / footer / end section | Boxed callout by parties block |
| Wording | Full version w/ disclaimer (rec) / short one-liner / self-word | Full version |
| Surfaces | PDF + read-only share/export (rec) / PDF only / you decide | PDF + share/export |

## R1 — Settings rights section
| Question | Options (rec = recommended) | Selected |
|---|---|---|
| Remaining rights section | Keep + 'used everywhere' help line (rec) / delete-only / regroup all | Keep + help line |

**Deferred ideas:** none — discussion stayed in scope.
**Claude's discretion:** unconfirmed-badge styling, Locker "this is wrong" affordance placement, R4 notification copy, R1 rescue-migration verification/log surface.
**Note:** every area landed on the recommended (reuse-driven) default.
