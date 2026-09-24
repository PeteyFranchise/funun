# A blocked member's account is no longer confirmed to the person they blocked — summary

## Scope, stated precisely

This closes the **blocked half only**.

The **hidden-member question is untouched and still open.** Whether an unblocked
but hidden member's Funūn membership may be confirmed to a roster owner is
decision **D-01a** in
`.planning/phases/41-collaborator-discovery-mobile-contact-matching/41-CONTEXT.md:42-61`,
and it is the owner's to make. Nothing here settles it, narrows it, or leans on
it. The "an unblocked existing member still returns `alreadyMember`" tests exist
specifically to pin that today's hidden-member behaviour is **unchanged**, so
D-01a can still be decided either way later.

What is closed is the half the owner already decided (D-03) and that
`ROADMAP.md:2700-2704` already forbids: *"a hidden or blocked identity must not
be exposed through a reverse-lookup result."*

## Root cause

Migration 179's `link_existing_member_collaborator()` trigger fires
`BEFORE INSERT OR UPDATE OF email` on `collaborators` and resolves the row's
email to a confirmed Member, writing `claimed_by` — with **no `is_public`,
`profile_visibility`, connection or block predicate**
(`supabase/migrations/179_existing_member_collaborator_reconciliation.sql:23-42`).

Every write path that takes a caller-supplied email then hands that fact back to
the roster owner. Typing someone's email was a working membership oracle, and it
worked just as well for someone who had blocked you.

## The fix

**A block in either direction ends the action**, matching D-03, so there is one
rule rather than two.

The check runs **before any write**. That ordering is the whole fix: if the
insert runs, the trigger has already stamped `claimed_by` and the disclosure has
already happened, whatever the HTTP response then says. Checking first means no
row exists, so there is nothing to disclose.

New shared helper — `mustBlockActionForEmail()` in
`lib/trust-safety/block-check.ts`:

1. Normalizes the email and resolves it to an account id **server-side with the
   service client**, through the service-only `find_auth_user_id_by_email` RPC
   (migration 177, already live). The email is never echoed and the account id
   never reaches the response — the function returns a bare boolean, so there is
   no channel for either to leak.
2. Delegates to the existing `isBlockedRelativeTo()`, which is bidirectional,
   uses the service client so it can see blocks placed *against* the caller, and
   never exposes direction.
3. **Fails closed.** If the identity lookup errors, it returns `true`. That is
   why it is named "must block the action" rather than "is blocked" — a failed
   lookup is not evidence of a block, but it is not evidence of safety either,
   and the name should not claim more than the data carries.

Callers return the existing `BLOCKED_ACTION_ERROR` / `BLOCKED_ACTION_STATUS`
from the same module and create nothing — the same generic, block-state-agnostic
shape the five already-gated routes use (`wall`, `connections`, `endorsements`,
`follows`, `release-comments`), per 13-03's rule that there must be no
distinguishable "you are blocked" state anywhere.

## Routes changed

| Route | Disclosure it carried |
|---|---|
| `app/api/collaborators/quick-invite/route.ts` | Explicit — `alreadyMember: true` |
| `app/api/collaborators/route.ts` (POST) | Implicit — `.select()` returns the trigger-stamped row, no flag to notice |
| `app/api/works/[workId]/members/route.ts` (POST) | Explicit + implicit — returns `collaborator` **and** `admission` (`direct-link` vs `invite-required`) |
| `app/api/collaborators/[id]/route.ts` (PATCH) | Implicit — same trigger, different verb (`UPDATE OF email`) |

The last two were found by the audit, not named in the plan's two confirmed
paths. Both take a caller-supplied email, both are reachable from real UI
(`components/catalogue/WorkRoster.tsx` and
`components/collaborators/CollaboratorForm.tsx`), and both fire the same
trigger.

## Audit result — every candidate, read not guessed

**Fixed** (insert/update `collaborators` with a caller-supplied email):

- `app/api/collaborators/quick-invite/route.ts`
- `app/api/collaborators/route.ts` (POST)
- `app/api/collaborators/[id]/route.ts` (PATCH, email-bearing bodies only)
- `app/api/works/[workId]/members/route.ts` (POST, `first_name` + `email` branch)

**Not applicable, with reason:**

- `app/api/launchpad/[projectId]/campaigns/route.ts` — reads `name` only from
  the caller's own roster. No email in, no write, no `claimed_by` out.
- `app/api/works/[workId]/passport/route.ts` — `collaboratorBelongsTo()` selects
  `id` by `(collaborator_id, claimed_by = self)`. An ownership check on the
  caller's own identity; no email, no write.
- `app/api/works/[workId]/passport/discovery/route.ts` — reads registry fields
  by `collaborator_id`. No email, no write.
- `app/api/split-sheets/[id]/correction-flag/route.ts` — selects `claimed_by`
  only to confirm the caller is flagging *their own* identity. No email, no
  write to `collaborators`.
- `app/api/works/[workId]/members/[memberId]/promote/route.ts` — selects `name`
  by member id. Read-only.
- `app/api/approve/[token]/route.ts:106` — does update `collaborators`, but
  through the `IDENTITY_FIELDS` allowlist
  (`legal_name`, `pro`, `ipi`, `publishing_designee`, `administrator`). **No
  `email`**, so migration 179's `UPDATE OF email` trigger cannot fire, and the
  route returns `{ ok: true }` with no row.
- `components/split-sheets/PartyPicker.tsx` — posts to `POST /api/collaborators`
  (now gated) and `POST /api/collaborators/[id]/invite`. The invite route takes
  no email; it loads an already-existing row by id. See the residual below.
