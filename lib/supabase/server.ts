import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
export const createServerClient = () => createServerComponentClient({ cookies })
export const createApiClient = () => createRouteHandlerClient({ cookies })
