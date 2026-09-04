# Post-Beta Freemium/Paid Pricing & Platform-Wide AI Governance

**Status:** Future discussion — direction recorded 2026-09-04; pricing,
allowances and launch timing intentionally undecided

**Owner direction:** Keep AI-assisted tools activated during beta testing. Before
opening them broadly, evaluate a freemium/paid program that accounts for every
OpenAI- and Anthropic-assisted feature in Funūn—not Lyric Lift alone—and add an
account-wide spending ceiling plus usage dashboards.

This document is the required discussion brief for that work. It records the
principles already agreed and the evidence and decisions still required. It is
not a pricing announcement or implementation specification.

---

## 1. Locked product principles

1. **Core creation remains useful without AI.** Starting a song, recording or
   uploading audio, writing lyrics and notes, collaborating, entering rights
   information, and accessing one's own work must not depend on a paid AI tier.
2. **AI is an assist, not the product gate.** AI may save time or improve a
   workflow, but exhausting an allowance must leave the manual path intact and
   obvious.
3. **Beta is for measurement.** Beta accounts may receive complimentary AI
   access or credits so Funūn can measure real cost, value, quality and demand
   before setting public prices or allowances.
4. **One cross-provider system.** OpenAI and Anthropic activity must feed the
   same entitlement, metering, budget and reporting layer. Individual features
   must not invent separate billing systems.
5. **No “unlimited AI” promise.** Paid access should use bounded allowances or
   another explicitly limited model because provider costs are variable.
6. **The initial boundary is the individual Funūn user account.** Organization,
   team and seat-based billing are future scope. Every run must still record the
   human actor and the account whose allowance pays for it.
7. **Provider keys stay server-side.** Funūn supplies and protects provider
   credentials; users are never asked to paste personal OpenAI or Anthropic API
   keys into the product.
8. **No public pricing is decided here.** Dollar prices, free quantities, paid
   quantities, rollover and overage terms must wait for beta evidence.

---

## 2. Candidate tier shape for discussion

### Free

- Full core Writer's Room and non-AI workflows.
- A small trial or recurring allowance of AI assists, with the exact amount
  determined from beta conversion and cost data.
- Clear upgrade path after the allowance is used; never block access to source
  recordings, lyrics, documents, metadata or rights records.

### Artist Pro

- A larger monthly account-level AI allowance shared across eligible tools.
- Usage history, remaining allowance, reset date and plain-language explanation
  of what different assists consume.
- Optional paid overages may be considered, but must be opt-in with a hard cap
  and cannot be silently enabled.

### Higher-volume tier (future, not initial scope)

- Larger or pooled allowances, advanced administration, exports and analytics.
- Organization/team pooling only after Funūn intentionally introduces an
  organization billing model; do not force it into the user-account launch.

### Complimentary and promotional access

- Beta, staff, support-granted and promotional credits require an expiry,
  reason, issuer and audit history.
- Complimentary access must use the same ledger and safety ceilings as paid
  access so beta data remains trustworthy.

---

## 3. AI tools that must be inventoried together

Before pricing, create a living registry of every provider-assisted workflow,
including at minimum:

- Lyric Lift transcription, alignment and lyric-section organization.
- PitchPlug generation and revisions.
- Contract/document analysis or verification.
- Metadata, campaign, opportunity, coaching or catalogue assistance that calls
  OpenAI, Anthropic or any future model provider.
- Background retries, fallbacks, moderation, embeddings, speech, image or other
  model calls that may create cost even when they are not marketed as a named
  AI feature.

For each operation record its product tool, provider, model, model/version or
alias, metering unit, expected cost range, actual usage when available, retry
policy, cache/idempotency behavior, data sensitivity and manual fallback.

---

## 4. Platform foundation required before broad release

### Entitlements

- Central account-to-feature entitlement rules for beta, free, paid,
  complimentary, suspended and admin-only access.
- Entitlements and allowances must be separate: an account may be allowed to see
  a feature but have no remaining usage, or may receive a support credit without
  changing subscription tier.
- All API routes and background workers enforce eligibility server-side; hidden
  buttons are not access control.
- Per-tool and global emergency kill switches, plus provider/model disable
  controls that do not require a new deployment.

### Usage and cost ledger

- Append-only record for account, actor, tool, provider, model, request/job,
  source asset/version where appropriate, status, units, estimated cost, actual
  cost, currency, pricing-rate version and timestamps.
- Record successful, failed, cancelled, duplicate-suppressed and refunded runs
  distinctly; failed provider work should not silently consume a completed
  customer assist.
- Normalize different provider units—audio minutes, input/output tokens, images
  or calls—into internal cost while allowing the customer-facing product to use
  understandable “AI assists.”
- Preserve raw provider identifiers only where useful for reconciliation and
  support; never expose provider secrets or unsafe raw errors.

### Atomic ceilings and concurrency safety

- Check entitlement and atomically reserve estimated allowance before calling a
  provider; reconcile the reservation after final usage is known.
