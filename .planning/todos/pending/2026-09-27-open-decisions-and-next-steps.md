# Where we left off — open decisions and next steps

**Written:** 2026-09-27, end of the session that fixed the split-sheet identity defect.
**Purpose:** a single place to resume from, so nothing below has to be rediscovered.

Twelve PRs merged that session (#105–#115 plus the Cookups branch). The auth surface is reskinned
and live; a money-touching rights defect was found, verified, fixed, guarded in CI and deployed.
What follows is only what is still open.

---

## 1. DO THIS FIRST — one command, before anyone signs a split sheet

Migration 228 was pushed. The schema landed. **The part that decides whether the new safety check
actually works is unverified.**

Migration 115 revoked table-wide SELECT on `split_sheet_parties` and re-grants an explicit column
list. If 228's new columns were not added to that list, the `authenticated` role gets a `42501`,
the pre-mint drift gate cannot read what it gates on, and **it silently passes everything** — it
looks identical to a working gate.

```bash
set -a; source .env.local; set +a
node scripts/verify-228-identity-provenance.mjs --email you@example.com --password 'yourpassword'
```

Use an account that initiated a split sheet. With the table empty it reports *inconclusive* rather
than passing — that is deliberate.

**Already confirmed:** the three columns exist, `esign_envelopes.party_identity_snapshot` exists.
**Not evidence:** the backfill checks passed over **zero rows** — production has no split sheets
yet, so there was nothing to back-fill. Re-run once real data exists.

---

## 2. Decisions only the owner can make

### 2a. How much does an invite link reveal before the person proves the email is theirs?

**Owner ruled 2026-09-26:** show name, email and PRO; state that IPI, MLC ID and a mailing address
exist without showing their values.

**Codex disagrees** and wants stricter: a masked email (`e***@example.com`), no PRO, and no
field-presence disclosure until email control is proven. Its argument: a bearer link is decent
evidence but not authentication — links get forwarded, phones get handed around.

Blocks: the invited-collaborator claim screen. Nothing else.
Detail: `.planning/reviews/CODEX-RESPONSE-260926-collaborator-claim-and-stale-copies.md` §3.

### 2b. Does one person have one PRO/IPI identity, or several?

A songwriter can hold different IPI **name numbers** per pen name, and separate identities as
writer versus publisher, against one IPI **base number**. The schema stores a single scalar `ipi`.

This is not a modelling preference — it changes what counts as a "mismatch". Two workstreams are
blocked on the same answer:

- the rights-identity authority model (Codex Phase 2);
- cross-referencing identity against the PROs
  (`2026-09-26-cross-reference-identity-against-pro-databases.md`).

**Resolve it once, with someone who does rights admin for a living.** Do not guess it in code.

### 2c. Registration: submit only, or also collect money?

To register works centrally, Funūn needs to be an onboarded CWR sender. Two entity models:

- **Admin-agency-only** — we submit registrations, no money flows through us. `docs/cwr-plan.md`
  recommends starting here.
- **Full publishing administrator** — we collect and pass through royalties for a percentage.
  Escrow accounting, 1099s, possible money-transmission exposure. The plan says defer.

This is step 1 of Path B and **everything else in registration queues behind it**. An afternoon
with counsel, not a project. The same affiliation also unlocks the IPI register we would need for
2b's verification work — one relationship, two payoffs.

---

## 3. Owner actions (accounts and setup, not code)

| | What | Why it matters |
|---|---|---|
| a | **Create the Stripe products** | Tier names are settled (Writer / Studio / Team / Entourage + Founding Member). Nothing exists in Stripe. Phase 47 waits on it. |
| b | **A monitored mailbox and social accounts** | The marketing page links to both. Neither exists. |
| c | **Check `ESIGN_FROM_EMAIL` in Vercel** | If unset, a collaborator replying mid-signing may be talking to nobody. Outstanding for a while. |

---

## 4. Ready to build, on the owner's word

| | Work | Note |
|---|---|---|
| a | **Full account data export** (Phase 49) | **Blocks the marketing page going live** — its pricing FAQ already promises it. The requirement most likely to be missed: a *paused or cancelled* workspace must still export, since that is the case the answer was written for. |
| b | **The invited-collaborator claim screen** | Smaller than it looks: `app/join/[inviteToken]/page.tsx` already exists and does most of it, view-only, with **zero production callers**. The invite email deliberately points at `/signup` instead, asserted by a test. Reuse the page; the bench mock adds the two invite densities, the legal-name ask and the "This isn't me" exit. Gated on 2a. |
| c | **Submit-a-song questionnaire** (6 questions) | Owner-reviewed. No screen, no route, no table. |
| d | **Team-tier questionnaire** (3 questions) | Same. Routes to a human above 10 seats. |
| e | **"Keep me signed in"** | Half a session. It is cookie `Max-Age`, not web storage, and the real work is that middleware rewrites the auth cookies on every request. Persistent is already the default, so the box only ever lets someone **opt out on a shared computer** — build it carefully or not at all. |
| f | **IPI check-digit validation** | The cheapest item here. `isValidIpi()` (`lib/metadata/identifiers.ts`) only checks length; IPI name numbers carry a check digit. Catches the commonest error with no vendor, no account, no API. About an hour. |
| g | **Port the marketing page to a Next route** | Started, paused. Scoped CSS parked at `~/Desktop/funun-bench-backup/mkt-scoped-css-WIP.css`. |

---

## 5. Loose ends

- A dev server may still be running on `:3000`.
- A parallel session was correcting stale claims in `.claude/CLAUDE.md` (it lists a Supabase
  package that is not installed, and says the project has no test framework — it has Jest and
  ~7,775 tests). It never reported back; check whether it landed.
- Branch `cookups-product-doctrine` is pushed but has no PR — waiting on whoever wrote it.
  Note it was rebased onto current main so it carries **both** Cookups and Phase 49; committing
  the working-tree copy as found would have silently reverted Phase 49.

---

## The one-line version

**Run the migration-228 check before anyone mints.** Everything else can wait.
