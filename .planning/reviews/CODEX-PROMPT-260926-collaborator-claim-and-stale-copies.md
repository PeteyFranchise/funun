---
type: review-prompt
reviewer: codex
created: 2026-09-26
status: sent
subject: the invited-collaborator claim screen, and what to do about stale copies of a person's rights data
source: Claude-authored prompt supplied by the owner
response: (pending)
---

# Codex — a person is described by someone else, in a product where descriptions become money

We are about to build one screen and we want your opinion before we do, because it sits on top of a
data model problem we think is bigger than the screen.

## Account vocabulary — please use it exactly

Funūn has three identity classes: **Member**, **limited guest / signature recipient**, and **Funūn
Team Member** (staff). **Client Partner is not an identity class** — it is a verified organization
relationship held *by* a Member. Full reference: `docs/architecture/ACCOUNT-TYPES.md`.

Do not confuse **Funūn Team Member** (staff) with **Team** (a Member pricing tier).

## The situation

A Member can add a collaborator from their Collaborators screen at any time, with **no song
involved**. Verified:

- `collaborators` (`supabase/migrations/018_collaborators_split_sheets.sql:13-27`) — `user_id` (the
  **inviter**, not the person described), `name NOT NULL`, `email`, `phone`, `pro`, `ipi`,
  `publisher`, `mlc_id`, `soundexchange_id`, `mailing_address JSONB`.
- RLS is `USING (auth.uid() = user_id)` (`018:30`) — *"Users manage own collaborators"*. The row
  belongs to the person who wrote it. **The person it describes cannot read or write it.**
- `collaborator_invites` (`018:107-119`) — `collaborator_id`, `inviting_user_id`, `invited_email`,
  `invite_token` (64-char hex), `token_expires_at` (30 days), `status`, `accepted_user_id`.
  **No `work_id`. No `project_id`.** Nothing is attached.
- The invite email links to `/signup?invite=<token>`.
  `app/api/signup/invite/[token]/route.ts` resolves tokens from **both** `artist_invites` (:81) and
  `collaborator_invites` (:102), and returns only `{ email, inviterName, expired }`.
- `app/api/collaborators/quick-invite/route.ts:31-32` accepts **exactly `first_name` + `email`**.
  So the common invite carries a first name and nothing else.

**So today:** someone is written down by another person, gets an email, taps the link, and lands on
a generic "Create your account" form. They never learn that a record about them exists, or what it
says. We want to insert a screen at that point: *here is what they have on file for you — check it,
and claim it.*

## Where we think the real problem is

`split_sheet_parties` stores `name, email, pro, ipi` as **snapshot columns** copied at creation
(`lib/split-sheets/list.ts:50`; the schema comments `name` as *"snapshot at time of creation
(denormalized)"*). Split sheets do not dereference a collaborator at read time — they took a copy.

Therefore a wrong `ipi` in an inviter's private `collaborators` row is not a stale contact detail.
**The moment that inviter builds a split sheet, the wrong value is frozen onto a document that
moves money**, and later correcting the source row does not correct the sheet. A wrong IPI does not
error — royalties are simply attributed to nobody.

We also note: the invitee cannot fix it, because the row is not theirs.

## What we have decided (tell us if we are wrong)

**Decision 1 — how much may a token-holder see before authenticating? DECIDED: the careful option.**
The claim screen shows name, email and PRO. It *states that* an IPI, MLC ID and mailing address are
on file but does not show their values until the person signs in. Reasoning: the token is good
evidence (it reached their inbox) but it is not authentication — links get forwarded, phones get
handed around. An IPI identifies a person to a rights society and a mailing address says where they
sleep; a name and an email are things the inviter already had and already emailed them.

**Decision 2 — corrections. PROPOSED, not yet decided.** A correction from the invitee writes to
**their own** profile. The inviter's row is never silently overwritten — we believe one Member
silently rewriting another Member's record of a third party is a rights-data integrity failure, not
a UX convenience. The inviter is then told their copy disagrees, with one action to accept.

**Decision 2a — when the inviter is told.** We are choosing between:
1. **Block at sheet-creation.** The inviter cannot add that person to a split sheet until they have
   looked at the disagreement.
2. **Warn at sheet-creation.** Shown inline at that moment; they may proceed anyway. *(our pick)*
3. **Notify only.** A bell. Cheapest, most likely missed.

We picked 2 because it fires at the moment the error would freeze, without stopping someone who
knows their own paperwork better than we do.

## What we want from you

1. **Is decision 2a right?** Specifically: is "warn, allow override" defensible when the artifact
   being created is a document that moves money and cannot be retroactively corrected? Argue the
   other side if you think we are wrong.

2. **Is the snapshot model itself the defect we should be fixing?** We can build the claim screen
   and the disagreement warning and still be left with denormalized copies of people's rights
   identifiers scattered across sheets. Say plainly whether you would (a) keep snapshots and manage
   divergence, (b) keep snapshots but add a reconciliation pass that re-checks them against live
   profiles before signing, or (c) something else. Note that a snapshot is *correct* for a signed
   document — the sheet should say what was agreed — so the fix is not simply "dereference at read
   time." We think the distinction is **before signature vs after**, and want your view.

3. **Who owns a person's rights identity?** Our instinct is that an IPI belongs to the person, and
   an inviter's copy is a convenience cache that should defer to the claimed profile once one
   exists. Is there a principled rule here we should write down, and does it have consequences we
   have not seen — for example, should claiming propagate to *unsigned* sheets already drafted?

4. **The wrong-recipient case.** Our screen offers "This isn't me", which claims nothing, tells the
   inviter the address is wrong, and kills the link. Is that sufficient? Is there an abuse vector in
   letting an unauthenticated token-holder invalidate an invite and send a message to a Member?

5. **What we have not thought of.** Especially: anything about a collaborator record that describes
   a person who never joins, and whose data sits in another Member's account indefinitely. We have
   no deletion or retention story for that and suspect we need one.

## Constraints you should assume

- Next.js 15, TypeScript strict, Supabase with RLS, Tailwind. No shadcn/Radix/framer-motion.
- `main` is protected; everything ships via PR behind a full CI gate.
- The repository is **public**. Do not propose anything that requires committing real personal data.
- Prefer reusing what exists. Name the file you would reuse.

## Format

One fenced Markdown block, copy-paste ready. Structure it as a **doctrine document** — rules in the
imperative with their reasoning, usable by someone a year from now without us in the room. Where you
disagree with us above, say so plainly and say what to do instead. Mark anything uncertain as
uncertain rather than smoothing it over. If you believe a claim we made about the code is wrong, say
which one and why.
