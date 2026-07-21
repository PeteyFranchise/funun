# Roadmap idea: PRO / MLC identity cross-referencing API

**Status:** NOT ACTIVE. Captured 2026-07-21 during split-sheet identity/Settings design discussion. Gated on Pete initiating a BD conversation — not an engineering task until a real data relationship exists.
**Current decision in force:** self-attested legal name/PRO/IPI in Settings, with a one-time confirm-and-lock step (Option A) and no automated verification. See the split-sheet identity deliberation for the full reasoning.

---

## The idea

Funūn's split sheets, certificates, and rights-registry guidance all rest on a user's **self-reported** legal name, PRO affiliation, and IPI number. If Funūn ever had a real data relationship with a PRO or The MLC, the platform could cross-reference a user's entered identity against the actual registry — catching a wrong name, a mismatched IPI, or an unaffiliated PRO claim before it propagates into a signed legal document.

## Two different entities, worth not conflating in any future proposal

- **PROs (ASCAP, BMI, SESAC, and international equivalents like PRS, GEMA, SOCAN)** — administer **performance royalties**. They hold writer/publisher identity records and IPI numbers.
- **The MLC (Mechanical Licensing Collective)** — a single US entity created under the Music Modernization Act, administering **mechanical royalties from streaming** (a different royalty stream entirely). The MLC also holds writer/publisher identity and work-registration data, arguably in a more centralized, single-point-of-contact form than the fragmented multi-PRO landscape.

**The MLC is likely the more tractable entry point of the two**, precisely because it's one organization rather than three-plus separate PROs each requiring their own relationship — and Pete has a real contact there already, which is the actual unlock here.

## Why this isn't buildable today (recorded so a future proposal starts from an accurate baseline)

- None of the three major US PROs expose a public API for identity/IPI verification — their public tools (ASCAP's ACE, BMI's Repertoire search) are song lookup, not identity matching.
- Real cross-referencing requires a **formal data-sharing agreement** — legal, likely fees, a vetting process — the kind of relationship built through business development over time, not through engineering effort.
- Even with a real data feed, matching would be inherently **fuzzy, not binary**: name variations (nicknames, maiden names, diacritics) mean any real system would produce "verified / no match / needs review," not a clean pass/fail — which in turn requires an ongoing **human review function** Funūn does not have and would need to fund (see the identity deliberation for the full reasoning on why this pushed the near-term decision toward self-attestation instead).

## If this ever moves forward — what a proposal would need to answer

1. **What does Funūn offer in return?** Data relationships like this are rarely one-directional asks. Possible angles: Funūn as a clean, structured intake source for well-formed rights data (split sheets, executed agreements) that reduces the PRO/MLC's own data-entry burden; volume of registrations if Funūn's user base grows; a case study in independent-artist rights hygiene.
2. **Scope of the ask** — full identity verification (name + IPI match), or something narrower and more achievable first, like confirming an IPI number exists and is active (without full name-matching)?
3. **Which entity first** — The MLC, given the existing contact, as a pilot; PROs individually afterward if the MLC relationship proves the model works?
4. **What data Funūn would need to handle on its end** — any such relationship likely comes with its own data-handling/privacy obligations (this data is sensitive, tied to real royalty payments) that would need review before any integration is built, separate from the API question itself.
5. **The human-review question, unavoidable either way** — even a narrow "IPI exists and is active" check still needs someone to handle edge cases and disputes. Worth scoping who that is (Pete, a contractor, or a future hire) as part of any proposal, not as an afterthought once the integration exists.

## Next step, whenever this gets picked back up

Pete drafts a proposal to the MLC contact, scoped as narrowly as possible for a first conversation (see point 2 above) rather than the full cross-referencing vision — a narrow, concrete ask is more likely to get a real response than "verify all our users' identities."
