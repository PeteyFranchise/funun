# A signed document should be superseded, not reverted

**Captured:** 2026-10-06 · **Status:** deliberate non-goal of migration 236, needs a build
**Source:** Pass 6 C-3 remediation — the residue left on the record rather than half-fixed

## What migration 236 closed, and what it left

236 stops a project **editor** touching any evidence field on `vault_documents`, stops **every**
client caller rewriting the four verifier-produced columns after a row exists, stops `user_id`
reassignment, and removes DELETE from editors. Pass 6 C-3's headline — *an editor can fabricate
signed legal evidence* — is closed.

**What it leaves:** the document **owner** can still revert their own signed document to
`pending`, which clears `signed_at`. `app/api/vault/[projectId]/documents/[docId]/route.ts:50-52`
does precisely that and it is reachable from the UI:

```ts
.update({
  status,
  signed_at: status === 'pending' ? null : new Date().toISOString(),
```

## Why it was not closed in 236

Because it is a real correction path. An artist who uploads the wrong PDF needs a way out, and a
database freeze would leave them holding a document they cannot fix. Blocking it without
replacing it trades a small integrity exposure for a support ticket the product cannot answer.

The honest fix is **supersede, not revert**: the old evidence survives as history and a new
document takes its place. That is a build —

- a `superseded_by UUID` (or a document-version chain) on `vault_documents`
- UI for superseded state, so a reader can see that evidence was replaced and when
- a decision about what superseding does to `calculate_vault_readiness` and to `sampleBlock`
- a `work_diary_events` entry so the replacement is visible in the song's history
- whether a superseded document can itself be deleted, and by whom

## Why the residue is tolerable in the meantime

It is the owner's own project, their own assertion, about their own document. Nothing crosses a
tenant boundary and nothing touches another person's rights. `work_diary_events` retains the
history of what happened to the work. Contrast the closed case: an **editor** — someone invited
to help — could previously mark a contract signed on a project they do not own.

## Related

- `.planning/deliberations/2026-10-05-pass-6-identity-access-review.md` — C-3
- `supabase/migrations/236_vault_documents_evidence_lockdown.sql` — states this as a non-goal
- `supabase/migrations/045_pitch_token_expiry_document_status_guard.sql` — the shape-only CHECK
  that establishes neither authenticity nor immutability
- [[gates_are_provisional]] — readiness behaviour here is expected to change with beta usage
