import { createServerClient as createSsrServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

async function createCookieClient() {
  const cookieStore = await cookies()

  return createSsrServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: cookiesToSet => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Components cannot write cookies during render. Middleware
            // owns token refresh and persists updated cookies before rendering.
          }
        },
      },
    }
  )
}

export const createServerClient = createCookieClient

export const createApiClient = createCookieClient

/**
 * Service-role client — bypasses RLS. Use ONLY in server code (route
 * handlers / server components) after enforcing ownership yourself. Needed
 * for the private `track-audio` bucket: uploads and signed-URL generation
 * must not depend on per-object storage policies.
 */
export const createServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
