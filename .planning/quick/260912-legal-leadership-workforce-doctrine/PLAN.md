# Legal Leadership and Workforce Doctrine Update — Plan

## Objective

Close the legal-leadership gap in Funūn's approved workforce plan and create a
dedicated doctrine defining legal leadership, job outlines, authority boundaries,
and hiring triggers from beta through global scale.

## Scope

- Add an explicit General Counsel milestone and legal-team progression to the
  workforce and commercial-scale plan.
- Create a detailed Legal Leadership and Roles Doctrine that distinguishes
  licensed legal judgment from Rights Operations and Contract Operations.
- Connect the new doctrine to the organizational package, publication map, and
  Playbook publication manifest without publishing it or changing production data.
- Update focused manifest tests if the new publication entry changes expected
  inventory.

## Files expected to change

- `.planning/deliberations/organizational-doctrine/workforce-and-commercial-scale-plan.md`
- `.planning/deliberations/organizational-doctrine/legal-leadership-and-roles-doctrine.md`
- `.planning/deliberations/organizational-doctrine/functional-team-doctrines.md`
- `.planning/deliberations/organizational-doctrine/README.md`
- `.planning/deliberations/organizational-doctrine/playbook-publication-map.md`
- `lib/playbook/publication-manifest.ts`
- Focused Playbook publication-manifest tests, if required
- `.planning/quick/260912-legal-leadership-workforce-doctrine/SUMMARY.md`

## Validation plan

- Confirm the doctrine is linked from the package and assigned to the correct
  restricted Playbook room/subgroup.
- Run focused publication-manifest tests.
- Run strict TypeScript validation.
- Review the diff for accidental changes to unrelated doctrine or application code.

## Risks and coordination notes

- This doctrine is internal operating guidance, not legal advice.
- Only a properly licensed attorney may occupy a role exercising licensed legal
  judgment; titles alone do not confer authority.
- No commit, push, deployment, migration, or Playbook publication is authorized by
  this task.
- Phase 38.1 remains the next held product thread and is not modified here.
