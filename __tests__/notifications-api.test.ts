// Tests for the mark-all-read mutation scoping helper
// (buildMarkAllReadFilter, defined in lib/social/notifications.ts per this
// plan's Task 2 — kept here so the pure query-shape helper backing
// Plan 03's PATCH /api/notifications route has its own dedicated,
// NOTIF-03-scoped test file).
//
// RED (Task 1): lib/social/notifications.ts does not exist yet — this
// file MUST fail on module resolution. Task 2 makes it GREEN.

import { buildMarkAllReadFilter, buildNotificationCursorPredicate } from '@/lib/social/notifications'

describe('buildMarkAllReadFilter (mark-all-read mutation scoping)', () => {
  it('scopes the filter to the passed userId', () => {
    const filter = buildMarkAllReadFilter('user-42')
    expect(filter.user_id).toBe('user-42')
  })

  it('scopes the filter to read=false only (never touches already-read rows)', () => {
    const filter = buildMarkAllReadFilter('user-42')
    expect(filter.read).toBe(false)
  })

  it('does not leak any other user id into the filter', () => {
    const filterA = buildMarkAllReadFilter('user-a')
    const filterB = buildMarkAllReadFilter('user-b')
    expect(filterA.user_id).not.toBe(filterB.user_id)
  })
})

describe('buildNotificationCursorPredicate (notification pagination)', () => {
  it('uses created_at plus id as a compound cursor', () => {
    const predicate = buildNotificationCursorPredicate({
      before: '2026-07-13T07:54:54.576609+00:00',
      beforeId: '00000000-0000-0000-0000-000000000123',
    })

    expect(predicate).toContain('created_at.lt.2026-07-13T07:54:54.576609+00:00')
    expect(predicate).toContain('created_at.eq.2026-07-13T07:54:54.576609+00:00')
    expect(predicate).toContain('id.lt.00000000-0000-0000-0000-000000000123')
  })
})
