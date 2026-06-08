import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
export const createServerClient = () => createServerComponentClient({ cookies })
export const createApiClient = () => createRouteHandlerClient({ cookies })

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
