# DONE 2026-10-06 — migrations 235–238 behaviourally verified in production

All four applied and probed against production. PR #171 merged.

- **235** tracks rights-column lockdown — 8/8 probes PASS
- **236** vault_documents evidence lockdown — 8/8 PASS
- **237** split_sheets executed immutability — 9/9 PASS
- **238** readiness trigger DEFINER fix — 4/4 PASS (score moved 0 → 10)

Pass 6 criticals C-2, C-3 and C-4 are closed. C-1 was closed by 233/234 (PR #169).

## The finding that came out of this

238 is a live defect the verification itself uncovered. Migration 070 revoked EXECUTE on
`calculate_vault_readiness` from `authenticated`, justified in its own header as *"every use is
trigger-internal, which does not require a role-level EXECUTE grant."* That is false for a
`SECURITY INVOKER` caller, and both callers were INVOKER — so every authenticated write to
`tracks`, `vault_documents`, `vault_assets` and `tool_outputs` raised 42501.

Exposure at the time of the fix: **0 tracks, 0 documents, 0 assets, none ever created.** Never
hit by a real write.

**It was found only because the probe set included must-succeed cases.** With refusal probes
alone every one of 235's would have "passed" against a table nobody could write at all.

## Deliberate residue, tracked separately

- `2026-10-06-vault-documents-supersede-not-revert.md` — an owner can still revert their own
  signed document to pending; the honest fix is a supersede model, which is a build.
- `2026-10-06-track-delete-vs-archive.md` — owner DELETE on tracks carrying an ISRC or credited
  writers stays for now; archive-instead deferred pending beta feedback.

## Still open from Pass 6

H-3 multi-role staff gate mismatch · H-2's four service-read clusters (architectural) · six
medium cross-subject mutations · dormant legacy community tables. The rights-ledger lockdown
(#164) is next and takes migration **239**.
