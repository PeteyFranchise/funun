---
quick_id: 260826-qsb
slug: split-artist-settings-into-three-linkable-tabs
type: quick
autonomous: true
branch: feat/settings-tabs-save-on-switch
files_modified:
  - lib/profile/settings-form.ts
  - lib/profile/settings-form.test.ts
  - lib/profile/demo-profile.ts
  - components/settings/SettingsFormProvider.tsx
  - components/settings/SettingsTabs.tsx
  - components/profile/RightsContractsSections.tsx
  - components/profile/PublicProfileSections.tsx
  - components/profile/PrivacySettingsForm.tsx
  - components/profile/ProfileForm.tsx
  - app/(artist)/settings/layout.tsx
  - app/(artist)/settings/page.tsx
  - app/(artist)/settings/profile/page.tsx
  - app/(artist)/settings/payouts/page.tsx

must_haves:
  truths:
    - /settings, /settings/profile, and /settings/payouts are three separately linkable, bookmarkable URLs, each rendering the same page chrome and the same tab bar.
    - /settings/payouts is reachable by clicking, from inside the app, without typing a URL — it is a tab in the bar.
    - Clicking a tab while the current tab has unsaved edits saves those edits BEFORE navigating.
    - When that save fails, navigation does not happen — the artist stays on the tab they were on and sees a retry-able error.
    - Clicking a tab with no unsaved edits navigates immediately and issues zero write requests.
    - Editing on one tab, switching to another, and switching back shows the edit still present — the two form tabs behave as one continuous page.
    - Privacy visibility still writes to /api/profile/visibility as its own request from its own form element, never folded into the /api/profile PATCH body.
    - /profile-preview still renders the whole settings experience (both field groups plus Privacy) against its fabricated profile, with no sign-in.
    - Every field editable before the split is still saved after the split — no field becomes orphaned by landing in neither tab payload.
  artifacts:
    - lib/profile/settings-form.ts exporting FormState, toForm, SETTINGS_TABS, RIGHTS_FIELDS, PUBLIC_FIELDS, isTabDirty, buildTabPayload, and saveThenNavigate
    - lib/profile/settings-form.test.ts covering failure-blocks-navigation, clean-switch-issues-no-write, and full field-group coverage
    - components/settings/SettingsFormProvider.tsx — the single owner of editable settings state, mounted by the settings layout
    - components/settings/SettingsTabs.tsx — the three-tab bar that runs the save-on-switch guard
    - app/(artist)/settings/layout.tsx — fetches the profile once, mounts the provider, renders the chrome and the tab bar
    - app/(artist)/settings/profile/page.tsx — the public-profile tab
  key_links:
    - app/(artist)/settings/layout.tsx -> SettingsFormProvider -> useSettingsForm() in every section component; the provider lives in the LAYOUT so its state survives sibling-segment navigation
    - SettingsTabs -> saveThenNavigate(savers, navigate) -> router.push; navigate is only ever called after every dirty saver resolves ok
    - lib/profile/settings-form.ts RIGHTS_FIELDS + PUBLIC_FIELDS -> buildTabPayload -> PATCH /api/profile; sanitize() ignores absent keys so a partial body is already safe
    - SettingsFormProvider `profile` prop -> context pass-through (never copied into useState) -> legal_name_locked_at and claim_prefill keep updating on router.refresh()
    - components/profile/ProfileForm.tsx -> app/profile-preview/page.tsx; ProfileForm survives ONLY as the preview composition wrapper and must keep its { profile } signature
  prohibitions:
    - Do not run `npm run build`. A dev server is live on port 3000 and `next build` clobbers .next, killing the running preview. This has already broken the user's session twice today. Use `npx tsc --noEmit` for type safety and `npx jest` for behavior.
    - No change to app/api/profile/route.ts. sanitize() already skips keys absent from the body — partial PATCH is verified-working, not assumed.
    - No change to app/api/profile/visibility. profile_visibility and open_to_visibility have no authenticated UPDATE grant (migration 058); they must keep going through the dedicated service-role route.
    - Do not merge Privacy into the main save payload. Save-on-switch may fire the visibility request alongside the profile request, but they stay two requests to two endpoints from two form elements.
    - Do not move the settings routes out from under the /settings prefix — middleware.ts:33 gates that prefix and all three routes need auth.
    - Do not rewrite, reword, or re-lay-out any field, label, helper text, LearnWhy disclosure, or group-divider banner. Sections MOVE. Their JSX is copied verbatim.
    - Do not add a dependency. There is no jsdom and no @testing-library in this repo and none is being added.
    - Do not swap the tab controls for plain buttons — they must stay real anchors so the URLs remain copyable and cmd/ctrl-clickable.
