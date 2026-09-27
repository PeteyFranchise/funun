# Cross-reference a writer's identity against the PROs, for consistency

**Captured:** 2026-09-26 · **Status:** research done, not scoped
**Owner question:** *"is there a way in the future to check against the PROs (ASCAP, BMI, SESAC for
example) own database to make sure things are matching up for the writer?"*

This is about **verifying identity we already hold**, not registering works. Registration is a
different rail and already planned — see `docs/cwr-plan.md`. Do not merge the two.

## What is actually reachable

| Source | Coverage | Programmatic? |
|---|---|---|
| **MLC Public Search API** | US mechanical — works, writers with IPIs, publishers, shares | **Yes.** Registration-based; `publicapi@themlc.com` |
| **Songview** (ASCAP + BMI, expanded to SESAC + GMR) | 38M+ works, US performance ownership | No — web search only, no developer API found |
| **CISAC ISWC IPI Context Search** | Purpose-built: find a creator's IPI from name + known titles | Restricted rights-industry access; exact eligibility must be confirmed during society/publisher onboarding |
| **IPI System** (SUISA, for CISAC) | The authoritative IPI register | **Closed.** Access depends on qualifying society/rightsholder relationships and approved services |

**The authoritative database is closed to us today.** “Become a CISAC-affiliated publisher” is not
a precise action: CISAC is the confederation and standards body, while practical eligibility comes
through the applicable societies and approved publisher/rightsholder services. The publishing and
sender relationships in `docs/cwr-plan.md` Path B may unlock relevant lookup access, but that must
be confirmed service by service; do not promise one relationship unlocks everything.

## The dual payoff

The Path B entity/capacity decision is still the highest-leverage business decision shared by both
tracks. The same publisher/society strategy that makes Funūn eligible to pursue direct registration
sender onboarding also makes it eligible to pursue publisher-facing identity tools: CISAC states
that publishers may request the IPI Pocket Edition, and the ISWC IPI Context Search was created for
publishers. This is **one coordinated workstream with two potential payoffs**, not one account or
agreement guaranteed to unlock both. Record registration and lookup eligibility, agreements,
credentials and approvals independently.

## What this can and cannot claim

It can never say an IPI is **correct**. It can say it is **consistent** — does this name + IPI
combination appear on works in a public database? That catches the errors that actually happen:

- a transposed or mistyped digit;
- someone pasting their **publisher** IPI where their **writer** IPI belongs;
- an IPI copied from a different person of a similar name.

Frame the result as reassurance or a nudge, never a gate. These databases are themselves incomplete
and frequently wrong; a match means *"consistent with what the PRO has on file"*, not *"true"*.

## Two things that would break a naive build

**A person does not have one IPI.** They have an IPI **base number** (the human) and possibly
several **name numbers** — per pseudonym, and separately for their writer versus publisher
capacity. A "mismatch" can therefore be entirely legitimate. This is the same cardinality question
Codex flagged as needing rights-operations validation before the scalar `ipi` field is replaced
(`.planning/reviews/CODEX-RESPONSE-260926-collaborator-claim-and-stale-copies.md` §13). **The two
are blocked on the same answer** — resolve it once.

**Consistency is not authority.** Per the 2026-09-26 place-of-truth ruling, the authoritative copy
is the one the described person controls. A registry match is a *third* tier of evidence above a
self-assertion, and introducing it must not quietly demote the person's own say-so. Decide
deliberately where a registry-verified value sits relative to a subject-confirmed one before
wiring any of this up.

## The cheap win, available now, no vendor

`isValidIpi()` (`lib/metadata/identifiers.ts:124-126`) is currently **length-only**:

```ts
return /^\d{9,11}$/.test(normalizeIpi(raw))
```

IPI name numbers carry a check digit. Adding that validation catches the single most common error —
a mistyped digit — with no API, no account and no vendor relationship. Do this regardless of
whether the rest ever gets built.

## Suggested order

1. Check-digit validation on `isValidIpi()`. Small, self-contained, immediate.
2. Resolve the IPI cardinality question with rights operations (shared blocker).
3. MLC Public Search API as a plausibility check at the point someone enters an IPI —
   *"we found 14 works registered to this IPI under your name"*. Reassurance, not a gate.
4. Restricted society/CISAC-service access waits on Path B's business track and recipient-specific
   eligibility confirmation.

Official publisher-tool references to re-check at implementation time:

- https://www.cisac.org/services/information-services/ipi
- https://www.cisac.org/Newsroom/news-releases/cisac-launches-new-iswc-ipi-context-search-help-music-publishers-solve
