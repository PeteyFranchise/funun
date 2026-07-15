# Phase 13 Validation Plan

**Status:** Draft

## Test Priorities

Phase 13 validation must prove privacy boundaries before UI polish.

## Automated Coverage

### Network

- Auth required for network endpoints.
- Following/followers/connections lists are viewer-scoped.
- Pending request actions enforce participant state rules.
- Blocked list shows only rows where `blocker_id = auth.uid()`.

### Blocking

- Direct profile route does not render blocked profiles.
- Search/discover excludes blocked users in both directions.
- Feed excludes blocked users in both directions.
- DM send rejects blocked pairs.
- Follow/connect writes reject blocked pairs.
- Comments/reactions/reposts reject blocked pairs through post visibility/RLS.
- Blocked party cannot query who blocked them.

### Reports

- Auth required to create report.
- Reporter can only create report for visible/reportable target.
- Reporter can read only their own report status.
- Reported user cannot read report details.
- Admin can update report status and internal notes.

### Verification

- Non-admin cannot update `artist_profiles.verified`.
- Admin can grant and revoke verified.
- Public profile renders verified badge from server data only.

### Profile Visibility

- Public profiles remain public.
- Connections-only profile visible to accepted connections and owner.
- Connections-only profile hidden from non-connections.
- `Open to` visibility respects public/connections/hidden setting.
- People Search omits hidden `Open to` state.

## Manual UAT

Use three accounts:

- Artist A.
- Artist B.
- Industry C.

Scenarios:

1. A and B follow/connect. Confirm Network tab categories.
2. A blocks B. Confirm B cannot view A profile, message A, discover A, or interact with A feed posts.
3. B should not see that A blocked them; only access is denied or absent.
4. A unblocks B. Confirm normal flows return only where relationship state still allows it.
5. C reports A's profile. Confirm C sees submitted status; A cannot see report.
6. Admin reviews C's report and marks dismissed/actioned.
7. Admin grants verified badge to A. Confirm A cannot grant it to themselves.
8. A sets profile visibility to connections-only. Confirm non-connection public route/search excludes A.
9. A hides `Open to`; confirm profile/search omit it while settings retain values.

## Sign-Off Checklist

- [ ] Block data remains private to blocker/admin.
- [ ] Reports remain private to reporter/admin.
- [ ] Verified grant/revoke is admin-only.
- [ ] Profile visibility is server-enforced.
- [ ] Network tab state transitions preserve existing follows/connections behavior.
- [ ] Phase 12 feed/search paths still pass after trust/safety changes.
- [ ] Lint, TypeScript, and focused Jest suites pass.

