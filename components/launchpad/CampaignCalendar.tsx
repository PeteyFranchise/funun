'use client'

import { useState } from 'react'
import { PlatformSelector } from './PlatformSelector'
import { CampaignSlot } from './CampaignSlot'
import type { SocialCampaign, SocialPost, Platform } from '@/lib/launchpad/campaigns'
import { PLATFORM_VALUES, PLATFORM_LABELS } from '@/lib/launchpad/campaigns'

// ─── CampaignCalendar ─────────────────────────────────────────────────────────
// Week-grouped social campaign calendar. Modeled on LaunchpadRoom.tsx for the
// optimistic-update + re-fetch-on-failure rollback pattern (WR-02), and on
// ChecklistSection.tsx for week-header markup.
//
// Owns the active campaign state, platform selection, generation CTA, all three
// slot callbacks (caption edit, posting-time override, completion toggle), and
// the Buffer CSV export sub-block (D-18, SOCIAL-07).
//
// SlotGeneratePanel seam: onOpenGenerate is exposed as a callback prop so that
// 07-06 can wire in SlotGeneratePanel without touching this file. If no prop is
// provided, a local state placeholder records the post — the panel itself is
// connected in 07-06.

const WEEK_LABELS: Record<1 | 2 | 3 | 4, { header: string; subLabel: string }> = {
  1: { header: 'Week 1', subLabel: 'Release week' },
  2: { header: 'Week 2', subLabel: 'Post-release week 2' },
  3: { header: 'Week 3', subLabel: 'Post-release week 3' },
  4: { header: 'Week 4', subLabel: 'Post-release week 4' },
}

const WEEK_NUMBERS: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4]

