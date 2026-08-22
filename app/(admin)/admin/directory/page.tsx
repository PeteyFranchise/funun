import { redirect } from 'next/navigation'

// The read-only Team Directory was folded into /admin/team-members, which now
// serves as the directory for all staff (management gated to Leadership + TMS
// inside StaffAdmin). This route redirects so existing links/bookmarks keep
// working instead of 404ing. The Directory nav entry has been removed.
export default function AdminDirectoryRedirect() {
  redirect('/admin/team-members')
}
