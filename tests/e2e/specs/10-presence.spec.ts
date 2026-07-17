import { test, expect } from '@playwright/test'
import { STORAGE_STATE, hasUserA, hasUserB } from '../env'
import { hasSeed, seed } from '../helpers'

// PR #37 UAT 1: "Two-session presence: Online pill appears/disappears correctly."
//
// This is the one item that genuinely needs two browsers. ProfilePresenceDot
// reads the `presence-global` Realtime Presence channel and renders nothing
// unless it can positively confirm a live entry for the target. Seeding
// last_seen_at cannot make the pill appear - that column only drives the
// "Active X ago" text elsewhere. So the only way to prove the pill works is to
// hold a real authenticated session open in a second context and watch B's view
// of A's profile change.
//
// The specs run at 1440x900 (playwright.config.ts) because PresenceTracker only
// tracks while document.visibilityState === 'visible'.

test.describe('presence - the Online pill tracks a live session', () => {
  test.skip(
    !hasUserA() || !hasUserB() || !hasSeed(),
    'needs User A + User B creds and a seeded fixture (npm run e2e:seed)',
  )

  test('UAT 1 - pill appears while A holds a session and clears when A leaves', async ({ browser }) => {
    const { handleA } = seed()

    // B is the observer, parked on A's public profile the whole time.
    const observer = await browser.newContext({ storageState: STORAGE_STATE.userB })
    const observerPage = await observer.newPage()
    await observerPage.goto(`/u/${handleA}`)

    const pill = observerPage.getByTestId('presence-pill')

    // Nobody is tracking A yet. Assert absence explicitly before proving
    // presence, so a pill that is stuck on can't pass this test.
    await expect(pill, 'A has no live session yet - pill must not render').toBeHidden()

    // A signs in somewhere else. PresenceTracker mounts in the authenticated
    // layout and calls track() on SUBSCRIBED.
    const actor = await browser.newContext({ storageState: STORAGE_STATE.userA })
    const actorPage = await actor.newPage()
    await actorPage.goto('/vault')

    await expect(pill, 'A is live - the Online pill should appear for B').toBeVisible({
      timeout: 30_000,
    })
    await expect(pill).toHaveText(/Online/)

    // A closes every session. untrack() fires on unload; the presence channel
    // also reaps the entry when the socket drops.
    await actor.close()

    await expect(pill, 'A is gone - the pill must clear').toBeHidden({ timeout: 30_000 })

    await observer.close()
  })

  test('a stale last_seen_at never fakes the pill', async ({ browser }) => {
    const { handleA } = seed()
    const { supabaseAdmin } = await import('../helpers')
    const { userAId } = seed()

    // Write a last_seen_at that would read as "Active now" in the text bucket
    // (formatPresenceStatus: <2min). The pill must still stay hidden, because
    // it is presence-channel driven and A holds no session here. This is the
    // honesty rule the component's own comment claims - assert it.
    await supabaseAdmin()
      .from('artist_profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userAId)

    const observer = await browser.newContext({ storageState: STORAGE_STATE.userB })
    const page = await observer.newPage()
    await page.goto(`/u/${handleA}`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByTestId('presence-pill'),
      'a fresh last_seen_at must not produce an Online pill - only a live channel entry may',
    ).toBeHidden()

    await observer.close()
  })
})
