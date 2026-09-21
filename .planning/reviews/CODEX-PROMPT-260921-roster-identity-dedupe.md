---
type: review-prompt
reviewer: codex
created: 2026-09-21
status: awaiting-response
subject: preventing duplicate roster rows for one person as discovery adds a second identity path
blocks: .planning/phases/41-collaborator-discovery-mobile-contact-matching/ (discuss-phase, area 4)
---

# Codex review — how do we avoid two of the same Maya?

## Why this exists

Phase 41 adds a second way to create a roster row: today you type an email, soon
you pick a member from search. Those two paths establish identity by different
keys, and the existing duplicate protection only understands one of them.

## The prompt — copy from here

````text
# FIRST: write your answer to a file

Write your entire response to
`.planning/reviews/CODEX-RESPONSE-260921-roster-identity-dedupe.md` in this repo.
Create the file. **Do not print its contents back** — reply with only the path
and the section headings.

---

# How do we stop one person becoming two roster rows?

Phase 41 (Collaborator Discovery) adds member search as a second way to create a
`collaborators` row. The owner's question, verbatim: **"how can we avoid having
two of the same Mayas?"**

## The scenario

A roster owner typed Maya's email months ago. She never signed up, so
`claimed_by` stayed null. Today the owner finds her through People Search and
adds her. Search returns a profile id, never an email — email is PII and is
excluded from the discovery projection. So the existing email-based duplicate
check cannot fire, and the roster ends up with two Mayas.

## What I verified in the code — CHECK THIS, do not inherit it

- **There is no unique constraint of any kind on `collaborators`.** Duplicate
  prevention is application-level only.
- The app check matches **only on normalized email**, scoped to the caller's own
  roster, excluding archived rows, and returns the existing row with
  `{ reused: true }` (`app/api/collaborators/route.ts:44-70`). Its comment is
  deliberate: "names are not unique enough to establish identity."
- It fails closed on a lookup error rather than inserting
  (`app/api/collaborators/route.ts:62-65`).
- **It only runs when an email is supplied** — `if (typeof update.email ===
  'string')`. A create without an email skips deduplication entirely.
- Migration 179 adds a `BEFORE INSERT OR UPDATE OF email` trigger that derives
  `claimed_by` server-side from `auth.users` + `user_profiles`, with no client
  control, and sets `status := 'confirmed'`
  (`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:16-55`).
  **It links but does not deduplicate** — nothing stops it setting the same
  `claimed_by` on a second row.
- `claimed_by` grants the claimed member RLS SELECT on the row
  (`supabase/migrations/052_restore_collaborators_claimed_by.sql:10-19`), and the
  owner manages rows via `user_id` (`018_collaborators_split_sheets.sql:29-32`).
- Claimed rows cannot be hard-deleted by the owner but can be archived or edited
  (`app/api/collaborators/[id]/route.ts:38-89`).

## Decisions already locked for Phase 41 — work within these

- A found member is linked immediately by setting `claimed_by`.
- Rights fields (IPI, PRO, publisher) are **not** copied onto the roster row and
  **not** disclosed to the roster owner. Phase 41 links identity only.
- The roster owner must never learn the member's email address through this path.
- A block in either direction ends the whole action: no row, no email, no
  disclosure.

## Answer these

1. **What is the identity key for a roster row?** `claimed_by` when present,
   normalized email otherwise, something composite, or something else? Say what
   happens when the two disagree — an unclaimed row with email A and a found
   member whose account email is A.

2. **Should there be a database constraint, and on exactly what?** A partial
   unique index on `(user_id, claimed_by) WHERE claimed_by IS NOT NULL` and
   another on normalized email are the obvious candidates. Consider: archived
   rows, rows with no email, case and whitespace normalization, and whether a
   constraint would break existing production data. **Assume existing duplicates
   may already exist** — migration 179 can set the same `claimed_by` twice today.

3. **Merge or reuse?** When the server detects that a found member matches an
   existing unclaimed row, should it set `claimed_by` on that row, create a new
   one and archive the old, or ask the owner? Note the owner's notes, favourite
   flag, and split-sheet references live on the existing row. Say what happens to
   split sheets and works that already reference the older row id.

4. **The race.** Two concurrent adds of the same person currently both pass the
   check-then-insert and produce two rows. Does the fix belong in a constraint,
   an advisory lock, an upsert, or a SECURITY DEFINER RPC that does the whole
   resolve-and-link atomically? Recommend one.

5. **Archived rows.** Dedupe deliberately excludes `archived_at IS NOT NULL`, so
   adding someone you previously archived creates a second row. Is that right —
   archiving means "gone, start fresh" — or should it resurface the archived row?

6. **Can this be solved without disclosing the email?** The server knows the
   member's account email; the owner must not. Confirm any proposal keeps the
   match server-side and leaks nothing through response shape, timing, or error
   text — including the `{ reused: true }` flag, which today tells the caller a
   row already existed.

## Constraints

- Migrations are human-gated. Propose SQL; never claim anything is applied.
- Production is at migration 227. A fix is a new migration.
- `main` is protected. This repository is PUBLIC.
- Do not propose exposing email or rights identifiers to the roster owner.
- Client code may never supply or choose `claimed_by` — that boundary is
  established and must hold.

## Structure

- BOTTOM LINE — the identity key and the fix, in 5 sentences
- CORRECTIONS — where my reading above is wrong, with evidence
- IDENTITY KEY — what establishes that two rows are the same person
- CONSTRAINT — proposed SQL, and what it does to existing data
- MERGE SEMANTICS — including references from split sheets and works
- RACE — the recommended mechanism
- ARCHIVED ROWS — the call, with reasoning
- LEAKAGE CHECK — proof the match discloses nothing to the owner
- CONFIDENCE — verified by reading code vs inferred

Cite `file:line` throughout. Where you are guessing, say so.

Write the file. Reply with the path and headings only.
````

## Copy to here

## Response

_Not yet received. Same triage: re-verify each claim in-code before accepting._