---

<objective>
Split the artist Settings page into three linkable tab routes — **Rights & contracts** (`/settings`), **Public profile** (`/settings/profile`), and **Payouts** (`/settings/payouts`) — with **save-on-switch**, so switching tabs can never lose an edit.

**Purpose:** `components/profile/ProfileForm.tsx` is a single ~1400-line client component holding two visually distinct groups that beta users read as one wall. Commit b3f900f already drew the boundary with group-divider banners; this makes the boundary a route. In passing it fixes a real discoverability bug: `app/(artist)/settings/payouts/page.tsx` exists and connects the Stripe account that pays artists their net from sync deals, and **nothing anywhere in the app links to it** (grepped `app/`, `components/`, `lib/` — zero references). A tab bar surfaces it.

**Output:** a settings layout that owns the form state, three tab routes, a pure save-on-switch module with jest coverage on the two cases that silently regress, and a `ProfileForm` reduced to the `/profile-preview` composition wrapper.
</objective>

<context>
@.claude/CLAUDE.md
@components/profile/ProfileForm.tsx
@app/(artist)/settings/page.tsx
@app/(artist)/settings/payouts/page.tsx
@app/profile-preview/page.tsx
@app/api/profile/route.ts
@components/ui/LearnWhy.tsx
@jest.config.js
</context>

<state_location_decision>
This is the load-bearing decision in the plan, so it is stated before the tasks.

**Chosen: one client provider mounted in a new `app/(artist)/settings/layout.tsx`.**

Two routes now need to agree on "am I dirty" and "save me before you navigate". Three places that state could live:

| Option | Verdict |
|---|---|
| **A. Provider in the shared layout** (chosen) | Next.js App Router partial rendering does not unmount a shared layout when navigating between its child segments. A client component the layout renders keeps its React state across `/settings` ↔ `/settings/profile` ↔ `/settings/payouts`. This is the only spot in the tree where "one continuous page" is literally true rather than simulated. |
| B. State stays in each page; page registers `{ isDirty, save }` into a layout-provided registry | Works on paper, but the page unmounts as part of the navigation it is being asked to gate. Mount/unmount ordering during a transition is exactly the kind of race that passes once by hand and regresses silently. Rejected. |
| C. Module-level store (zustand-style singleton) | Adds a dependency for one screen. No such library is in `package.json`. Rejected. |
| D. One route with a `?tab=` query param | Not "linkable tab routes" as specified, and it would leave `/settings/payouts` just as undiscoverable as it is today. Rejected. |

**Tradeoffs of A, accepted deliberately:**

1. The layout does the profile fetch, so `/settings/payouts` pays for one indexed `user_profiles` select it does not use. That is the cost of having the tab bar render on the payouts route at all. Accepted.
2. Editable state lives in provider `useState`. The **server** profile stays a *prop* that the provider passes through context **without copying into state**. That is not a stylistic choice: `ProfileForm` today reads `profile.legal_name_locked_at` and `profile.claim_prefill` straight off the prop and relies on `router.refresh()` to update them. Copy the profile into `useState` and both of those quietly stop refreshing.
3. `useState` ignores its initial value on re-render, so the dirty **baseline** must be reset explicitly inside the save function after a successful write. A refreshed prop will not do it.
</state_location_decision>

<discovered_constraints>
Verified by reading the repo during planning. These are facts, not assumptions.

