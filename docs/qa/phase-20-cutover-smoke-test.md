# Phase 20 Cutover — Production Smoke Test

**Tester:** Thomas
**Environment:** Production — https://www.funun.studio
**Status:** the change is already live in production — you are verifying the live site, not a preview.
**Time needed:** ~15 minutes

---

## Background — why this test matters (plain terms)

Behind the scenes we renamed the core database table that stores every user's
profile — name, handle, bio, rights/registration info, contact details, etc. We
did it with **zero downtime**: during the switchover a temporary "compatibility
bridge" lets both the old and new code read the data, so nothing goes offline.

The catch: **almost every screen that shows or saves a user's profile could, in
theory, be affected.** This smoke test walks the real user flows to confirm
nothing broke in production. If a flow does fail it is *safe* — the bridge keeps
the working path alive — but we need to know **before we remove the bridge**.

Please run the checks below **in order** (start with #1, it's the most
important) and report your results in a **comment on this PR** using the
template at the bottom.

---

## Before you start

- Open the site in a browser with the **developer console open** so you catch
  any errors:
  - Chrome/Edge: `View → Developer → JavaScript Console`, or right-click →
    `Inspect` → `Console` tab.
  - If something breaks, the console usually shows a **red** message — copy that
    text into your report.
- For the signup check (#4) you'll make a **throwaway account** — use any email
  you can receive mail at (a `+alias` like `you+fununtest@gmail.com` works well).

---

## The checks

### 1. Settings → Rights — edit and save  ⭐ most important
This is the flagship path: it both **reads** and **writes** your profile's
rights fields, straight through the renamed table.

1. Sign in at https://www.funun.studio
2. Go to **Settings → Rights** (rights identity / registration info)
3. Change a field — e.g. legal name, PRO, publisher, IPI, contact phone, or
   mailing address
4. Click **Save**
5. **Reload the page**

- ✅ **Pass:** it saves with no error, and the new value is still there after reload.
- ❌ **Fail:** an error appears, the save spins/never completes, or the value
  doesn't persist after reload. Note the exact field and any console error.

### 2. Dashboard / your own profile
1. Open your **dashboard**, then your own **profile** and **settings** pages.

- ✅ **Pass:** your info renders correctly, no errors.
- ❌ **Fail:** blank or missing data, an error message, or red console errors.

### 3. Public profile — logged out
1. Open a **private / incognito** window (so you're signed out).
2. Visit your public profile: `https://www.funun.studio/u/<your-handle>`

- ✅ **Pass:** your public info renders.
- ❌ **Fail:** 404 / 500 / error page, or public info that's missing.

### 4. Sign up a new (throwaway) account
This exercises the account-creation path that writes a **brand-new profile row**.

1. In an incognito window, go to https://www.funun.studio/signup
2. Create an account with a throwaway email.
3. Complete onboarding into the app.

- ✅ **Pass:** the account creates and you land in the app with a working profile.
- ❌ **Fail:** signup error, stuck onboarding, or a missing/empty profile afterward.

*(If you can, try one more signup as a different account type — e.g. an
industry/pro account — since those follow a slightly different creation path.)*

### 5. Split sheet + a metadata/registration read
1. Open (or create) a **split sheet** on one of your projects.
2. Open a project's **metadata** and/or **registration** view.

- ✅ **Pass:** collaborator/profile info loads and saves normally.
- ❌ **Fail:** error loading or saving, or missing collaborator data.

---

## How to report

Post a **comment on this PR** using the template below. Check each box that
passed; for any failure, include the **exact step**, the **error text**, the
**browser console output**, and a **screenshot** if you can.

```
Phase 20 smoke test — results (env: production)

- [ ] 1. Settings → Rights save (edit + save, persists on reload)
- [ ] 2. Dashboard / own profile loads
- [ ] 3. Public profile (logged out) renders
- [ ] 4. Signup (throwaway) creates account + lands in app
- [ ] 5. Split sheet + metadata/registration read

Failures / notes:
(paste exact steps, error text, console output, screenshots here)
```

If **all five pass**, please also comment **"✅ All smoke checks passed"** —
that's our green light to remove the temporary compatibility bridge and close
out the change.

---

## If something fails

Don't worry about breaking anything — production is **resilient** during this
window (the compatibility bridge keeps the working path alive). Just report it
here with as much detail as you can, and we'll diagnose and fix **before**
removing the bridge.
