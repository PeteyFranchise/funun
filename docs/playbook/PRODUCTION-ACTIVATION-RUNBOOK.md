# Playbook Production Activation Runbook

**Status:** Owner-operated. Release 9 prepares and verifies the workflow; it does not authorize an agent to alter production.

## Purpose

Activate rich Playbook documents, reading operations, and the organizational doctrine package without colliding with the workspace migration program or turning publication into a bulk import.

## Non-negotiable boundaries

- Migrations run in ledger order. Phase 38.2 owns 199–200; Playbook owns 201–202.
- Do not rename 201–202 to occupy an earlier number.
- Database application is a human-gated owner action.
- Each doctrine enters as one unpublished review draft. There is no bulk-publish step.
- Published entries are revised through immutable history, never overwritten in place.
- If a production verification fails, stop publication and use a reviewed forward fix. Do not improvise a destructive rollback.

## 1. Local ledger preflight

Run:

```bash
npm run playbook:activation-check
```

Before Phase 38.2 is complete, the expected result is `HELD`. A hold is success: it proves the guard refuses to claim missing migration numbers.

The result may change to `READY FOR HUMAN PROMOTION REVIEW` only when:

- active migration files 199 and 200 exist;
- candidate files 201 and 202 still contain their human gates; and
- no different active migration already claims 201 or 202.

This command checks local files only. It does not prove that production has the same ledger.

## 2. Production-ledger verification

The owner verifies local/remote migration parity through 200 using the established Supabase production workflow. Do not substitute a local database result for production evidence. If parity is not exact, stop and reconcile before touching the Playbook candidates.

## 3. Candidate promotion review

Review candidate 201 and 202 as a pair:

- 201 installs rich documents, lifecycle controls, governance metadata, source adoption, revisions, rooms, subgroups, and Gameplan links.
- 202 depends on 201 and installs reading assignments, acknowledgements, and idempotent reminders.
- Confirm security definer functions, grants, RLS, trigger order, legacy-row backfills, and table constraints against the production schema.
- Only after review may the candidates be copied into `supabase/migrations` under their reserved names.

Promotion is a repository change, not permission to apply the migrations.

## 4. Application and verification

The owner applies migration 201, verifies its tables, columns, triggers, constraints, grants, and backfills, then applies and verifies 202. Preserve the command output as release evidence. Stop on the first failure; do not continue to the doctrine pilot with a partially verified schema.

## 5. Application deployment

Deploy the corresponding Playbook application release only after the migration sequence is reviewed. The Doctrine Readiness page intentionally fails safely when 201 or 202 is absent, but activation still requires both.

## 6. Production UAT

Use separate ordinary Team Member, room-lead, and Leadership sessions to complete every checklist in Doctrine Readiness. Verify direct-URL denial, draft privacy, mobile rendering, hostile Markdown rejection, revision immutability, source-change behavior, and explicit supersession.

Download the passed UAT JSON report and attach it to the release handoff. The report records operator assertions; it is not an automated security attestation.

## 7. A&R-first pilot

After UAT passes:

1. Preview the exact A&R source beside its Playbook rendering.
2. Confirm destination, SHA-256, reviewer roles, and supersession inventory.
3. Create one unpublished review draft.
4. Complete A&R and Leadership review.
5. Publish the approved replacement through the ordinary lifecycle.
6. Review every listed legacy A&R entry and explicitly supersede the replaced entries.
7. Confirm the activation console reports the pilot complete.

Do not begin the remaining doctrine package until step 7.

## 8. Controlled package rollout

Adopt the remaining manifest entries one at a time. For each entry: preview, verify, draft, review, publish, assign required reading where appropriate, and confirm acknowledgement behavior. BDT legacy entries receive the same explicit supersession treatment as A&R.

## 9. Stop conditions

Pause activation immediately for:

- any cross-room access or draft-body exposure;
- a source/hash mismatch;
- mutable or missing publication history;
- an unsafe Markdown or Mermaid render;
- duplicate assignments or reminders;
- migration-ledger disagreement;
- partial migration failure; or
- any publication action that cannot be tied to an authorized user and audit record.

Document the observation, preserve evidence, and route a forward fix through review before resuming.