- Concurrent browser tabs, retries and workers cannot race past the ceiling.
- Idempotency keys and immutable source-version caching prevent duplicate paid
  work, following Lyric Lift's same-version protection.
- Support account-level monthly hard caps, warning thresholds, per-tool rate
  limits, a platform-wide budget cap and provider-specific caps.
- Define behavior when actual cost exceeds the reservation, the provider omits
  usage, a job times out, a fallback provider runs, or a webhook is replayed.

### Dashboards

**User account dashboard:**

- Plan, eligible AI tools, assists used/remaining, reset date and recent usage.
- Clear distinction between pending/reserved and completed usage.
- Warnings before limits, a predictable limit-reached state, and an unchanged
  route back to the manual workflow.
- If overages launch: price disclosure, explicit consent, current overage spend,
  user-set cap and immediate disable control.

**Admin/finance dashboard:**

- Spend and usage by date, account, tool, provider, model and subscription tier.
- Revenue, provider cost and gross margin by tier and customer cohort.
- p50/p90/p99 cost per successful assist; retry, failure, abuse and cache-hit
  rates; unpriced or unreconciled usage alerts.
- Top spenders, sudden-cost anomalies, ceiling events, promotional credits and
  manual adjustments with audit history.
- Budget forecast and alerts before OpenAI/Anthropic project limits or Funūn's
  own monthly budget are reached.

---

## 5. Beta evidence to collect before pricing

Measure per account, cohort and tool without turning creative work into
productivity surveillance:

- Eligible accounts, exposed accounts, first use, repeat use and active months.
- Runs per user and distribution—not only averages; identify heavy-tail users.
- Provider/model cost per attempt and per successful customer outcome.
- Audio duration, token volume or other cost driver in privacy-minimized form.
- Success, provider failure, retry, cancellation, duplicate suppression and
  abandonment rates.
- Latency percentiles and whether users leave or complete the workflow.
- Quality signals: accepted/applied output, amount of correction, discard rate,
  false no-vocal outcomes, support complaints and user-reported usefulness.
- Whether an AI assist improves retention, completed songs, rights readiness or
  another meaningful outcome rather than merely generating calls.
- Free-to-paid intent and willingness-to-pay evidence from interviews or a
  clearly labeled pricing experiment; do not infer willingness from usage alone.
- Cross-tool substitution: whether one account's allowance is consumed mostly
  by one expensive tool and whether a single universal “assist” feels fair.

Define a minimum evidence window and sample size during the pricing discussion;
do not choose numbers now.

---

## 6. Unit-economics questions

- What gross-margin target is appropriate after provider cost, Vercel/Supabase
  compute and storage, queues, observability, support, payment fees, taxes,
  refunds, fraud and complimentary usage?
- What do median, p90 and worst-reasonable accounts cost in each candidate tier?
- Should high-cost tools consume multiple customer-facing assists or use their
  own visible sub-limit?
- Is a recurring free allowance, one-time trial, feature-specific sample or
  time-limited beta credit the best acquisition mechanic?
- Should unused paid allowances expire or roll over? If rollover exists, what
  liability and maximum balance does it create?
- Can included usage absorb future provider price changes without surprising
  customers, or does the plan need a rate-change policy?
- What churn, conversion and support assumptions make each tier sustainable?
- At what platform spend or margin threshold must pricing be revisited? Define
  an objective re-decision trigger before launch.

Model optimistic, expected and adverse cases. Include provider price changes,
fallbacks that double-call, abuse, unusually long files, repeated revisions and
failed work—not just the happy path.

---

## 7. Customer-facing credit design

- Decide whether the product says “AI assists,” “credits,” named feature uses or
  a hybrid. Avoid exposing raw tokens or confusing users with provider billing.
- Publish a simple consumption table before payment: for example, whether one
  Lyric Lift, one contract review and one PitchPlug revision consume equal or
  different amounts. Do not imply equivalence if costs differ materially.
- Show the expected charge before starting an unusually expensive operation and
  prevent a file-duration or loop edge case from consuming an unexpected share.
- Decide whether revisions, retries, user cancellations and low-quality outputs
  consume allowance; encode the policy consistently in ledger states.
- Keep prices and consumption rules versioned so historical invoices and usage
  remain explainable after a model or rate changes.
- Provide an accessible explanation of what AI did, what remains user-reviewed,
  and how to continue manually.

---

## 8. Shared Writer's Room attribution question

The initial product bills individual user accounts, but collaborators can invoke
AI inside another person's Writer's Room. Before implementation, decide:

- Does usage debit the person who clicked, the work owner, or an owner-approved
  project allowance?
- Can contributors spend the owner's allowance without explicit permission?
- Who sees the usage record when the source asset is shared but billing is
  personal?
- What happens when the actor lacks an entitlement but the owner has one, or the
  reverse?

The default must prevent a collaborator from consuming another user's paid
allowance silently. Every run records both actor and billed account.

---

## 9. Billing lifecycle and financial operations

