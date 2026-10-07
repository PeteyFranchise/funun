# Resume here — 2026-10-07

## Nothing is mid-flight. Everything is pushed.

### Open PR you own a decision on

**[#183] migration 240** — Pass 6 medium findings, part 1. CI green, **unmerged on purpose**:
migrations are human-gated, so it wants `supabase db push` + the nine probes in the migration's
footer before merging. Probes N2 (recipient marks a notification read) and O2 (the matcher
scores) are the two that matter most — a guard blocking either would be worse than the exposure
it closes.

Also open, not mine, from earlier sessions: **#170** (deps) and **#156** (two false comments).

### Shipped today, all merged and verified

Seven migrations — 233/234 (claimed_by guard that never fired), 235/236/237 (Pass 6 C-2/C-3/C-4),
238 (readiness triggers), 239 (rights ledger) — every one behaviourally probed against
production. Plus Pass 6 H-3, the Dependabot assessment, and the six-slice submit-a-song
questionnaire (#177–#182).

### What is buildable next, no decisions needed

1. **Pass 6 mediums, part 2** — `works`, `tool_outputs`, `collaborator_invites`, `pitches`. Left
   out of 240 deliberately: each needs a judgement about what a collaborator may legitimately
   change, unlike the four in 240 whose shape their own callers fully determined.
2. **Marketing CTA → `/signup?next=%2Fvault%2Fnew%2Fsong`** — the deep link works and is tested;
   the marketing page does not point at it yet. Goes through the frozen-artifact re-freeze
   (see `2026-09-30` marketing todo for the four traps).
3. **Browser pass over submit-a-song.** Fully unit-tested, never walked in a browser. Unlike the
   migrations there is no probe step, and app code fails in ways tests do not see.

### What needs YOU before anything can move

- **Phase 50 / The Crate** — counsel on what "admitted" means contractually, plus five owner
  decisions (negative AI attestation, append-only vs supersede, which Passport target,
  `UNIQUE(track_id)`, email failure policy).
- **Phase 41** (Collaborator Discovery & Mobile Contact Matching) — next roadmapped phase,
  unplanned; planning it well needs your input.
- **Repo private** — upgrade to Pro FIRST or www.funun.studio goes down (Pages on a private repo
  needs a paid plan). CodeQL also stops. Order of operations in
  `2026-09-20-make-repo-private-when-affordable.md`.
- **TRUNCATE/TRIGGER sweep** — starts with the grant census query in
  `2026-10-06-truncate-trigger-grants-sweep.md`, which only you can run.

### Standing

The 23 uncommitted files in the tree belong to parallel sessions — nav components, `AuthBanner`,
`components/brand/`, several `.planning/quick/` folders. Untouched by me, local-only, and not
backed up anywhere.

Password reset: **done**.
