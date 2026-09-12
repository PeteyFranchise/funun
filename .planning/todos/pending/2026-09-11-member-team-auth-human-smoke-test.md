---
created: 2026-09-11
area: authentication / account context
title: Run production Member and Team account smoke tests
recurring: false
priority: high
status: pending-owner-time
---

# Production Member and Team account smoke tests

## Timing

Run after the current code-focused build session. Do not use or share real
passwords in issues, chat, source files, screenshots, or test fixtures.

## Clean sign-in

- [ ] Open a private/incognito browser window.
- [ ] Sign into a real Member account.
- [ ] Confirm the Member lands in the Sound Vault and sees their expected
      projects.
- [ ] Sign out and confirm `/signin` remains usable.
- [ ] Sign into a real Funūn Team Member account.
- [ ] Confirm the Team Member lands in the Team console rather than a personal
      Member workspace.

## Intentional account switching

- [ ] From the Member workspace, choose **Switch to Funūn Team** and complete
      Team sign-in.
- [ ] Confirm the Team console opens and Member-only data does not appear.
- [ ] From the Team console, choose **Switch to Personal workspace** and
      complete Member sign-in.
- [ ] Confirm the Sound Vault opens and Team-only navigation does not appear.
- [ ] Enter credentials for the wrong account class during each switch and
      confirm Funūn refuses the mismatch without leaving that account active.

## Cross-tab protection

- [ ] Open the Member workspace in one tab and change the shared browser
      session from another tab.
- [ ] Return to the first tab and confirm the account-protection dialog appears
      before the page silently adopts the other identity.
- [ ] Verify both recovery choices: continue with the current browser account,
      or sign into another account.

## Failure and recovery

- [ ] Confirm a wrong password returns a stable inline message without closing
      or blanking the page.
- [ ] Complete the forgot-password flow with a designated test account.
- [ ] Check mobile Safari and Chrome after desktop behavior is confirmed.
- [ ] Record exact visible errors, URL, browser, account class, and timestamp
      for any failure; never record the password or authentication token.

## Definition of done

- [ ] Member sign-in, Team sign-in, both switch directions, cross-tab
      protection, sign-out, and password recovery pass in production.
- [ ] Expected Member projects and Team permissions remain isolated and
      visible only in their correct workspace.
- [ ] Any failure is converted into a reproducible code-level regression test.
