---
created: 2026-09-19T00:00:00Z
title: www.funun.studio does not enforce HTTPS
area: infrastructure
severity: low
effort: minutes
---

## What

GitHub Pages serves **www.funun.studio** from `main` at `/` with a custom domain, and
`https_enforced` is **false**:

```
gh api repos/PeteyFranchise/funun/pages
  → {"cname": "www.funun.studio", "https": false, "branch": "main", "status": "built"}
```

So a visitor arriving at `http://www.funun.studio` is served over plain HTTP rather than
being redirected to HTTPS.

## Why it matters

Modest but real, and it is the **first** thing a visitor sees.

- Chrome and Safari mark plain HTTP pages **"Not secure"** in the address bar. On the
  marketing site for a platform whose pitch is that artists can trust it with their
  unreleased masters and their rights paperwork, that badge is doing real damage out of
  proportion to the technical risk.
- An HTTP page can be modified in transit on a hostile network — a café, a hotel, a
  conference. Nothing on a marketing page is secret, but the page could be altered.
- Anyone linking to the bare domain sends visitors to the HTTP version.

No user data is exposed, because the site collects none. This is reputational and
trust-signal, not a breach.

## Fix

GitHub repo **Settings → Pages → Enforce HTTPS**. One checkbox.

It is only selectable once GitHub has provisioned a Let's Encrypt certificate for the
custom domain. If the box is greyed out, the certificate has not been issued — usually a
DNS problem. Check that the `www` CNAME points at `peteyfranchise.github.io` and that no
stale A records for the apex are fighting it, then remove and re-add the custom domain to
retrigger provisioning.

## Verify afterwards

```bash
curl -sSI http://www.funun.studio | head -3
```

Expect a `301` to the `https://` URL. A `200` means it is still serving plain HTTP.

## Found

Incidentally, while checking what depended on the repository being public after a
force-push exposure on 2026-09-19. Unrelated to that incident.
