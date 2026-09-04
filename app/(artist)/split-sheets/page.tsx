import { redirect } from 'next/navigation'

// Force dynamic rendering — user auth state must be read per request
export const dynamic = 'force-dynamic'

// Keep the former list URL as a compatibility route for bookmarks, emails,
// and old UI links. Detail and creation routes remain at /split-sheets/*;
// only the index now lives visibly inside Contract Locker.
export default function SplitSheetsListPage() {
  redirect('/contracts?view=split-sheets')
}