- `lib/invites/allowlist.ts:45` — server-side signup admission gate. Answers
  "may this email self-serve sign up", never returns anything to a roster owner.
- `lib/buyers/addClientPartnerMember.ts` — resolves email to an account id, but
  for Client Partner org membership, not the collaborator roster, under an
  AE/staff authorization on a verified `buyer_orgs` row. Different table,
  different trust boundary, no migration-179 trigger. Out of scope.

**Needs follow-up** — see below.

## Migration: none written, and one is genuinely needed later

No migration was written. Migrations are human-gated and this task was not
authorised to add one.

The plan's reasoning — "the trigger cannot fire on a row that is never
inserted" — **holds for every route path**, and I verified it rather than
assuming it. But it does **not** cover the whole surface, and this is the honest
part:

**`public.claim_collaborators(p_user_id, p_email)`** (migration 076, still live)
runs at signup and does:

```
UPDATE public.collaborators SET claimed_by = p_user_id
 WHERE LOWER(email) = LOWER(p_email) AND claimed_by IS NULL;
```

across **every** roster, with no block predicate and **no API route in the
path**. Plus migration 179's own one-time backfill `UPDATE` already stamped
historical rows.

That produces a residual the pre-write gate structurally cannot reach, because
there is no write left to gate:

> A adds B's email to their roster while B is not yet a member (no block is
> even possible — blocks reference account ids). B signs up; `claim_collaborators`
> stamps `claimed_by` on A's row. B *then* blocks A. A's row still carries
> `claimed_by`, and `GET /api/collaborators` and
> `POST /api/collaborators/[id]/invite`'s `alreadyMember: true` still disclose
> B's membership to A.

**Proposed follow-up (not written, owner-gated):** either

1. harden `link_existing_member_collaborator()` **and** `claim_collaborators()`
   with a block predicate so a blocked pair is never stamped, plus a remediation
   pass to unstamp existing blocked pairs; or
2. filter `claimed_by` out of the roster read surface
   (`GET /api/collaborators`, `POST /api/collaborators/[id]/invite`) for blocked
   pairs.

(1) is the durable fix; (2) is the cheaper one. Both are block-only and neither
touches D-01a.

**Second, smaller follow-up:** `loadBlockedIds()`
(`lib/green-room/discover.ts:424-435`) ignores the query error and returns an
empty set — it **fails open**. That is pre-existing and shared by all five
already-gated routes, so it was deliberately not changed here, but it means a
`blocks` query failure silently permits the action everywhere. The new helper's
own identity lookup fails closed; the block lookup underneath it does not.

## Tests

`__tests__/collaborator-invite-block-gate.test.ts` — **27 new tests**.

- `mustBlockActionForEmail` unit coverage: blank email short-circuits with no
  query; email normalized (trimmed + lowercased) before lookup; no account →
  false without reading `blocks`; **block by caller** → true; **block by
  target** → true (tested separately, as the plan required); account with no
  block → false; **self-invite → false**, with `blocks` never consulted;
  identity-lookup error → **fails closed**; the shared error never contains the
  word "block" and is a 400.
- Per route (quick-invite, collaborators POST, collaborators PATCH, works
  members POST), for **each block direction separately**: the response is
  `BLOCKED_ACTION_STATUS`, and — the load-bearing assertion — **the insert /
  update spy was never called**, and the roster was never even read.
- Byte-identical response: `expect(raw).toBe(JSON.stringify({ error:
  BLOCKED_ACTION_ERROR }))`, plus explicit absence of the email, the account id,
  `alreadyMember`, `claimed_by`, and `admission`.
- Unchanged behaviour pinned: an unblocked existing member still links and still
  returns `alreadyMember: true` (**D-01a, not ours to change**); an unblocked
  non-member still receives an invite; a self-invite still works; a body with no
  email never resolves an identity at all.

The `collaborators` table stub in these tests is deliberately one that **would
succeed** if the gate were deleted. A stub that explodes the moment the route
proceeds proves only "something changed"; this one reproduces the actual
disclosure.

### Proof the tests bite

Each guard was removed in turn and the suite re-run. All four failed; all four
were restored. The quick-invite removal reproduced the defect verbatim in the
failure output:

```
● POST /api/collaborators/quick-invite — pre-insert block gate ›
  returns the generic failure body verbatim

  Expected: "{\"error\":\"This action could not be completed\"}"
  Received: "{\"data\":{\"collaborator\":{ ... \"email\":\"blocked@example.com\",
             \"claimed_by\":\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\", ... },
             \"alreadyMember\":true, ... }}"
```

The other three each failed with `Expected: 400 / Received: 200` on the blocked
path (2 failures apiece).

## Verification gate

Full CI `validate` job, every step:

| Step | Result |
|---|---|
| `npm run security:migrations:verify` | PASS — migrations 214–218 transactional, least-privilege, checksum-pinned |
| `npm run typecheck:strict` | PASS — clean, no output |
| `npm run lint` (`--max-warnings=0`) | PASS — no errors, no warnings |
| `npm test -- --runInBand` | PASS — 626 suites, 7639 tests |
| `npm audit --omit=dev --audit-level=moderate` | PASS — 0 vulnerabilities |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |

## Files changed

- `lib/trust-safety/block-check.ts` — new `mustBlockActionForEmail()`
- `app/api/collaborators/quick-invite/route.ts`
- `app/api/collaborators/route.ts`
- `app/api/collaborators/[id]/route.ts`
- `app/api/works/[workId]/members/route.ts`
- `app/api/collaborators/route.test.ts` — service-client mock for the new gate
- `app/api/collaborators/quick-invite/route.test.ts` — same
- `__tests__/collaborator-invite-block-gate.test.ts` — new
