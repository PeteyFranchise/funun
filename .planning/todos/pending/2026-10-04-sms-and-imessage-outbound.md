# SMS and iMessage outbound

**Captured:** 2026-10-04 · **Status:** roadmapped for a later build
**Owner:** *"Add SMS and iMessage to the roadmap to incorporate into a later build."*

## Why it is not here yet

Funūn has **zero outbound SMS capability** — verified 2026-10-04 by reading, not grep. No SMS
vendor in `package.json`; no send path anywhere in `app/`, `lib/` or `components/`. Every "phone"
reference is pure formatting (`lib/phone.ts`, documented "never throws"), a stored field
(`user_profiles.contact_phone`, `collaborators.phone`), or **DocuSeal's own** signer-verification
SMS — a third party's capability, not Funūn's.

All outbound messaging today runs through one chokepoint: `lib/email/index.ts` (Resend).

## The two are not the same size of job

**SMS** is an ordinary vendor integration — Twilio or similar. New dependency, new secret, new
cost per message, plus consent and opt-out handling. Tractable.

**iMessage is not a vendor integration.** Apple does not offer a general send-to-anyone API.
Business messaging runs through **Apple Messages for Business**, which requires Apple's approval,
a registered business entity, and in practice a Customer Service Platform partner. It is also
**inbound-initiated by design** — a customer starts the conversation; a business cannot cold-text
someone into iMessage. That makes it a poor fit for *"here is an invite to submit to The Crate"*
and a reasonable fit for *"reply to us about your submission."*

**Do not plan these as one item.** Confirm Apple's current terms before committing to anything
iMessage-shaped; the constraint above is the kind that invalidates a plan's premise.

## What it unblocks

The Crate-submission invite's *"I have their phone number"* path (deliberation §13), and
potentially submission-status notifications to artists who do not check email.

## Related

- `.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md` §13
- `lib/email/index.ts` — the existing single outbound chokepoint, and the pattern to extend