1. **There is no jsdom and no `@testing-library/react`.** `jest.config.js` sets `testEnvironment: 'node'`, and `package.json` devDependencies contain neither. `__tests__/global-error.test.tsx` documents the convention: render with `renderToStaticMarkup` from `react-dom/server` and assert on the string; `useEffect` never runs. **Consequence: the save-on-switch behavior cannot be tested through the component at all.** It must be a pure function taking injected `save` and `navigate` callbacks. This constraint drives the whole module layout below — it is why `lib/profile/settings-form.ts` exists.

2. **`npm run lint` is `eslint . --max-warnings=0`.** A warning fails the gate.

3. **Partial PATCH is already safe.** `sanitize()` in `app/api/profile/route.ts` loops `EDITABLE_FIELDS` and does `if (!(key in body)) continue`. A tab may POST only its own keys with zero backend change. Confirmed by reading the loop.

4. **`ArtistNav` stays highlighted on all three routes.** `components/nav/ArtistNav.tsx:288` computes `pathname === match || pathname.startsWith(match + '/')` against `match: '/settings'`. No nav change is needed or wanted.

5. **`ProfileForm` has exactly two consumers**: `app/(artist)/settings/page.tsx` and `app/profile-preview/page.tsx`. After the split only the preview keeps importing it.

6. **`mailing_address_structured` is client-only.** It is a `FormState` key with no counterpart in `EDITABLE_FIELDS`. The PATCH sends `mailing_address` as the structured object when present, else `{ raw }`, else `null`. Any payload builder must reproduce that exactly.

7. **`genre` (singular) is a live trap.** It is in `FormState`, in `toForm()`, and in `EDITABLE_FIELDS`, but has had no input since `genres[]` replaced it. It is still sent on every save today. If it lands in neither tab payload it silently stops being written. It belongs to the public group.

8. **`DEMO_PROFILE` and the service-role read live in the page**, not a lib. `app/(artist)/settings/page.tsx` holds a ~60-line `DEMO_PROFILE` const gated on `NEXT_PUBLIC_VAULT_DEMO`, plus a `createServiceClient()` read filtered by the session-verified `user.id` (D-19 pattern). Both move to the layout; the demo const moves to a lib module first so the layout stays readable.

9. **`LearnWhy` is used three times inside `ProfileForm`**: Legal Identity ("Use the exact same name everywhere"), the lock control (`label="What does locking do?"`), and Release identifier prefixes. All three sit in the **rights** group, so all three move together into one file. Its rule holds: the RULE stays visible, the WHY collapses, and an action or status line is never collapsed.

10. **`useSelectedLayoutSegment()` returns `null` on `/settings`**, `'profile'` on `/settings/profile`, `'payouts'` on `/settings/payouts`. Use it rather than `usePathname()` — a pathname prefix test matches all three routes at once.
</discovered_constraints>

<field_ownership>
Derived from the render order in `ProfileForm.tsx` as grouped by b3f900f. This table is the contract Task 1 encodes and Task 1's coverage test enforces.

**`RIGHTS_FIELDS`** — Legal Identity, Contact, Rights & Royalties, ISRC registrant, Release identifier prefixes:
`legal_first_name`, `legal_middle_name`, `legal_last_name`, `legal_name_suffix`, `contact_phone`, `mailing_address`, `pro`, `ipi`, `publisher`, `administrator`, `mlc_id`, `soundexchange_id`, `isni`, `isrc_country_code`, `isrc_registrant_code`, `gs1_company_prefix`, `grid_issuer_code`, `catalog_number_prefix`

**`PUBLIC_FIELDS`** — Public Profile, Profile Badges & Availability, Industry Roles, Links:
`artist_name`, `genre`, `genres`, `location`, `bio`, `career_stage`, `roles`, `open_to`, `allow_resharing`, `industry_roles`, `instagram_handle`, `threads_handle`, `tiktok_handle`, `spotify_url`

