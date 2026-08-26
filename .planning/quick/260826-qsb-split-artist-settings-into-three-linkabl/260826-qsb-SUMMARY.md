---
quick_id: 260826-qsb
slug: split-artist-settings-into-three-linkable-tabs
type: quick
status: complete
branch: feat/settings-tabs-save-on-switch
completed: 2026-08-26
tasks_completed: 5
tasks_total: 5
commits:
  - db4f1c9 refactor(settings) extract the shared form model and pure tab logic
  - 9d58de6 refactor(settings) move settings state into a provider, split out the rights group
  - b52fc71 refactor(settings) split out the public-profile and privacy groups
  - 62f2ce4 feat(settings) three linkable tab routes sharing one layout
  - c5e64cf feat(settings) save on tab switch, and block the switch when the save fails
files_created:
  - lib/profile/settings-form.ts
  - lib/profile/settings-form.test.ts
  - lib/profile/demo-profile.ts
  - components/settings/SettingsFormProvider.tsx
  - components/settings/SettingsTabs.tsx
  - components/profile/RightsContractsSections.tsx
  - components/profile/PublicProfileSections.tsx
  - components/profile/PrivacySettingsForm.tsx
  - app/(artist)/settings/layout.tsx
  - app/(artist)/settings/profile/page.tsx
files_modified:
  - components/profile/ProfileForm.tsx
  - app/(artist)/settings/page.tsx
  - app/(artist)/settings/payouts/page.tsx
gates:
  tsc: 0 errors
  lint: clean (--max-warnings=0)
  jest: 275 suites / 2975 tests passing
---

# Split artist Settings into three linkable tabs, with save-on-switch

The artist Settings page is now three separately linkable routes —
**Rights & contracts** (`/settings`), **Public profile** (`/settings/profile`),
and **Payouts** (`/settings/payouts`) — sharing one layout, one heading, one
tab bar, and one form-state provider. Switching tabs saves the tab being left
before it navigates, and a failed save keeps the artist where they are with
their values intact.

In passing this fixes a real discoverability bug: `/settings/payouts` already
existed, already connected the Stripe account Funūn pays sync-deal net into,
and **nothing anywhere in the app linked to it**. It was reachable only by
typing the URL. It is now a tab.

## What shipped, task by task

**1. `lib/profile/settings-form.ts` + tests (db4f1c9).**
`FormState` and `toForm()` moved out of `ProfileForm.tsx`, joined by the tab
table, the field-ownership arrays, `isTabDirty`, `buildTabPayload`,
`saveThenNavigate`, and (task 5) `buildSaversForTab`. Everything is pure — no
React, no fetch, no `next/navigation` — because that is the only way it can be
tested here: jest runs `testEnvironment: 'node'` with no jsdom and no
`@testing-library`, so nothing that renders is assertable.

**2. `SettingsFormProvider` + `RightsContractsSections` (9d58de6).**
The provider is the sole owner of editable settings state. `profile` is passed
through context and deliberately **not** copied into `useState` — the sections
read `legal_name_locked_at` and `claim_prefill` off the prop and rely on
`router.refresh()`. The dirty baseline is the reverse: it must be state and is
reset by hand after each successful write.

**3. `PublicProfileSections` + `PrivacySettingsForm` (b52fc71).**
Privacy is its own file, its own `<form>`, its own endpoint. `ProfileForm`
drops to 37 lines and survives only as the `/profile-preview` composition
wrapper, `{ profile }` signature unchanged.

**4. Layout, tab bar, routes (62f2ce4).**
The profile fetch and the provider live in `app/(artist)/settings/layout.tsx`.
That placement is the design, not a convenience: App Router partial rendering
does not unmount a shared layout between its child segments, so provider state
survives a tab switch and an edit typed on one tab is still there on return.
Tabs are real `<Link>` anchors; active state comes from
`useSelectedLayoutSegment()`, not a pathname prefix test.

**5. Save-on-switch (c5e64cf).**
A plain left click on an inactive tab saves the current tab's dirty savers in
order, then navigates. Modified and non-primary clicks are not intercepted at
all, so cmd-click and copy-link-address still work.

## Owner decision, honoured exactly

Save first · block navigation on failure · never lose an edit · no write when
clean. All four are locked in by passing assertions, not by manual clicking:

| Guarantee | Test |
|---|---|
| Failure blocks navigation | `does NOT navigate when a dirty save fails, and reports the error` |
| Failure does not run later savers | `stops at the first failure — the second saver never runs` |
| Clean switch issues zero writes | `navigates immediately and issues zero writes when nothing is dirty` (asserts `writes: 0`) |
| Navigation happens after the save resolves | `navigates only after the save promise resolves` (order assertion) |
| Privacy stays a second, independent request | `leaves the profile tab with the main save then the visibility save` |
| Leaving payouts never writes | `leaving payouts issues zero writes and navigates immediately` |
| No field silently stops saving | `partitions toForm()'s key set across rights, public, and client-only` |

