# IPI check-digit validation

**Captured:** 2026-10-03 · **Status:** parked, blocked on test data — not on code
**Owner framing:** reviewing the ready-to-build list, then *"add the IPI 'supply real IPIs' to the
roadmap for now and we will get to it later"*.

`isValidIpi()` (`lib/metadata/identifiers.ts:124`) checks only `/^\d{9,11}$/`. IPI **name numbers**
carry a CISAC mod-101 check digit that is not validated.

## Correction to the estimate it was captured with

`2026-09-27-open-decisions-and-next-steps.md` §4f calls this *"the cheapest item here… about an
hour"*. That is the **coding** time, and it assumes the algorithm is already in hand. It is not,
and a previous session said so deliberately — `docs/cwr-plan.md:57`:

> **IPI check digit.** We validate IPI shape/length only. The IPI mod-101 check digit algorithm is
> not implemented (not verified) — we don't fake it.

That judgement was right. It should not be quietly reversed by someone reading only the §4f line.

## Why a wrong implementation is worse than none

`isValidIpi` feeds **CWR generation** — the registration path (`lib/metadata/cwr.ts:90`, `:142`,
`:150`). Today it is permissive, so a malformed IPI reaches the society and is rejected there: it
**fails in the safe direction**.

A check digit implemented from memory with the wrong weighting fails in the *unsafe* direction — it
**rejects valid IPIs**, blocking real writers from registration behind a validator that looks
authoritative. Per `.claude/CLAUDE.md`, in a rights product an unverified claim is a money bug, not
a docs bug.

## What unblocks it

**1. Three or four IPI name numbers the owner knows are valid** — his own, collaborators', or from
PRO records. This is the real blocker. It lets the implementation be tested against ground truth
rather than against itself.

The existing fixtures **cannot** serve as vectors: `034524680`, `03600029145`, `06012345678` and
`9999999999` appear in `lib/metadata` tests, but nobody has confirmed any of them is a real valid
IPI, and the last is obviously synthetic.

**2. The CISAC mod-101 specification from an authoritative source** — not a blog restatement. The
same CISAC affiliation discussed in `2026-09-27-open-decisions-and-next-steps.md` §2c would supply
both the spec and the IPI register: one relationship, two payoffs.

## Acceptance, when built

- every supplied real IPI passes
- a single transposed digit in each of those same IPIs fails
- `ipiName11()`'s 9→11 left-zero-pad behaviour is unchanged
- `assessCwrReadiness()` still passes its existing tests
- the test is committed **RED** against a known-bad IPI first — a validator that passes before it
  exists proves nothing

## Related

- `docs/cwr-plan.md` — build checklist and the original decision
- `2026-09-26-cross-reference-identity-against-pro-databases.md` — blocked on the same PRO/IPI
  identity-model question (§2b: does one person have one IPI identity or several?)
- `2026-09-27-open-decisions-and-next-steps.md` §2c, §4f