**Not in either list, by design:** `mailing_address_structured` — client-only companion to `mailing_address` (constraint 6). It participates in **rights** dirtiness and in the rights payload's `mailing_address` composition, but is never sent under its own key.
</field_ownership>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract the shared form model and the pure tab logic, with tests. No UI change.</name>
  <files>lib/profile/settings-form.ts, lib/profile/settings-form.test.ts, components/profile/ProfileForm.tsx</files>
  <behavior>
    - saveThenNavigate with zero dirty savers: calls navigate exactly once, invokes no saver, reports zero writes.
    - saveThenNavigate with one dirty saver that fails: does NOT call navigate, returns the saver's error message.
    - saveThenNavigate with one dirty saver that succeeds: calls navigate, and only after the save promise resolves.
    - saveThenNavigate with two dirty savers where the first fails: the second saver is never invoked and navigate is never called.
    - saveThenNavigate with two dirty savers that both succeed: both run, navigate is called once.
    - isTabDirty('rights') is false when only a public-group field changed, and true when only a rights-group field changed. Symmetrically for 'profile'.
    - isTabDirty('rights') is true when only mailing_address_structured changed.
    - isTabDirty('payouts') is always false — that tab owns no fields.
    - buildTabPayload('rights') contains no public-group key; buildTabPayload('profile') contains no rights-group key.
    - buildTabPayload('rights') sends mailing_address as null for a blank address, as the structured object when one exists, and as a raw-wrapped object otherwise.
    - Coverage guard: the union of RIGHTS_FIELDS, PUBLIC_FIELDS, and the single client-only key equals exactly the key set of toForm(profile), with no key in both groups.
  </behavior>
  <action>
Create `lib/profile/settings-form.ts` and MOVE into it, verbatim, the `FormState` type and the `toForm()` function currently declared at the top of `components/profile/ProfileForm.tsx`. Export both. Then add, in this same module and all pure (no React, no fetch, no next/navigation import — that is what makes them testable under the node environment per constraint 1):

`SettingsTabId` — a union of `'rights' | 'profile' | 'payouts'`.

`SETTINGS_TABS` — an ordered readonly array of `{ id, href, label, segment }`, in this exact order: rights at `/settings` labelled "Rights & contracts" with segment `null`; profile at `/settings/profile` labelled "Public profile" with segment `'profile'`; payouts at `/settings/payouts` labelled "Payouts" with segment `'payouts'`. The `segment` values line up with `useSelectedLayoutSegment()` per constraint 10.

`RIGHTS_FIELDS` and `PUBLIC_FIELDS` — readonly arrays of `keyof FormState`, populated exactly from the `<field_ownership>` table above. Add a short section-header comment on each explaining that a key present in neither array is a key that silently stops being saved, and pointing at the coverage test that guards it.

`isTabDirty(tab, form, baseline)` — returns false for `'payouts'`; otherwise compares that tab's fields between `form` and `baseline`. Scalars compare with `!==`; the array-valued keys (`genres`, `roles`, `open_to`, `industry_roles`) and the object-valued `mailing_address_structured` compare by `JSON.stringify`. For `'rights'`, also treat a changed `mailing_address_structured` as dirty (constraint 6).

`buildTabPayload(tab, form)` — returns a plain object containing only that tab's keys. For `'rights'`, replace the `mailing_address` string with the exact expression `ProfileForm.handleSubmit` uses today: the trimmed value when non-blank resolves to `form.mailing_address_structured` if set, else an object wrapping the trimmed raw value, and `null` when blank. Never emit a `mailing_address_structured` key. For `'payouts'`, return an empty object.

`SaveResult` — a discriminated result type: an ok variant, and a failure variant carrying an error string.

`TabSaver` — `{ dirty: boolean; save: () => Promise<SaveResult> }`.

`saveThenNavigate(savers, navigate)` — the save-on-switch orchestrator, async, returning `{ navigated, error, writes }`. Filter to the dirty savers. If none remain, call `navigate()` and return navigated true with `writes` of 0 — this is the "a clean tab switch does not write and does not spin" guarantee, and returning the write count is what lets the test assert it rather than infer it. Otherwise await the dirty savers **sequentially**; on the first failure return immediately with navigated false, the error string, and the count of saves attempted, **without calling navigate**; if all succeed, call `navigate()` and return navigated true. Put a section-header comment above it recording that the failure path deliberately does not navigate, because the owner chose save-on-switch over a warn dialog precisely so a failed write cannot strand an edit on a page the artist has already left.

