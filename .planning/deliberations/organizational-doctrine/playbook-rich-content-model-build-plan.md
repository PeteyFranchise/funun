# The Playbook Rich-Content Model Build Plan

**Status:** OWNER-APPROVED — Releases 1–3 application work complete locally 2026-09-07; migration reconciliation and doctrine publication remain gated
**Commit constraint:** Do not commit, push, migrate or deploy until Claude's concurrent work is reconciled.

## Outcome

Extend The Playbook rather than replace it. Preserve existing executable SOP and CRM Topic entries, add a rich `document` entry type, reuse the existing safe React Markdown foundation and give doctrine a reviewable publication and revision lifecycle.

## Target content model

| Entry type | Purpose | Content shape |
|---|---|---|
| `sop` | Executable checklist | `{ items: string[] }` |
| `topic` | Coaching questions available to CRM Gameplans | `{ questions: string[] }` |
| `document` | Rich doctrine, policy, training and reference | `{ schemaVersion: 1, format: "markdown", body: string }` |

Rich documents coexist with SOPs and Topics. The CRM continues selecting only published Topic entries.

## Data model

Additive schema work must:

- Permit `document` as an entry type.
- Add a stable article slug, explicit sort order, publication time and revision number.
- Record `native` or `adopted_markdown` source kind, source path, source hash and adoption time.
- Add immutable entry revisions.
- Add archived and superseded lifecycle states without losing published history.
- Enforce that an entry's subgroup belongs to its room.
- Support optimistic concurrency so an approval cannot publish a stale draft.

The active migration number will be assigned only after Claude's Phase 38 work is reconciled. Until then, schema SQL remains a clearly labeled draft planning artifact.

## Validation and security

- Replace opaque JSON acceptance with a strict discriminated Zod schema for each entry type.
- Bound titles, checklist items, questions and Markdown size.
- Continue prohibiting raw HTML.
- Allow only approved internal links and safe `http`, `https` and `mailto` protocols.
- Disable arbitrary remote images in the first release.
- Treat database-authored Markdown as untrusted content.
- Validate subgroup ownership server-side and at the database layer.
- Require the expected revision number for edits and approval.
- Audit adoption, creation, draft save, submission, approval, rejection, publication, archive, supersession and restoration.

## Reader experience

Add `/admin/playbook/[room]/[slug]` as the rich article route. The room becomes a structured article library rather than one long page.

An article shows:

- Title and summary.
- Room and subgroup.
- Publication and review state.
- Article owner and reviewer where allowed.
- Table of contents and heading anchors.
- Responsive tables.
- Typed callouts.
- Related doctrine and related CRM Gameplans.
- Source and revision history.

## Authoring experience

Add Document beside SOP and Topic. The first release includes:

- Markdown textarea and live preview side-by-side on desktop.
- Edit/preview toggle on mobile.
- Heading, list, link, callout and table insertion helpers.
- Subgroup selection.
- Save Draft, Submit for Approval and explicit Publish actions.
- Unsaved-change and stale-revision warnings.
- Word and character counts.
- Reviewable published-versus-draft comparison.

Even an approver should be able to save without immediately publishing a long policy edit.

## Callouts

Use GitHub-style alert syntax:

```md
> [!WARNING]
> Never treat licensing GMV as Funūn revenue.
```

Supported intents are Note, Tip, Caution and Warning. Visual color follows intent; meaning does not depend on color alone.

## Diagrams

Diagrams are Release 2. Recognize fenced `mermaid` blocks, permit an approved subset, render with strict security configuration, sanitize output and show source fallback when rendering fails. Arbitrary HTML or unsanitized SVG is prohibited.

## Markdown adoption

Adoption is one-time, not bidirectional sync:

1. Select an approved Markdown source.
2. Import it as a draft document.
3. Store path, source hash and adoption time.
4. Assign room, subgroup, owner and reviewers.
5. Preview and publish through ordinary approval.
6. Make the database entry authoritative.
7. Surface later source changes for review.
8. Never auto-overwrite in-app edits or write from Vercel back to Git.

## Implementation releases

### Release 1 — Rich documents

- Additive data model and immutable revisions.
- Strict content validation.
- Rich article route.
- Safe Markdown, tables and callouts.
- Document editor and preview.
- Explicit draft and publish workflow.
- Room and subgroup organization.

### Release 2 — Adoption and connected knowledge

- Restricted Mermaid diagrams. **Complete locally with strict rendering, DOMPurify, a second SVG safety policy and source fallback.**
- Repository document adoption and source-change notices. **Complete locally.**
- Doctrine-to-Gameplan links. **Complete locally.**
- Search and filtering. **Complete locally, including doctrine-body search.**
- Review dates, due-state visibility and scheduled idempotent owner notifications. **Complete locally.**
- Import and publication of the organizational doctrine package. **Workflow complete locally; human-reviewed production publication deferred.**

## Verification

- Existing SOP creation, approval and rendering remain unchanged.
- Existing Topic entries still populate CRM Gameplans.
- A document can render headings, paragraphs, lists, links, callouts and wide tables on desktop and mobile.
- Raw HTML, unsafe links, remote image abuse and hostile Markdown do not execute.
- Cross-room subgroup assignment fails.
- Stale edits and stale approvals fail safely.
- Unauthorized roles cannot read or mutate a room by navigating directly.
- Revision history preserves every published version.
- Doctrine import is idempotent and never overwrites later edits automatically.

## Estimated effort

- Data model and validation: 1–2 engineering days.
- Reader and safe renderer: 2–3 days.
- Editor and preview: 3–5 days.
- Diagrams and responsive table completion: 2–4 days.
- Adoption, revisions and diffs: 3–5 days.
- Doctrine import, access verification and publication QA: 2–3 days.

A careful complete build is approximately three to four engineering weeks for one engineer. A first release without diagrams and source-change detection is approximately one to two weeks.