## Deviations from the plan

**1. `inputClass` / `labelClass` moved in task 1, not task 2.**
The plan put them in `lib/profile/settings-form.ts` during task 2. Moving them
one commit earlier avoids leaving a duplicated copy of the same two constants
in the tree for the length of a commit. No behavior change; the strings are
byte-identical.

**2. `CLAIM_PREFILL_FIELDS` / `ClaimPrefillField` live in
`SettingsFormProvider.tsx`, not `RightsContractsSections.tsx`.**
The plan put them with the sections. But the provider owns the confirm handler
and its `confirmingField` state, both typed by `ClaimPrefillField`, so the
provider would have had to import a type from a file that imports
`useSettingsForm()` from it — a circular import for no gain. Declaring them in
the provider makes the dependency one-directional (sections → provider). The
in-sync-with-`app/api/profile/route.ts` comment moved with them.

**3. Added `try`/`catch` around both saves (Rule 2 — missing critical error
handling).**
The original saves had no `catch`, so a thrown `fetch` (offline, DNS, aborted)
became an unhandled rejection. That was survivable when the only caller was a
submit button; it is not survivable now, because `saveThenNavigate` reads the
returned result to decide whether to navigate, and a rejection there would
propagate instead of blocking the switch. Directly required by the owner's
"navigation does not happen when the save fails" — and by the plan's own
manual-smoke step 5 ("kill the network… you stay put and see the error"). Both
saves now return
`{ ok: false, error: 'Could not reach the server. Check your connection and try again.' }`.
`res.json()` also got a `.catch(() => ({}))` so a non-JSON error body cannot
throw past the same guard.

**4. Added `useSettingsFormOptional()` and moved `<SettingsTabs />` inside the
provider.**
Task 4 rendered the tab bar as a sibling of the provider. Task 5 needs the bar
to read form state, so it had to move inside. It still has to render in the
"we couldn't load your profile" branch, where no provider exists — hence a
null-tolerant read rather than a throwing one. With no provider the saver list
is empty and the tab navigates plainly, which is correct: there is nothing to
save.

**5. `useCallback` dropped from `handleAddressChange`.**
It moved into `RightsContractsSections` as a plain function, matching every
other handler in these files. `AddressAutocomplete` does not memoize on it, and
`react-hooks/exhaustive-deps` is a warning under `--max-warnings=0`, so a
plain function is both simpler and safer here.

None of these change the owner decision.

## Known cosmetic note (not a bug)

`error` and `saved` are single values on the provider, shared by both field
groups' Save buttons. In the real app only one group renders at a time, so this
is invisible. On `/profile-preview`, where all three render stacked, saving one
group would flash "Saved" next to both buttons. Preview-only, and the preview
is a review tool rather than a used surface. Left alone rather than split into
per-tab state, which would be state the app does not need.

## Verification

Automated (run before every commit; all green at each one):

- `npx tsc --noEmit` — 0 errors
- `npm run lint` — clean (`eslint . --max-warnings=0`)
- `npx jest` — 275 suites, 2975 tests passing (up from 2969; +26 in the new
  file, of which 6 are task 5's)

`npm run build` was **never run** — the dev server on port 3000 stayed up
throughout.

Live smoke against that dev server:

- `/profile-preview` → 200, and the rendered HTML contains both group dividers,
  all nine section headings, all 3 `LearnWhy` disclosures, both "Save changes"
  buttons, and "Save privacy settings". Unchanged and unauthenticated, as
  required.
- `/settings`, `/settings/profile`, `/settings/payouts` → all three 307 to
  `/signin?next=…` for an unauthenticated request, confirming `middleware.ts`
  still gates the whole prefix including the new route.

`__tests__/profile-preview-route.test.ts` passes unchanged.
`app/api/profile/route.ts` is unmodified.

## Not verified — needs a signed-in pass

The curl smoke cannot log in, so the authenticated behavior was proven by unit
test and by reading, not by clicking. Worth five minutes in the browser:

1. Type in a rights field, click **Public profile** → brief save, then it
   navigates; come back and the value persisted.
2. Go offline, type, click another tab → you stay put with the error line;
   go back online, click again → it saves and moves.
3. Click a tab having touched nothing → instant, no spinner, no request in the
   network panel.
4. Cmd-click a tab → opens in a new browser tab.
5. Change only a Privacy select, then switch tabs → exactly one request, to
   `/api/profile/visibility`.
