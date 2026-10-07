# Three Dependabot alerts with no safe fix today — assessed, not ignored

**Captured:** 2026-10-06 · **Status:** deliberate no-action, with revisit triggers
**Why this file exists:** so the assessment is not re-derived every time GitHub re-posts the
banner, and so it actually gets revisited when upstream moves.

## The three

| package | sev | scope | vulnerable | patched | why not fixed |
|---|---|---|---|---|---|
| `katex` | low | runtime | `>=0.11.0 <0.18.2` | 0.18.2 | mermaid pins `^0.16.47` — even latest mermaid 12.1.0 does |
| `postcss-selector-parser` | medium | dev | `<7.1.6` | 7.1.6 | tailwindcss 3.4.19 wants `^6.1.2` — 7.x is a major bump |
| `sprintf-js` | medium | dev | `<=1.1.3` | **none** | no patched version exists upstream |

Advisories: GHSA-238p-pmpm-9mq7 · GHSA-rj75-hqrm-r3gf · GHSA-hp3w-g68c-fv3c

## Neither gate is failing, so this is not blocking anything

- `npm audit --omit=dev --audit-level=moderate` passes: `katex` is the only runtime one and it is
  **low**, below the moderate floor.
- `npm run audit:gate` passes at its high threshold. The two mediums are dev-only.

**No `audit-gate.ts` deferral was added**, deliberately. That list exists to suppress advisories
that would otherwise fail the build; none of these do. Adding entries would make the deferral
list a dumping ground and dilute the one mechanism that does expire on purpose.

## Why forcing an override would be the wrong trade

Each "fix" means overriding a transitive dependency outside its parent's declared range:

- **katex 0.16.47 → 0.18.2** breaks out of mermaid's `^0.16.47`. Two minor versions of a LaTeX
  renderer, inside a diagram engine, to close a low-severity issue.
- **postcss-selector-parser 6.1.4 → 7.1.6** is a major bump under tailwind's selector engine,
  with a large custom `tailwind.config.ts` riding on it. npm's own suggested fix for the related
  `braces` advisory was tailwindcss 4.3.3 — already rejected on the same grounds and recorded in
  `scripts/audit-gate.ts`.

This repo has shipped three controls that passed every check while being wrong. A dependency
override that silently changes selector parsing or math rendering is the same class of risk,
taken voluntarily.

## katex specifically — what the exposure actually is

`katex` is reachable: `components/playbook/PlaybookDiagram.tsx:27-28` dynamically imports mermaid
to render Playbook entry diagrams. So this is not dead code.

The surface is narrow, and that is by existing design rather than luck:

- **Authors are Funūn Team Members only** — Playbook entries are internal, not user content.
- `lib/playbook/diagrams.ts:4` allows only `flowchart`/`graph`/`sequenceDiagram`/
  `stateDiagram-v2`/`classDiagram` headers.
- `%%{...}%%` **directives are forbidden** (`diagrams.ts:12`), which is how mermaid config —
  including anything math-related — would be injected from source.
- `mermaid.initialize` runs `securityLevel: 'strict'`, `htmlLabels: false`
  (`PlaybookDiagram.tsx:32-39`).
- Output passes DOMPurify with an SVG profile and an explicit tag/attr denylist, then
  `assertSafePlaybookDiagramSvg`.

The advisory is *"existing prototype pollution can bypass trust restrictions"* — rated low. It
requires an author who can already publish internal doctrine to craft input that reaches katex
through a path the allowlist and `htmlLabels: false` are both narrowing.

**Not claimed:** that katex is definitively unreachable. Mermaid 11 can render `$$…$$` math in
labels, and I did not prove `htmlLabels: false` closes that path. The claim is that the exposure
is low and the available fix is riskier than the exposure.

## Revisit when any of these happens

- **mermaid moves off `^0.16.x`** — this is the real unblock for katex. Check
  `npm view mermaid dependencies.katex`; the day it allows `>=0.18.2`, bump mermaid and the alert
  closes with no override.
- **tailwind 4 migration** happens for its own reasons — `postcss-selector-parser` 7.x comes free
  with it, and the `braces` deferral in `scripts/audit-gate.ts` (expires 2026-11-02) closes too.
- **`sprintf-js` publishes a patch**, or `ts-jest`/`babel-plugin-istanbul` stops pulling
  `js-yaml@3`.
- **Playbook authoring opens beyond Funūn Team Members** — that changes the katex calculus
  immediately, because the author stops being trusted. Treat that as a hard gate on this
  assessment, not a nice-to-have.
- Any of the three is **re-rated upward**, or `npm audit --omit=dev --audit-level=moderate`
  starts failing.

## Related

- `scripts/audit-gate.ts` — the deferral mechanism and the one active `braces` entry
- [[reference_column_revoke_noop]] · [[reference_sql_null_comparison_disarms_guard]] — why this
  repo distrusts changes that look safe and are not verified