export function CampaignCalendar({
  projectId,
  initialCampaign,
  profileGenres,
  projectGenre,
  // 07-06 wires this prop to open SlotGeneratePanel
  onOpenGenerate: onOpenGenerateProp,
}: {
  projectId: string
  initialCampaign: SocialCampaign | null
  profileGenres: string[] | null
  projectGenre: string | null
  onOpenGenerate?: (post: SocialPost) => void
}) {
  const [campaign, setCampaign] = useState<SocialCampaign | null>(initialCampaign)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(
    initialCampaign?.platforms ?? []
  )
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Local generate panel seam (07-06 connects SlotGeneratePanel here) ───────
  // If the parent provides onOpenGenerate, use it; otherwise track locally.
  // 07-06: replace the local state seam below with a real panel component.
  const [_generatePost, setGeneratePost] = useState<SocialPost | null>(null)

  function handleOpenGenerate(post: SocialPost) {
    if (onOpenGenerateProp) {
      onOpenGenerateProp(post)
    } else {
      // Local placeholder — 07-06 will remove this branch and wire the panel
      setGeneratePost(post)
    }
  }

  // ── Generate calendar ────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (selectedPlatforms.length === 0 || generating) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch(`/api/launchpad/${projectId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: selectedPlatforms }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setGenerateError("Couldn't generate your calendar — please try again.")
        return
      }
      const generated = json.data?.campaign ?? json.campaign ?? null
      if (generated) {
        setCampaign(generated as SocialCampaign)
        setSelectedPlatforms((generated as SocialCampaign).platforms ?? selectedPlatforms)
      }
    } catch {
      setGenerateError("Couldn't generate your calendar — please try again.")
    } finally {
      setGenerating(false)
    }
  }

  // ── Re-fetch authoritative state (WR-02 — never blind-revert) ───────────────
  async function refetchCampaign() {
    try {
      const res = await fetch(`/api/launchpad/${projectId}/campaigns`)
      if (!res.ok) return
      const json = await res.json().catch(() => ({}))
      const campaigns: SocialCampaign[] = json.data?.campaigns ?? json.campaigns ?? []
      const active = campaigns.find(c => c.is_active) ?? campaigns[0] ?? null
      setCampaign(active)
    } catch {
      // Refetch failed — leave the optimistic state; error is already surfaced
    }
  }

  // ── onToggleComplete ─────────────────────────────────────────────────────────
  async function onToggleComplete(id: string, completed: boolean) {
    if (!campaign) return
    // Optimistic update
    setCampaign(prev =>
      prev
        ? { ...prev, posts: prev.posts.map(p => (p.id === id ? { ...p, completed } : p)) }
        : prev
    )
    setSaveError(null)
    try {
      const res = await fetch(
        `/api/launchpad/${projectId}/campaigns/${campaign.id}/slots/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed }),
        }
      )
      if (!res.ok) {
        // Re-fetch authoritative state on failure (LaunchpadRoom WR-02 pattern)
        await refetchCampaign()
        setSaveError("Couldn't save your progress — please try again.")
      }
    } catch {
      await refetchCampaign()
      setSaveError("Couldn't save your progress — please try again.")
    }
  }

  // ── onEditCaption ────────────────────────────────────────────────────────────
  async function onEditCaption(id: string, caption: string) {
    if (!campaign) return
    // Optimistic update
    setCampaign(prev =>
      prev
        ? { ...prev, posts: prev.posts.map(p => (p.id === id ? { ...p, caption } : p)) }
        : prev
    )
    setSaveError(null)
    try {
      const res = await fetch(
        `/api/launchpad/${projectId}/campaigns/${campaign.id}/slots/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caption }),
        }
      )
      if (!res.ok) {
        await refetchCampaign()
        setSaveError("Couldn't save your progress — please try again.")
      }
    } catch {
      await refetchCampaign()
      setSaveError("Couldn't save your progress — please try again.")
    }
  }

  // ── onEditPostingTime ────────────────────────────────────────────────────────
  async function onEditPostingTime(id: string, iso: string) {
    if (!campaign) return
    // Optimistic update
    setCampaign(prev =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map(p => (p.id === id ? { ...p, posting_time: iso } : p)),
          }
        : prev
    )
    setSaveError(null)
    try {
      const res = await fetch(
        `/api/launchpad/${projectId}/campaigns/${campaign.id}/slots/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ posting_time: iso }),
        }
      )
      if (!res.ok) {
        await refetchCampaign()
        setSaveError("Couldn't save your progress — please try again.")
      }
    } catch {
      await refetchCampaign()
      setSaveError("Couldn't save your progress — please try again.")
    }
  }

  // ── Export state ─────────────────────────────────────────────────────────────
  const campaignPlatforms = campaign
    ? ([...new Set(campaign.posts.map(p => p.platform))] as Platform[])
    : []
  const [exportPlatforms, setExportPlatforms] = useState<Platform[]>(campaignPlatforms)
  const [exportWeeks, setExportWeeks] = useState<(1 | 2 | 3 | 4)[]>([1, 2, 3, 4])

  // Sync export defaults when campaign loads
  // (React setState in render is avoided — we derive these in the export block)
  const effectiveCampaignPlatforms = campaign
    ? ([...new Set(campaign.posts.map(p => p.platform))] as Platform[])
    : []

  // Build export URL
  function buildExportUrl(): string {
    const platforms = exportPlatforms.length > 0 ? exportPlatforms : effectiveCampaignPlatforms
    const weeks = exportWeeks.length > 0 ? exportWeeks : [1, 2, 3, 4]
    const params = new URLSearchParams({
      platforms: platforms.join(','),
      weeks: weeks.join(','),
    })
    return `/api/launchpad/${projectId}/campaigns/${campaign?.id}/export?${params.toString()}`
  }

  const exportDisabled = exportPlatforms.length === 0 || exportWeeks.length === 0

  // ── Render ───────────────────────────────────────────────────────────────────
  const hasCampaign = campaign && campaign.posts.length > 0

  return (
    <div>
      {/* Platform selector + generate CTA */}
      <PlatformSelector
        selected={selectedPlatforms}
        onChange={setSelectedPlatforms}
        profileGenres={profileGenres}
        projectGenre={projectGenre}
        onGenerate={handleGenerate}
        generating={generating}
      />

      {/* Generate error */}
      {generateError && (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-300">
          {generateError}
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-300">
          {saveError}
        </div>
      )}

      {/* Empty state — verbatim LaunchpadRoom empty-state card treatment */}
      {!hasCampaign && (
        <div className="mt-6 rounded-[14px] border border-hair bg-card px-[18px] py-10 text-center">
          <p className="text-[15px] font-bold text-white">No campaign yet</p>
          <p className="mt-2 text-[13px] text-lavdim">
            Select the platforms you&apos;re active on above, then generate a 4-week content
            calendar tailored to this release.
          </p>
        </div>
      )}

      {/* Week-grouped calendar grid */}
      {hasCampaign && (
        <>
          <div className="mt-6 space-y-9">
            {WEEK_NUMBERS.map(week => {
              const weekPosts = campaign.posts.filter(p => p.week === week)
              if (weekPosts.length === 0) return null
              const { header, subLabel } = WEEK_LABELS[week]
              return (
                <section key={week}>
                  {/* ChecklistSection-style header */}
                  <div className="mb-3">
                    <h2 className="text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">
                      {header}
                    </h2>
                    <p className="mt-1 text-[13px] text-lavdim">{subLabel}</p>
                  </div>

                  {/* Slot grid */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {weekPosts.map(post => (
                      <CampaignSlot
                        key={post.id}
                        post={post}
                        onEditCaption={onEditCaption}
                        onEditPostingTime={onEditPostingTime}
                        onToggleComplete={onToggleComplete}
                        onOpenGenerate={handleOpenGenerate}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>

          {/* ── Export to Buffer sub-block (D-18, SOCIAL-07) ──────────────── */}
          <div className="mt-9 rounded-[18px] border border-hair bg-card p-5">
            <h2 className="text-[15px] font-bold text-white">Export to Buffer</h2>

            {/* Platform subset selector */}
            <div className="mt-4">
              <p className="mb-2 text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">
                Platforms
              </p>
              <div className="flex flex-wrap gap-2">
                {effectiveCampaignPlatforms.map(platform => {
                  const isSelected =
                    exportPlatforms.length > 0
                      ? exportPlatforms.includes(platform)
                      : true
                  // Initialize exportPlatforms lazily from campaign on first render
                  // by treating empty exportPlatforms as "all selected"
                  return (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => {
                        const current =
                          exportPlatforms.length > 0
                            ? exportPlatforms
                            : effectiveCampaignPlatforms
                        const next = current.includes(platform)
                          ? current.filter(p => p !== platform)
                          : [...current, platform]
                        setExportPlatforms(next)
                      }}
                      className={[
                        'rounded-full border px-3 py-1.5 text-[12.5px] transition',
                        isSelected
                          ? 'border-brandindigo/50 bg-brandindigo/10 text-white'
                          : 'border-hair bg-card2 text-lav',
                      ].join(' ')}
                    >
                      {PLATFORM_LABELS[platform]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Week subset selector */}
            <div className="mt-4">
              <p className="mb-2 text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">
                Weeks
              </p>
              <div className="flex flex-wrap gap-2">
                {WEEK_NUMBERS.map(week => {
                  const isSelected = exportWeeks.includes(week)
                  return (
                    <button
                      key={week}
                      type="button"
                      onClick={() => {
                        const next = exportWeeks.includes(week)
                          ? exportWeeks.filter(w => w !== week)
                          : [...exportWeeks, week]
                        setExportWeeks(next)
                      }}
                      className={[
                        'rounded-full border px-3 py-1.5 text-[12.5px] transition',
                        isSelected
                          ? 'border-brandindigo/50 bg-brandindigo/10 text-white'
                          : 'border-hair bg-card2 text-lav',
                      ].join(' ')}
                    >
                      Week {week}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Buffer free-plan notice */}
            <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-300">
              Buffer&apos;s free plan allows 10 rows per CSV upload. Export a smaller platform or
              week selection if you&apos;re on the free plan.
            </div>

            {/* Export button — solid white (TipPanel footer CTA treatment) */}
            <div className="mt-4">
              <a
                href={exportDisabled ? undefined : buildExportUrl()}
                aria-disabled={exportDisabled}
                title={
                  exportDisabled
                    ? 'Select at least one platform and week to export.'
                    : undefined
                }
                onClick={e => {
                  if (exportDisabled) e.preventDefault()
                }}
                className={[
                  'inline-block rounded-lg bg-white px-4 py-2.5 text-center text-sm font-bold text-black transition hover:bg-white/90',
                  exportDisabled ? 'cursor-not-allowed opacity-40' : '',
                ].join(' ')}
              >
                Export CSV
              </a>
            </div>

            {/* Buffer tags caveat small print */}
            <p className="mt-3 text-[12px] text-lavdim">
              Tags will only attach in Buffer if they already exist in your workspace — otherwise
              they&apos;re safely ignored.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