Then edit `components/profile/ProfileForm.tsx` to import `FormState` and `toForm` from `@/lib/profile/settings-form` and delete the local copies. Nothing else in that file changes — this commit is internals-only and the rendered page is byte-identical.

Write `lib/profile/settings-form.test.ts` covering every case in `<behavior>`. Place it alongside the module, matching `lib/auth/postSignInPath.test.ts`. Build the baseline by calling `toForm()` on a minimal profile literal cast to the profile type, and derive the coverage-guard expectation from `Object.keys(toForm(...))` so the test breaks automatically when a new field is added to `FormState` without being assigned a tab.
  </action>
  <verify>
    <automated>npx jest lib/profile/settings-form.test.ts && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>The pure module and its tests exist and pass. `ProfileForm.tsx` imports the type and the mapper instead of declaring them. `/settings` and `/profile-preview` render exactly as before. `saveThenNavigate` has no caller yet — that is expected; Task 5 wires it.</done>
</task>

<task type="auto">
  <name>Task 2: Add SettingsFormProvider and move the Rights and contracts sections out of ProfileForm</name>
  <files>components/settings/SettingsFormProvider.tsx, components/profile/RightsContractsSections.tsx, components/profile/ProfileForm.tsx</files>
  <action>
Create `components/settings/SettingsFormProvider.tsx` as a `'use client'` component taking a single `profile` prop plus children. It becomes the sole owner of everything `ProfileForm` currently holds in state, moved across as-is:

- `form` initialized from `toForm(profile)`, plus a `baseline` state also initialized from `toForm(profile)`, used only for dirty comparison.
- `set(key, value)` and a raw `setForm` setter (the chip and badge toggles need the functional form).
- The `submitting` / `error` / `saved` trio for the main save; the `lockSubmitting` / `lockError` pair; the `confirmingField` / `confirmFieldError` pair.
- `visibilityForm`, `visibilityBaseline`, `visibilitySubmitting`, `visibilityError`, `visibilitySaved`.
- The four async handlers, moved verbatim in behavior: the main save, the legal-name confirm-and-lock, the claim-prefill field confirm, and the visibility save.

Two changes to the main save while moving it: it takes a `SettingsTabId` and posts `buildTabPayload(tab, form)` rather than the whole form; and on success it resets `baseline` to the just-saved `form` (constraint noted in the state-location decision: a refreshed prop cannot do this, because `useState` ignores its initial value on re-render). Have it return a `SaveResult` in addition to setting the error state, so Task 5 can drive it from `saveThenNavigate`. Do the same for the visibility save against `visibilityBaseline`.

**The `profile` prop is passed straight through the context value. Do not copy it into `useState`.** The sections read `legal_name_locked_at` and `claim_prefill` off it, and `router.refresh()` after a lock or a confirm is what updates them.

Expose `isTabDirty(tab)` and `visibilityDirty` as derived values computed with the Task 1 helpers against the baselines.

Export a `useSettingsForm()` hook that reads the context and throws a named error when called outside the provider.

Create `components/profile/RightsContractsSections.tsx` as a `'use client'` component with no props, reading everything from `useSettingsForm()`. Move into it, **verbatim JSX**, the Contracts & rights group divider and the five sections it fronts: Legal Identity (including the confirm-and-lock block and its `LearnWhy`), Contact, Rights & Royalties, ISRC registrant, and Release identifier prefixes. Move the `IsrcLearnMore` and `ClaimPrefillNotice` helper components and the `CLAIM_PREFILL_FIELDS` / `ClaimPrefillField` declarations with them, since nothing else uses them. The shared `inputClass` and `labelClass` string constants are needed by both groups — put them in `lib/profile/settings-form.ts` and import from there. Below the moved sections, render this tab's own error line and its "Save changes" button, wired to the main save for the rights tab.

