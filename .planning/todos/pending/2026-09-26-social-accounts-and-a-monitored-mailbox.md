# Social accounts and a monitored mailbox — neither exists yet

**Captured:** 2026-09-26 · **Status:** open — owner setup, mostly outside the codebase
**Owner, 2026-09-26:** *"no social accounts yet, and no mailbox set up."*
**Blocks:** four marketing CTAs and, more urgently, one live email path.

## ⚠️ Check the e-sign reply path first — this one is already running

`.env.example:34-35` is explicit about what `ESIGN_FROM_EMAIL` has to be:

> *"real, monitored inbox on a domain verified with Resend — not a no-reply."*
> `ESIGN_FROM_EMAIL=esign@funun.studio`

And `lib/sync-library/mint-agreement.ts:222` sets it as the **reply-to** on sync-agreement
e-signature mail, with `lib/esign/docuseal.test.ts:161` describing the intent as *"so a collaborator
reply reaches a monitored Funūn mailbox."*

So the code already assumes a monitored mailbox exists. If `ESIGN_FROM_EMAIL` is set in production
to an address nobody reads, **a collaborator who replies to an agreement email is talking to
nobody** — during a signing flow, which is the worst moment for it. If it is unset it falls back to
`RESEND_FROM_EMAIL` (the example value is `pete@funun.studio`), which at least reaches a person.

**This is not a marketing-page problem and should not wait for one.** Worth checking what
`ESIGN_FROM_EMAIL` is set to in Vercel today, before anything below.

## What the marketing page is waiting on

| Surface | Needs |
|---|---|
| Footer → **Contact** | somewhere to receive mail |
| Footer → **Follow** (Instagram, YouTube, LinkedIn, X) | accounts that exist |
| Entourage → **"Talk to us"** | a real reply path — this is a sales conversation, not a form that vanishes |
| Team → **"See if Team fits"** | the >10-seat branch routes to a person; that person needs an inbox |

Today all of these point at `#`. The Legal column was already cut to an honest note for the same
reason (2026-09-26); the Follow column is the same defect and has not been decided yet.

## Mailbox — what to decide

- **Role addresses, or one inbox?** The codebase already names `esign@`, and test fixtures mention
  `hello@`, `bd@` and `ae@funun.studio` — none of which appear outside tests, so they are
  aspirational, not real.
- **Receiving is the gap, not sending.** Resend is wired and sending works. Nothing in the stack
  receives. That is a Google Workspace / Fastmail / forwarding decision, not a code change.
- **There is a shipped pattern for capture that avoids needing a mailbox at all:**
  `POST /api/sync/register` takes `source: 'register' | 'sales_rep'` — *"Two Register doors, one
  pipeline."* A member-side equivalent would put sales leads in the database where staff already
  work, rather than in an inbox someone has to remember to check. A mailbox is still wanted for
  humans replying to humans, but it does not have to be the capture mechanism.

## Social — what to decide

- **The diacritic does not survive a handle.** `Funūn` becomes `funun` everywhere, so the wordmark
  and the handle will not match exactly. Worth choosing deliberately rather than discovering it.
- **Check availability across all four at once** before committing one to the footer — a footer
  that links three platforms and skips the fourth looks like an oversight; picking a consistent
  handle first avoids that.
- **`marketing` is a real `StaffRole`**, so there is someone to own them.
- **Until they exist the Follow column should not ship.** Four links to accounts that do not exist
  is the defect the Legal note was written to avoid.

## Decision still open

Whether the bench's Follow column is cut now or left as placeholder. Owner has not ruled.