- Stripe product/price versioning, checkout, receipts and webhook idempotency.
- Trial start/end, monthly renewal, plan changes, proration and failed payments.
- Cancellation timing and continued access to previously generated outputs.
- Refunds, chargebacks, promotional credits, support adjustments and audit logs.
- Allowance reset timezone, grace periods, expiration and any rollover rules.
- Sales tax/VAT treatment, invoice language and accounting treatment for prepaid
  or rolled-over credits; obtain qualified accounting/legal guidance as needed.
- Grandfathering and advance notice when pricing, allowances or tool weights
  change.
- Data exports for reconciling customer usage, Stripe revenue and provider bills.

Never delete or lock a user's source work because a subscription ends. Only
future paid operations and paid-only presentation features may be gated.

---

## 10. Security, privacy, trust and abuse controls

- Keep all provider calls on trusted server infrastructure with least-privilege
  project keys, rotation, environment separation and no client exposure.
- State clearly when audio, lyrics, contracts or metadata are sent to an AI
  provider and link the applicable privacy/data-processing terms.
- Minimize provider retention and storage; use non-storage controls where
  supported and define deletion/retention behavior for Funūn's own inputs and
  generated outputs.
- Treat model output as untrusted. Maintain human review before lyrics, rights,
  contracts, metadata or pitches become authoritative or externally delivered.
- Enforce file size/type limits, prompt-injection boundaries, tenant isolation,
  RLS/authorization, safe error messages and sensitive-log redaction.
- Detect scripted abuse, account sharing, repeated near-duplicates, retry loops
  and attempts to use Funūn as a general-purpose model proxy.
- Add anomaly alerts and an emergency global stop that preserves existing work.
- Document the policy for prohibited content, provider safety blocks and appeals
  without silently charging for unusable results.
- Retain enough immutable usage evidence for disputes without retaining raw
  creative content longer than necessary.

---

## 11. Provider and model strategy

- Centralize model selection and pricing-rate tables; do not scatter model names
  or assumed costs through UI components.
- Capture the actual model/version used so alias changes remain auditable.
- Evaluate quality, latency, availability, privacy and cost per successful
  outcome—not headline token price alone.
- Define whether fallback is automatic, user-approved or disabled per tool.
  Fallbacks can increase cost and create different privacy disclosures.
- Establish quality regression tests before changing models or prompts.
- Keep OpenAI and Anthropic replaceable behind tool-level adapters where
  practical, but do not promise seamless parity when capabilities differ.
- Monitor provider deprecations, rate changes, quotas and regional requirements.

---

## 12. Decisions the post-beta discussion must resolve

1. Which user accounts qualify for beta, free and paid access?
2. What minimum beta evidence is sufficient to set prices?
3. What are the tier names, monthly prices and included allowances?
4. Is the free allowance recurring, one-time or feature-specific?
5. Is one universal assist unit fair across all tools, or do tools carry weights?
6. What soft warnings and hard ceilings apply per account, tool and platform?
7. Are overages offered at launch? If yes, at what disclosed price and user cap?
8. Do paid allowances roll over, and what maximum balance applies?
9. Who pays when a collaborator invokes AI in a shared Writer's Room?
10. Which failures, retries, cancellations and rejected outputs are refunded?
11. What gross-margin and maximum-monthly-spend thresholds trigger re-decision?
12. What privacy disclosures, terms updates and consent are required per tool?
13. Which AI tools belong in Free, Artist Pro or a future higher-volume tier?
14. What happens to generated outputs and history after downgrade/cancellation?
15. What admin roles may grant credits, change ceilings or inspect usage?

---

## 13. Release gates before broad AI availability

Do not broadly launch a post-beta paid AI program until all are true:

- The AI tool registry is complete for OpenAI, Anthropic and background calls.
- Entitlements are enforced at API and worker boundaries.
- Atomic reservations, idempotency and account/platform hard ceilings are tested
  under concurrent requests.
- User and admin dashboards reconcile against sampled provider invoices.
- Failure/refund, cancellation, downgrade and limit-reached paths pass UAT.
- Core manual workflows remain available at zero allowance.
- Privacy disclosures, terms and customer-facing consumption language are
  reviewed and published.
- Pricing scenarios meet the chosen margin and risk thresholds using beta p90,
  not only average usage.
- Emergency provider/tool/global shutdown controls are tested.
- A controlled paid pilot demonstrates correct billing before general release.

---

## 14. Recommended sequencing when discussion resumes

1. Inventory tools and instrument one shared provider-usage ledger.
2. Run beta with complimentary, bounded allowances and admin cost monitoring.
3. Analyze cost, quality, demand and heavy-tail behavior by tool and account.
4. Resolve the fifteen decisions above and model candidate tier economics.
5. Build central entitlements, atomic ceilings and both dashboards.
6. Add Stripe subscription/credit lifecycle only after the product rules settle.
7. Run a small paid pilot, reconcile real invoices and adjust.
8. Approve public pricing and broaden access only after release gates pass.

**Next action:** None during the current Lyric Lift beta beyond monitoring and
keeping access bounded. Reopen this document as a formal GSD discussion when
there is enough representative beta usage to make the tier decisions with data.