Reduce `components/profile/ProfileForm.tsx` to mount `SettingsFormProvider` around `RightsContractsSections` followed by the still-inline public-group JSX and the still-inline Privacy form. Keep the exported `ProfileForm({ profile })` signature exactly as it is — `app/profile-preview/page.tsx` imports it and must not need editing.

Do not restyle, reword, or re-order anything. Every label, helper line, placeholder, banner, and disclosure moves character-for-character.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && npx jest lib/profile/settings-form.test.ts</automated>
  </verify>
  <done>`/settings` and `/profile-preview` render the identical page to before, now sourcing state from the provider. All three `LearnWhy` disclosures and both group dividers are present and toggling. Both save buttons still work against their original endpoints.</done>
</task>

<task type="auto">
  <name>Task 3: Move the Public profile sections and the Privacy form out; ProfileForm becomes the preview wrapper</name>
  <files>components/profile/PublicProfileSections.tsx, components/profile/PrivacySettingsForm.tsx, components/profile/ProfileForm.tsx</files>
  <action>
Create `components/profile/PublicProfileSections.tsx`, `'use client'`, no props, reading from `useSettingsForm()`. Move into it verbatim the "Your public profile" group divider and its four sections: Public Profile, Profile Badges & Availability (role badges, the custom-role inline input, "Open to" chips, and the resharing switch), Industry Roles, and Links. Bring along the local UI state those sections own — `addingCustomRole` and `customRoleInput` — as component-local `useState`; they are transient editor state, not part of the saved form, so they do not belong in the provider. Bring along the module constants only this group uses: `MAX_PROFILE_ROLES`, `MAX_CUSTOM_ROLE_LEN`, `profileRoleLabel`, `OPEN_TO_EDITOR_OPTIONS`, `CAREER_STAGES`. Below the sections, render this tab's error line and its "Save changes" button wired to the main save for the profile tab.

The role and chip mutators (`togglePresetRole`, `addCustomRole`, `removeRoleAt`, `setLeadRole`, `toggleOpenTo`, `toggleGenre`, `toggleRole`) currently live on the component and call `setForm` with a functional updater. Move them into this file and have them call the provider's `setForm`. Their logic — the minimum-one-role floor, the six-role ceiling, the index-0-is-lead convention, the no-remove-on-lead rule — is unchanged.

Create `components/profile/PrivacySettingsForm.tsx`, `'use client'`, no props. Move the Privacy block verbatim: its own `<form>` element, its own submit handler bound to the provider's visibility save, its own submit button, and the four label/copy constant maps it uses. Keep the existing head comment explaining why this is a separate form and endpoint, and extend it with one line noting that save-on-switch fires it as a **second, independent request** and never folds these two columns into the `/api/profile` body.

Reduce `components/profile/ProfileForm.tsx` to a thin composition: the provider wrapping `RightsContractsSections`, `PublicProfileSections`, and `PrivacySettingsForm`, stacked, inside the existing outer spacing wrapper. Replace its head comment with one stating that this component now exists solely so `/profile-preview` can render the full settings experience on one auth-free page, that the real app composes these same three pieces across three tab routes, and that its `{ profile }` signature is load-bearing for that preview page.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && npx jest lib/profile/settings-form.test.ts</automated>
  </verify>
  <done>`ProfileForm.tsx` is under roughly 60 lines and contains no field JSX. `/settings` and `/profile-preview` still render every section, both save buttons, and the Privacy form, identical to before. No consumer of `ProfileForm` needed editing.</done>
</task>

<task type="auto">
  <name>Task 4: Add the settings layout, the tab bar, and the /settings/profile route</name>
  <files>app/(artist)/settings/layout.tsx, app/(artist)/settings/page.tsx, app/(artist)/settings/profile/page.tsx, app/(artist)/settings/payouts/page.tsx, components/settings/SettingsTabs.tsx, lib/profile/demo-profile.ts</files>
  <action>
Move the `DEMO_PROFILE` constant out of `app/(artist)/settings/page.tsx` into a new `lib/profile/demo-profile.ts`, exported unchanged (constraint 8).

