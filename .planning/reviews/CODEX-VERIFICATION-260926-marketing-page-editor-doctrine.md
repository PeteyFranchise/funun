---
type: review-verification
verifier: claude
created: 2026-09-26
subject: verifying the Codex marketing-editor doctrine against the code
response: .planning/reviews/CODEX-RESPONSE-260926-marketing-page-editor-doctrine.md
verdict: no false claims found — but see "the limit of this pass"
---

# Verification — Codex marketing-page editor doctrine

## The limit of this pass, stated first

**The doctrine is almost entirely prescriptive.** Nearly every factual statement it makes about
this codebase is one the prompt supplied. So "no false claims found" is a real result but a weak
one: Codex could not have caught anything the prompt got wrong, and it did not independently
inspect the repository.

The value of this pass is therefore in three other places: what it asserts **without** being told,
what it **missed** that already exists, and where it **disagrees with the owner**.

## 1. Claims repeated from the prompt — all verified true

| Claim | Verified |
|---|---|
| Playbook four-state lifecycle `draft_pending / published / archived / superseded` | `201_playbook_rich_documents.sql:92` ✓ |
| `approved_by`, `last_reviewed_by`, `revision_number`, `review_interval_days` | `201:` 106–198 ✓ |
| **Immutable revision history** | `playbook_entry_revisions` is a real table — `213_playbook_browser_table_grant_hardening.sql:26` ✓ *(previously I had only confirmed the trigger, not the table)* |
| Adoption model: `source_kind IN ('native','adopted_markdown')`, `source_path`, `adopted_at`, hash, one-time unique index | `201:` 106–168 ✓ |
| Grounded assistant with `NO_APPROVED_ANSWER`, untrusted-excerpt handling, inline citations | `lib/playbook/assistant.ts:8` ✓ |
| Public write endpoints: rate limit, Turnstile, strict allowlist, `source` discriminator | `app/api/waitlist/route.ts`, `lib/buyers/register.ts:21` ✓ |
| Member release-material storage buckets | `lib/storage/index.ts:3-5` ✓ |

## 2. An assertion it made without being told — true, but overstated

**§16: "More locales will break the model before more sections do."**

The *factual* half checks out: **there is no internationalisation in this codebase at all.** No
`next-intl` or equivalent in `package.json`, no `i18n` block in `next.config.mjs`, and all 38
`locale` matches across `app/` and `lib/` are `toLocaleDateString` / `toLocaleLowerCase` family
calls. English-only, with no localisation machinery to extend.

Its advice — give content a language-independent identity now, don't make the English string the
record key — is cheap insurance and worth taking.

**But the priority claim is unevidenced.** Nothing in the prompt or the repository says Funūn
plans to localise. Codex asserts locales will break first, ahead of more editors or more media,
without any basis for ranking them. Treat the schema advice as sound and the ordering as a guess.

## 3. Two existing patterns it missed — reuse opportunities

**§19 "Allowlist destinations" — we already have one.** `safeNext()` in
`lib/auth/postSignInPath.ts:32` validates redirect destinations: rejects anything not starting
`/`, rejects protocol-relative `//host` **and** backslash `/\host`, then resolves against the app
origin and requires the origin to be unchanged, because *"the WHATWG URL parser strips embedded
tabs/newlines and normalises backslashes before we re-check."* A CTA allowlist should extend that
function's shape rather than grow a second validator with different edge cases.

**§18 "immutable page manifest" — there is a house precedent.**
`song_passport_snapshots` (`151_song_passport_foundation.sql:227`) is manifest-shaped already:
`schema_version`, and a `purpose` enum including `'approval'`, `'release'`, `'export'`,
`'custody_transfer'`, `'audit'`. A published page manifest is the same idea pointed at a different
object.

## 4. Its §12 recommendation is buildable from parts that exist

It prefers *"an expiring, subject-specific intake link over an openly discoverable submission
form."* That pattern is already all over the codebase: `/approve/[token]`, `/join/[inviteToken]`,
`/selects/[token]`, and `artist_invites` carries both `invite_token` and `token_expires_at`
(`097_artist_invites_and_waitlist.sql:65-66`). The recommendation is assembly, not invention.

**Also relevant and unmentioned:** `marketing` is already in `OPERATIONAL_STAFF_ROLES`
(`lib/admin/staff-role.ts`), described as staff who *"work inside the console"*. So the role
already passes the general staff gate — what is missing is the page, not the access foundation.

## 5. Three places it disagrees with the owner — these need a ruling

1. **§12: "Do not put the AI writing assistant in the critical path of v1."** The owner asked for
   chat-with-Claude-and-Codex from the dashboard. Codex says defer it until the claim registry and
   evidence model exist, *"otherwise the assistant will provide confidence theatre."*
2. **§12: prefer an expiring subject-specific link over an open form.** The owner asked to *"store
   the testimonials via form online."* Codex wants the open form only after moderation, identity
   confirmation and malware handling have been exercised.
3. **§10: emergency suppression bypasses leadership approval** — *"suppress first and investigate
   second. Leadership notification is required; prior approval is not."* That is a deliberate
   carve-out from the owner's "leadership approves" rule. It is the right carve-out, but it should
   be accepted consciously rather than absorbed silently.

It also disagrees with a framing that came from the owner via me — **§13: "Disagree that every
later section should necessarily be 'just a config entry.'"** Its replacement is better than what
I proposed: section **types** code-defined, section **instances** database-managed. A third
section is configuration-only when it fits a registered type; a genuinely new presentation still
needs an implementation.

## 6. Where it is heavier than the situation

**The claim registry (§3) specifies roughly twenty fields per claim** — including deployed build
SHA, production-verification references, review deadlines and staleness dependencies. For a page
with perhaps forty claims and a team of one, that is a large apparatus.

It is not, however, self-contradictory: §2 says keep claim-bearing fields **read-only** in v1 and
route changes through code review. So the registry is the price of *editable* claims later, not a
v1 blocker. Read it that way.

**The consent record (§9) has eighteen rows.** Also heavy — and this is the one place where heavy
is the right answer, for a company selling rights hygiene.

## 7. Where it improved on what we proposed

We proposed two tiers, content and claims. It proposes **three** — editorial content, verified
claims, controlled policy text — and, more usefully, says to **classify the smallest meaningful
statement rather than the section**. Its worked example is the one that convinced me: a
testimonial is not automatically editorial content, because an endorsement can carry a claim the
advertiser could not make directly, and may require a material-connection disclosure.

Its test is usable by a non-engineer, which is what was asked for:

> **If changing this could change what a reasonable visitor believes Funūn does, costs, permits,
> protects, owns, guarantees or will do for them, treat it as a claim.**

And it took the bait we were watching for **correctly**: §8 states plainly that a code-grounded
check must be presented as *"Evidence found in the deployed product"* and never as *"This claim is
true"*, with a six-level evidence ladder and an explicit list of where the technique stops working.
That was the honesty test in the prompt, and it passed it.

## Verdict

**No false claims about the codebase.** Two missed reuse opportunities, one overstated priority,
three owner decisions to make, and one framing improvement worth adopting.

Safe to plan against — with the three owner rulings taken first, because two of them change v1
scope.
