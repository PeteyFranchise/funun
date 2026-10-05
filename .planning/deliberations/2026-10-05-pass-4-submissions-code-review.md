# Pass 4 — submissions code review (2026-10-05)

Adversarial read of `lib/sync-library/`, `app/api/sync-library/`, the admin page and its two
components, against the Phase 50 slices. **No criticals. Nine mediums, one low** — and several
describe defects that are **live today**, not merely planned wrong.

22 suites / 308 tests run. No files changed.

---

## M-01 — Slice 3 does not do what it claims. **Plan-killer.**

Slice 3 removes `rightsClear` from the admit route to make incomplete-rights songs
"visible and pitchable." **It does not make them visible.**

There is a **second, independent gate**: `isRightsReady()` (`lib/deals/catalog.ts:182-208`)
requires an admitted listing, an eligible project type, **and all six `SYNC_READINESS_KEYS`
complete** — which include split sheets, copyright and hire rights. `loadCatalogPage()` drops the
project when it returns false (`lib/deals/catalog-query.ts:323-345`).

So removing the admit check only lets the status become `admitted`. The catalogue still hides it.

**The sample precedent does not transfer.** Sample clearance is *not* one of the six keys, which
is why sampled songs can pass `isRightsReady()` and get a contact badge. An incomplete split
cannot. The pattern Slice 3 was modelled on only works for the one case that was never blocked.

**Result if built as written:** staff get a successful "admitted," the artist may get a "now live"
notification, and the song is absent from the buyer catalogue — recreating precisely the
*"staff admitted it and it vanished"* failure the code comments say must never happen.

Every caller needing the same treatment: `catalog-query.ts:340-345`, `shortlists.ts:116-149`,
`selects/tracks-query.ts:136-176`, `selects/ai-draft.ts:65-71,154`, and the Selects AI-draft route.

## M-08 — "Admitted" has a contractual meaning. **Needs counsel, not engineering.**

The blanket agreement (`lib/sync-library/agreement.ts:71-107`) says Funūn may *include, shop,
negotiate, issue and execute* sync licences for songs it **"admits into the Sync Library,"** and
that payment follows the song's split sheet of record.

Phase 50 proposes redefining `admitted` as **catalogue-visible but not yet licensable**. The
signed document uses the same word as the trigger for authority to execute. And a song admitted
with incomplete splits leaves the payment rule without a complete record.

**This cannot be resolved by choosing a variable name.** Either the agreement is redefined to mean
visibility only, or a separate licensing-activated state gates execution. Per the project's
legal-review gate, the language does not change without counsel.

---

## Live defects, not plan problems

**M-07 — `entry_source` already mislabels.** The submit route does not ask whether *this song*
came from an invitation; it checks whether the artist holds **any** approved `admin_invited`
capability grant (`submit/route.ts:92-105`). So every later submission by a once-invited artist
is labelled `admin_invited`, including unsolicited walk-ups months afterwards. A
`label-integrity-funun` instance in production. **Dangerous for Phase 50**, which plans to derive
valve exemption from invitation status — that would exempt unrelated later submissions.

**M-09 — nine competing answers to "what is outstanding."** Enumerated with file:line. The live
contradiction: admit requires neither `audio_files` nor `visual_asset`; the worklist says they are
outstanding; the catalogue refuses the song until both are complete; and `buildWorklist()`
**excludes admitted rows** (`worklist.ts:153-167`). So an admitted-but-incomplete song **vanishes
from the one worklist meant to resolve it while staying hidden from buyers.**

**M-04 — transitions are not atomic.** Admit, reject, withdraw and remove all read the status,
validate it, then `UPDATE ... WHERE id = ?` with no status predicate and no row-count check. Two
staff can admit and reject the same listing concurrently, both get success, both emit
notifications, both write audit records. `isValidTransition()` approves every edge in isolation
while illegal sequences still occur.

**M-03 — `LEGAL_TRANSITIONS` is not the single authority.** Migration 172's two SQL functions
move `applied`/`invited`/`agreement_pending` → `pending_admit` directly, consulting nothing. Its
test only asserts the SQL *contains* the string. **With Slice 7's new intake stage, a signed
blanket agreement could skip the first-look review entirely** via an e-sign webhook.

---

## Design flaws in what Phase 50 proposes

**M-05 — the intake grant is a general entitlement.** Bound to a `user_id` only, with no
`consumed_at`, draft, submission or track scope. The submit route accepts 50 track ids per call
and can be called repeatedly. So one pre-closure action becomes a **temporary licence to keep
submitting** until expiry. The valve does not stop grant holders.

**M-06 — an application-only valve is convention-enforced and racy.** The valve can close between
the assertion and the insert; a future service-role route can simply omit the helper; and the
database cannot tell an exempt invite insert from an unauthorised one. Slice 5 adds a second
creation endpoint, increasing the number of callers that must remember.

**M-02 — "pitchable" is separately blocked.** `authorizeRequestTarget()` refuses when
`stage3.canContinue` is false (`request-target.ts:105-111`), which includes incomplete rights.
Even with M-01 fixed, the UI would show "contact us" while the contact action is rejected.

**L-01 — BD can call the worklist API but has no page.** `GET /api/sync-library/worklist` uses
unrestricted `requireStaff()`; the page excludes BD. The component's own comment claims AE and BD
see the same rows read-only. Those cannot all be true.

---

## A&R permission matrix — clean

All five surfaces verified UI-against-route: page view, admit/reject, quality review, invite,
remove. **No mismatch.** Route tests pin A&R on four of them; there is no page-level role-matrix
test, so the page logic is verified by inspection only.

---

## What the reviewer says the valve actually requires

Not the signup trigger, not application code alone. A **transactional creation authority** — one
RPC that locks and reads the valve, validates either an open valve or a draft-bound grant or a
verified invitation redemption, creates the listings, and consumes the grant atomically. The
existing submit route must be routed through it, and Slice 5's endpoint must reuse it rather than
re-implement it.

And Slice 6 must pass a **verified redemption identifier** — never a caller-supplied
`inviteAttributed: true`, never the artist's standing `admin_invited` capability.