Create `app/(artist)/settings/layout.tsx` as a server component with `export const dynamic = 'force-dynamic'`. Move the profile resolution into it exactly as the page does it today: the `NEXT_PUBLIC_VAULT_DEMO` branch returning the demo profile, otherwise `createServerClient()` plus `auth.getUser()` to establish ownership, then the `createServiceClient()` read filtered by the verified `user.id`. Keep the existing comment explaining why the read runs on the service client — it documents the D-19 self-service-ownership pattern and is not incidental.

The layout renders the page chrome that all three tabs share: the `mx-auto max-w-3xl px-6 py-10` container, the `Settings` heading, its one-line subtitle, and `<SettingsTabs />`. When the profile resolves, wrap `children` in `SettingsFormProvider`; when it does not, render the existing "We couldn't load your profile" fallback in place of children.

One consequence to accept, not work around: `/settings/payouts` now also triggers the layout's profile read even though it does not use it. That single indexed select is the price of the tab bar rendering on the payouts route at all.

Create `components/settings/SettingsTabs.tsx`, `'use client'`. Map `SETTINGS_TABS` to a horizontal bar of Next `<Link>` elements. Determine the active tab by comparing `useSelectedLayoutSegment()` against each entry's `segment`, remembering the rights tab's segment is `null` (constraint 10). Style it as an underlined tab row consistent with the page's existing hairline-border language, with an `aria-current` of `page` on the active tab. In this task the links are ordinary links — clicking navigates immediately. Task 5 adds the guard.

Rewrite `app/(artist)/settings/page.tsx` to a server component that renders `<RightsContractsSections />` and nothing else — no fetch, no heading, no container; the layout owns all of that. Keep `export const dynamic = 'force-dynamic'`.

Create `app/(artist)/settings/profile/page.tsx` the same way, rendering `<PublicProfileSections />` followed by `<PrivacySettingsForm />`.

Edit `app/(artist)/settings/payouts/page.tsx` to drop its own container and its own `Payouts` heading, both now supplied by the layout, keeping its descriptive paragraph as the section intro above `<PayoutsOnboarding />` and keeping its own `dynamic` export.

No nav change. `ArtistNav` already keeps the Settings item lit on all three routes via its prefix test (constraint 4) — read line 288 to confirm rather than editing anything.

State the behavior gap this commit leaves, so it is a known step and not a surprise: tab switching is instant and, because the provider lives in the layout, an unsaved edit survives the switch in memory — but it is not yet written. That matches today's behavior exactly. Task 5 closes it.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && test -f "app/(artist)/settings/layout.tsx" && test -f "app/(artist)/settings/profile/page.tsx" && test -f "app/(artist)/settings/payouts/page.tsx" && grep -rn "SETTINGS_TABS" components/settings/SettingsTabs.tsx</automated>
  </verify>
  <done>All three URLs load, each showing the same heading and tab bar with the correct tab marked current. `/settings` shows only rights sections; `/settings/profile` shows only public sections plus Privacy; `/settings/payouts` shows the Stripe onboarding and is now reachable by clicking. Editing on one tab and returning shows the edit still in the field. `/profile-preview` is untouched and still renders all three groups.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: Wire save-on-switch into the tab bar</name>
  <files>components/settings/SettingsTabs.tsx, components/settings/SettingsFormProvider.tsx, lib/profile/settings-form.test.ts</files>
  <behavior>
    - The savers assembled for the rights tab are the main save alone.
    - The savers assembled for the profile tab are the main save followed by the visibility save, in that order, each carrying its own dirty flag.
    - The savers assembled for the payouts tab are empty — leaving payouts never writes.
    - A profile-tab switch where only the visibility selects changed runs the visibility save and does not run the main save.
  </behavior>
  <action>
Add a `saversForTab(tab)` helper to the provider's context value, returning the ordered `TabSaver` list for the tab being **left**: for rights, a single entry pairing `isTabDirty('rights')` with the main save; for profile, that same main-save entry followed by an entry pairing `visibilityDirty` with the visibility save; for payouts, an empty array. Two savers on the profile tab is the point at which Privacy joins save-on-switch — as its own request to `/api/profile/visibility`, sequenced after the profile PATCH, never merged into it.

