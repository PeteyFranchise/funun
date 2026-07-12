---
status: testing
phase: 09-rich-member-profile
source: [09-VERIFICATION.md]
started: 2026-07-12T10:20:00Z
updated: 2026-07-12T10:20:00Z
---

## Current Test

number: 1
name: Avatar/banner upload persistence
expected: |
  Image uploads to vault-assets, the public URL persists to artist_profiles.avatar_url/banner_url,
  and the new image renders after router.refresh()/reload; a .txt file and a >10MB image are rejected
  inline with "Image must be JPG, PNG, or WebP" / "Image must be under 10MB".
awaiting: user response

## Tests

### 1. As profile owner, upload a JPG/PNG/WebP avatar and a banner image via the new upload affordances on /profile
expected: Image uploads to vault-assets, the public URL persists to artist_profiles.avatar_url/banner_url, and the new image renders after router.refresh()/reload; a .txt file and a >10MB image are rejected inline with "Image must be JPG, PNG, or WebP" / "Image must be under 10MB"
result: [pending]

### 2. As a signed-out visitor, load /r/[projectId] for a public release
expected: Stream-only now-playing player renders (no Master/Stems toggle, no ISRC/ISWC/BPM table, no split %); overflow menu shows View credits (names+roles only), View lyrics only when lyrics exist, and Copy link; opening lyrics slides up a panel while audio keeps playing
result: [pending]

### 3. Toggle "Allow others to share my music" off in Settings, then view the profile as a signed-out visitor; toggle it back on
expected: With the toggle off, the visitor's more-options (⋯) menu is absent entirely (not just hidden) from the rendered page; with it on, the menu reappears with the single "Copy profile link" item
result: [pending]

### 4. As owner, edit roles (add a preset, add a custom title, Set-as-lead, remove down to the minimum of 1), toggle Open-to chips, and pin/unpin a Featured release (confirm a private draft never appears in the picker)
expected: All edits persist through PATCH /api/profile and are visible after a reload; the Featured picker lists only public releases; pinning a non-public release is impossible from the UI
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
