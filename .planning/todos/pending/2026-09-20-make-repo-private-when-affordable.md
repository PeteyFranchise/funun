---
created: 2026-09-20T00:00:00Z
title: Make the repository private once the GitHub plan cost is affordable
area: infrastructure
severity: low
status: deferred
deferred_on: 2026-09-20
trigger: budget allows a paid GitHub plan
---

## Owner decision 2026-09-20

**`PeteyFranchise/funun` stays public for now. It goes private when the cost is
affordable.** Deferred on cost, not on doubt about whether it should happen.

## What it costs, and why a paid plan is required

**GitHub Pro, $4/month.** Not optional if the site is to survive the switch:

- **GitHub Pages serves www.funun.studio from `main`.** Pages on a private
  repository requires a paid plan. On the Free plan, flipping visibility **takes
  the marketing site down.** This is the whole reason the switch costs money.
- **CodeQL default setup stops.** Code scanning is free for public repositories
  only; private ones need Advanced Security. It is **not** a required status
  check — only `validate` is — so merges keep working, but the scanning goes away
  and that is a real, if quiet, loss.
- Actions minutes are not a concern: 2,000/month on Free covers current usage
  several times over.

## Order of operations when the trigger fires

1. Upgrade to Pro **first**. Do not flip visibility on the Free plan.
2. Confirm Pages still builds and www.funun.studio resolves, **before** assuming
   the switch was clean.
3. Then change visibility.
4. Expect CodeQL to stop reporting. Decide then whether that matters enough to
   pay for Advanced Security, or whether `validate` plus review is sufficient.

## What remains true while it stays public

**Everything committed and pushed is readable by anyone, immediately and
permanently.** The `Repository Visibility` section of `.claude/CLAUDE.md` is not
provisional advice pending this change — it is the operating rule for as long as
the repo is public, and deferring the switch makes it matter more, not less.

Specifically still open:

- **Commit `d793d2950c16a4740150ec124e45b8c07f458204`** is unreachable from any
  ref but remains retrievable by SHA. It contains film-financing redline records
  committed in error on 2026-09-19 and force-pushed off ~20 minutes later. The
  repository has no forks and no stars.
- **GitHub Support is the only way to purge it**, through
  https://support.github.com/contact — **not by email**; `support@github.com` was
  retired when GitHub moved to the portal, and mail to it bounces.
- **Support may decline.** Their documented bar is that they "won't remove
  non-sensitive data, and will only assist in the removal of sensitive data in
  cases where we determine that the risk can't be mitigated by rotating affected
  credentials." That language is written for secrets. Contract terms have nothing
  to rotate, and may not clear their threshold.

**Going private would settle that item on its own**, without needing GitHub to
agree — a private repository serves nothing to anonymous callers, including by
SHA. That is the strongest argument for the switch and worth weighing against the
$4 when the time comes.

## Assessed risk of waiting

Low. Zero forks, zero stars, no watchers, a roughly twenty-minute exposure
window, and the content is deal terms rather than credentials — nothing that lets
anyone *do* something. Someone would need the exact SHA and a reason to look.

The risk is not zero and does not decay: the object stays retrievable until GitHub
garbage-collects it or the repository becomes private.