In `SettingsTabs`, intercept the click on each tab. Bail out of the interception entirely — letting the browser do its normal thing — when the tab is already active, or when the event carries a meta, ctrl, shift, or alt modifier, or when it is not a primary-button click. That preserves cmd-click-to-new-tab and copy-link-address on what are still real anchors with real hrefs, which is the whole reason these routes are linkable.

For a plain left click: prevent the default, then call `saveThenNavigate(saversForTab(activeTab), () => router.push(href))`. Hold a pending state for the duration and disable the tab controls while it runs. On a returned `navigated` of false, stay put and render the returned error next to the tab bar as a short retry-able line — the artist is still on the tab holding the unsaved values, which is the entire reason the failure path does not navigate. On success, show a brief "Saved" acknowledgement.

Guard the pending state so a second click while a save is in flight is ignored rather than queueing a second write.

Take the loading and error affordances from `saveThenNavigate`'s return value, not from separate local booleans — the pure function already reports whether it wrote, whether it navigated, and why it stopped, and duplicating that in component state is how the two states drift apart.

Extend `lib/profile/settings-form.test.ts` with the `saversForTab` composition cases in `<behavior>`. Keep them pure: export the shape-building logic in a form that takes plain dirty flags and stub save functions, so the assertions run under the node environment without rendering anything (constraint 1).
  </action>
  <verify>
    <automated>npx jest lib/profile/settings-form.test.ts && npx tsc --noEmit && npm run lint && npx jest</automated>
  </verify>
  <done>Editing a field then clicking another tab writes that tab's fields and then navigates. Making the write fail keeps the artist on the tab with their values intact and a visible retry-able error. Clicking a tab with nothing changed navigates instantly with no request and no spinner. Cmd-clicking a tab opens it in a new browser tab. The two regression-prone cases — failure blocks navigation, and a clean switch issues no write — are locked in by passing jest assertions.</done>
</task>

</tasks>

<verification>
Run after every task. The full set must be green before the final commit.

- `npx tsc --noEmit` — must report zero errors.
- `npm run lint` — must be clean. It runs with `--max-warnings=0`, so a warning is a failure.
- `npx jest` — the whole suite must pass, not just the new file.

**Do not run `npm run build`.** A dev server is live on port 3000 and `next build` clobbers `.next`, killing the running preview. This has already broken the user's session twice today. Type safety comes from `tsc --noEmit`; behavior comes from `jest`.

Manual smoke, once, at the end (dev server already running on port 3000):
1. `/settings` shows the tab bar with "Rights & contracts" current, and only the contracts group below it.
2. `/settings/profile` shows the public group plus Privacy.
3. `/settings/payouts` shows the Stripe onboarding — reached by clicking the tab, not by typing the URL.
4. Type into a rights field, click "Public profile" — brief save, then it navigates. Return: the value is there and persisted.
5. Kill the network, type into a field, click another tab — you stay put and see the error. Restore the network, click again — it saves and moves.
6. Click a tab without touching anything — instant, no spinner, no request in the network panel.
7. `/profile-preview` renders all three groups with no sign-in.
</verification>

<success_criteria>
- Three linkable settings routes, one shared chrome and tab bar, `/settings/payouts` reachable by clicking from inside the app.
- Switching tabs with unsaved edits saves them first; a failed save blocks the navigation and keeps the values on screen; a clean switch issues zero writes.
- Both tabs feel like one page: state persists across switches because it lives in the layout-mounted provider.
- Privacy still writes through `/api/profile/visibility` from its own form as its own request.
- Every field editable before the split is still saved after it, guarded by the field-coverage test.
- `app/api/profile/route.ts` is unmodified.
- All three `LearnWhy` disclosures and both group-divider banners survive verbatim.
- `/profile-preview` works unchanged.
- `npx tsc --noEmit`, `npm run lint`, and `npx jest` are all green. `npm run build` was never run.
</success_criteria>

<output>
Write `.planning/quick/260826-qsb-split-artist-settings-into-three-linkabl/260826-qsb-SUMMARY.md` when done.
</output>
</content>
</invoke>
