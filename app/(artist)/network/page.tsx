import { NetworkTab } from '@/components/network/NetworkTab'

export const dynamic = 'force-dynamic'

// /network (Plan 13-02, DISCOVER-04) — the member-facing Network tab:
// following, followers, connections, pending requests, and blocked
// members. Mirrors /green-room: this route is NOT in middleware.ts's
// isProtected allowlist, so an unauthenticated visitor still renders the
// page shell — auth is enforced by GET /api/network returning 401, which
// NetworkTab surfaces as its error state (same pattern as GreenRoomFeed).
export default function NetworkPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(217,70,239,.16),transparent_34%),#07070c]">
      <NetworkTab />
    </main>
  )
}
