import { redirect } from 'next/navigation'

// Root entry — send people into the app. Middleware handles auth: an
// unauthenticated visitor hitting /dashboard gets bounced to /signin.
export default function RootPage() {
  redirect('/dashboard')
}
