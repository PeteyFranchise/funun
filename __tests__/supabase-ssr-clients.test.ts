import { readFileSync } from 'node:fs'
import path from 'node:path'

const mockCreateBrowserClient = jest.fn()
const mockCreateSsrServerClient = jest.fn()
const mockCreateBaseClient = jest.fn()
const mockCookies = jest.fn()

jest.mock('@supabase/ssr', () => ({
  createBrowserClient: (...args: unknown[]) => mockCreateBrowserClient(...args),
  createServerClient: (...args: unknown[]) => mockCreateSsrServerClient(...args),
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateBaseClient(...args),
}))

jest.mock('next/headers', () => ({
  cookies: (...args: unknown[]) => mockCookies(...args),
}))

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('Supabase SSR client boundary', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-service-key'
  })

  it('creates the browser client with public credentials only', async () => {
    const sentinel = { kind: 'browser' }
    mockCreateBrowserClient.mockReturnValue(sentinel)
    const { createClient } = await import('@/lib/supabase/client')

    expect(createClient()).toBe(sentinel)
    expect(mockCreateBrowserClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'public-anon-key'
    )
    expect(mockCreateBrowserClient.mock.calls.flat()).not.toContain('server-service-key')
  })

  it('adapts Next cookies through getAll and setAll for server and API clients', async () => {
    const getAll = jest.fn(() => [{ name: 'sb-session', value: 'old' }])
    const set = jest.fn()
    mockCookies.mockResolvedValue({ getAll, set })
    mockCreateSsrServerClient.mockImplementation(
      (_url: string, _key: string, options: unknown) => options
    )
    const { createApiClient, createServerClient } = await import('@/lib/supabase/server')

    const apiOptions = (await createApiClient()) as unknown as {
      cookies: {
        getAll: () => { name: string; value: string }[]
        setAll: (
          values: { name: string; value: string; options: { path: string } }[]
        ) => void
      }
    }
    expect(apiOptions.cookies.getAll()).toEqual([{ name: 'sb-session', value: 'old' }])
    apiOptions.cookies.setAll([
      { name: 'sb-session', value: 'new', options: { path: '/' } },
    ])
    expect(set).toHaveBeenCalledWith('sb-session', 'new', { path: '/' })

    await createServerClient()
    expect(mockCreateSsrServerClient).toHaveBeenCalledTimes(2)
    expect(mockCreateSsrServerClient).toHaveBeenLastCalledWith(
      'https://project.supabase.co',
      'public-anon-key',
      expect.objectContaining({ cookies: expect.any(Object) })
    )
  })

  it('keeps service-role credentials in the non-persistent base client', async () => {
    const sentinel = { kind: 'service' }
    mockCreateBaseClient.mockReturnValue(sentinel)
    const { createServiceClient } = await import('@/lib/supabase/server')

    expect(createServiceClient()).toBe(sentinel)
    expect(mockCreateBaseClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'server-service-key',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  })

  it('keeps middleware refresh cookies on pass-through and early responses', () => {
    const middleware = source('middleware.ts')

    expect(middleware).toContain("from '@supabase/ssr'")
    expect(middleware).toContain('getAll: () => req.cookies.getAll()')
    expect(middleware).toContain('req.cookies.set(name, value)')
    expect(middleware).toContain('res.cookies.set(name, value, options)')
    expect(middleware).toContain('Object.entries(headers)')
    expect(middleware).toContain('respondWithAuthState(NextResponse.redirect(url))')
    expect(middleware).toContain('respondWithAuthState(')
    expect(middleware.indexOf('req.cookies.set(name, value)')).toBeLessThan(
      middleware.indexOf('res.cookies.set(name, value, options)')
    )
  })

  it('removes the deprecated helper and pins the Node 20-compatible pair', () => {
    const packageJson = JSON.parse(source('package.json')) as {
      dependencies: Record<string, string>
    }

    expect(packageJson.dependencies['@supabase/ssr']).toBe('0.10.0')
    expect(packageJson.dependencies['@supabase/supabase-js']).toBe('2.109.0')
    expect(packageJson.dependencies['@supabase/auth-helpers-nextjs']).toBeUndefined()
    expect(source('lib/supabase/client.ts')).not.toContain('@supabase/auth-helpers-nextjs')
    expect(source('lib/supabase/server.ts')).not.toContain('@supabase/auth-helpers-nextjs')
    expect(middlewareSource()).not.toContain('@supabase/auth-helpers-nextjs')
  })
})

function middlewareSource(): string {
  return source('middleware.ts')
}
