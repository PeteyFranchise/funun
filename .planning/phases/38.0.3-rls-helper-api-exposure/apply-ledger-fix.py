#!/usr/bin/env python3
"""
Phase 38.0.3 / Playbook ledger reconciliation.

RUN ONLY when `git status --porcelain .planning/ROADMAP.md` is CLEAN.
If Codex's R32-R39 lines are still uncommitted, committing after this edit
would sweep them into the wrong commit.

Fixes a double-claim that was MINE, not Codex's: the Phase 38.2 reservation
moved three times today (199-200 -> 200,203 -> 203,204) as numbers were taken
for hotfixes. Codex read the "200, 203" version, correctly skipped 203, and
took 204 while it was free. The later shift onto 204 collided with it.
"""
import io, sys, subprocess

ROADMAP = '.planning/ROADMAP.md'

dirty = subprocess.run(['git','status','--porcelain',ROADMAP],
                       capture_output=True, text=True).stdout.strip()
if dirty:
    sys.exit('REFUSING: %s is dirty (%s).\n'
             'Commit Codex\'s R32-R39 lines first, then re-run.' % (ROADMAP, dirty))

s = io.open(ROADMAP, encoding='utf-8').read()

OLD_382 = '| 203, 204 | Phase 38.2 (billing, beta flag) | reserved (was 200, 203; 200 taken by the Antenna hardening above, and 201–202 belong to the Playbook workstream) |'

NEW_ROWS = '''| **201–202** | Playbook rich-content model R1 (Codex) | **CANDIDATE, unapplied.** `.planning/quick/260907-playbook-doctrine-publication-uat/`. Drafted outside `supabase/migrations/` by design. |
| **203** | **RETIRED — DO NOT FILL** | Held for Phase 38.2 while the reservation read "200, 203"; Codex correctly skipped it. Phase 38.2 has since moved to 211–212, so nothing will ever claim 203. **Do not reuse it.** Filling it now would place a migration numerically *before* 204–210 while applying *after* them — harmless in the SQL Editor, but it would trip `supabase db push`'s out-of-order check the moment anyone switches to the CLI. A dead number is cheaper than that trap. |
| **204** | Playbook review threads (Codex) | **CANDIDATE, unapplied.** `.planning/quick/260908-playbook-review-notes/`. Claimed while free; the later Phase 38.2 reservation onto 204 was an error in THIS ledger, now corrected. |
| **205** | Playbook change broadcasts (Codex) | **CANDIDATE, unapplied.** `.planning/quick/260908-playbook-change-broadcast/`. |
| **206** | Playbook enablement platform, R17–26 (Codex) | **CANDIDATE, unapplied.** `.planning/quick/260908-playbook-releases-17-26/`. |
| **207** | Playbook operational v1, R27–31 (Codex) | **CANDIDATE, unapplied.** `.planning/quick/260908-playbook-releases-27-31/`. Depends on candidates 201, 202, 204, 205, 206. Grant posture reviewed 2026-09-08 and it is CORRECT — `REVOKE ALL … FROM PUBLIC, authenticated, anon` then `GRANT … TO service_role`, naming all three roles, which is exactly what migration 047 omitted. Two definers use `SET search_path = pg_catalog, public` rather than the repo's `''` doctrine (0 of 79 migrations use that form); harmless because their bodies are fully schema-qualified and grants are service-role-only, but it will surface in any future definer sweep. |
| **208** | Phase 38.0.3 Tier 1 — targeted revokes + one drop | **AUTHORED, NOT APPLIED.** Was planned as 207; moved because Codex claimed 207 between planning and execution. |
| **209** | Phase 38.0.3 Tier 2 — thirteen caller-identity binds | **AUTHORED, NOT APPLIED.** Apply together with 208, and only AFTER Part A's pre-run gate clears. |
| **210** | Phase 38.0.3 Tier 3 — `no_block` relocation (plan 05) | **RESERVED.** Waits until 208/209 are applied and verified (owner decision D4). |
| **211–212** | Phase 38.2 (billing, beta flag) | **RESERVED.** Moved here from "203, 204": 204 was already Codex's, and 203 is retired above. A contiguous block at the end keeps Phase 38.2's own migrations in order relative to everything before them. |'''

OLD_201 = '| **201–202** | **Playbook rich-content model, Release 1 (Codex, in progress 2026-09-07)** | **RESERVED.** Revision-history and schema changes are being drafted OUTSIDE `supabase/migrations/` specifically to avoid a number conflict while Phase 38 work is live. 197–198 belong to Phase 38.0.2, 199 to its hotfix, 200 to the Antenna hardening, and 203/204 to Phase 38.2, so this is still the next free block — unchanged by the 2026-09-08 hotfix. Claim these when the draft lands. |'

if OLD_382 not in s:
    sys.exit('REFUSING: Phase 38.2 anchor row not found — the ledger changed. Re-derive before editing.')
if OLD_201 not in s:
    sys.exit('REFUSING: 201-202 anchor row not found — the ledger changed. Re-derive before editing.')

s = s.replace(OLD_382, NEW_ROWS, 1)
s = s.replace('\n' + OLD_201, '', 1)   # superseded by the ordered rows above

io.open(ROADMAP, 'w', encoding='utf-8').write(s)
print('Ledger reconciled: 203 retired, Codex 204-207 recorded, Phase 38.2 -> 211-212.')
print('Review with: git diff .planning/ROADMAP.md')
