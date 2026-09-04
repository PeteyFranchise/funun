import { redirect } from 'next/navigation'

// Compatibility route for bookmarks and old notifications. Network remains
// a distinct data domain but now lives inside The Green Room's member UI.
export default function NetworkPage() {
  redirect('/green-room?view=network')
}
