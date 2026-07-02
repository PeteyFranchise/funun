'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CuratorCard } from './CuratorCard'
import { PLATFORM_VALUES, PLATFORM_LABELS } from '@/lib/curators/schema'
import type { DirectoryCurator } from '@/lib/curators/response-rate'

// ─── CuratorDirectory ─────────────────────────────────────────────────
// Client filter bar + grid for /curators. Filters update the URL
// searchParams (server component re-fetch), never client-side array
// filtering — same pattern as the launchpad global page's server-first
// data flow (D-06/PITCH-01).

const ACTIVE_CHIP = 'border-brandindigo/40 bg-brandindigo/10 text-brandindigo'
const INACTIVE_CHIP = 'border-hair bg-card2 text-lav hover:border-hairstrong'

type Props = {
  initialCurators: DirectoryCurator[]
}

export function CuratorDirectory({ initialCurators }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeGenres = useMemo(() => new Set(searchParams.getAll('genre')), [searchParams])
  const activePlatforms = useMemo(() => new Set(searchParams.getAll('platform')), [searchParams])

  const allGenres = useMemo(() => {
    const set = new Set<string>()
    for (const curator of initialCurators) {
      for (const genre of curator.genre_focus ?? []) set.add(genre)
    }
    return Array.from(set).sort()
  }, [initialCurators])

  function toggleParam(key: 'genre' | 'platform', value: string) {
    const params = new URLSearchParams(searchParams.toString())
    const current = params.getAll(key)
    params.delete(key)
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
    for (const v of next) params.append(key, v)
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        {allGenres.length > 0 && (
          <div>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">Genre</p>
            <div className="flex flex-wrap gap-2">
              {allGenres.map(genre => {
                const isActive = activeGenres.has(genre)
                return (
                  <button
                    key={genre}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => toggleParam('genre', genre)}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${isActive ? ACTIVE_CHIP : INACTIVE_CHIP}`}
                  >
                    {genre}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">Platform</p>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_VALUES.map(platform => {
              const isActive = activePlatforms.has(platform)
              return (
                <button
                  key={platform}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => toggleParam('platform', platform)}
                  className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${isActive ? ACTIVE_CHIP : INACTIVE_CHIP}`}
                >
                  {PLATFORM_LABELS[platform]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {initialCurators.length === 0 ? (
        <div className="rounded-[18px] border border-hair bg-card px-6 py-10 text-center">
          <p className="text-[15px] font-bold text-white">No curators in the directory yet</p>
          <p className="mt-1.5 text-[13px] text-lavdim">
            Funūn&apos;s team is building the curator directory. Check back soon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {initialCurators.map(curator => (
            <CuratorCard key={curator.id} curator={curator} selectable={false} />
          ))}
        </div>
      )}
    </div>
  )
}
