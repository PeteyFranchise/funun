---
created: 2026-08-25
updated: 2026-08-25
area: testing / beta
title: Verify tabled 31.1 + 31.2 UAT organically during beta onboarding
---

# Verify the tabled 31.1 + 31.2 UAT organically during beta onboarding

**Owner decision (2026-08-25):** no fake-data seeding for now. The 4 tabled 31.2 UAT items (+ 31.1's live walkthrough) get verified **organically as real beta users onboard one by one with the small team** — revisit only if something looks broken. `31.2-UAT.md` stays `blocked`; phase 31.2 stays open until these are checked (or closed early via `/gsd-verify-work 31.2` with skips).

## Organic verification checklist — check each at its first real occurrence

| First real event | Check (UAT item) |
|---|---|
| Anytime (needs NO client data — just a second staff account) | **Access editor (item 2):** toggle a role off/on a room; that member loses/gains the room instantly; leadership untouchable |
| First Selects sent to a real client who plays it | **Listen-time (item 1):** open that Selects' engagement panel; audible-seconds plausible vs. what they actually played (pause/scrub shouldn't count). ⚠ Only tabled item where silent breakage feeds bad coaching data for weeks |
| First play published by leadership | **Coaching loop (item 3):** AE sees the banner + own-book count; "View clients" filters the list (chip appears); mark-done → rollup shows who acted |
| Once a few clients have listened | **Leadership rollup (item 4):** tower Engagement section shows per-AE totals; nothing engagement-related on the public /selects/[token] page |
| Months in (bands need elapsed time — new clients are all 🟢/🦦 by definition) | **Health bands:** clients drift 🟢→🟡→🔴→🔵 at 31/61/181 days since last executed license; band math is already unit-locked, this is just eyeballing real drift |

**Prerequisite for beta onboarding itself:** fix the Resend sender (`2026-08-23-invite-email-resend-config.md`) — invites don't send until then.

**When enough items are checked:** run `/gsd-verify-work 31.2` to record results and complete the phase (also registers R9's REQUIREMENTS row).

---

## Fallback: seed-data spec (if organic testing proves too slow)

Kept from the original plan in case Codex-seeded fake data is wanted after all: one AE with an assigned book; ~5 `[TEST]`-prefixed buyer orgs with **backdated** `license_requests.executed_at` (~20/45/120/300 days + one never-licensed) to hit all bands under 30/60/180; 1–2 contacts per org; fake songs with genuinely playable preview audio; one sent Selects. Guardrails: reserved fake domain, teardown manifest of created ids, service-role seeding (tables are zero-policy/REVOKE'd), never verify fake artists, Codex reports in a copy-paste fenced block.
