'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TOOLS,
  type ToolSlug,
  type EpkOutput,
  type DropReadyOutput,
  type SoundBaitOutput,
  type DistroAdvisorOutput,
  type RoyaltyAuditOutput,
  type SpotifyPitchOutput,
} from '@/lib/tools/registry'
import { SaveToCalendarPicker } from '@/components/launchpad/SaveToCalendarPicker'
import type { SocialCampaign } from '@/lib/launchpad/campaigns'

type Output = {
  id: string
  tool_slug: string
  title?: string | null
  output?: Record<string, unknown>
}

function isEpk(o: Record<string, unknown> | undefined): o is EpkOutput & Record<string, unknown> {
  return !!o && typeof o.bio_short === 'string'
}

function isDropReady(
  o: Record<string, unknown> | undefined
): o is DropReadyOutput & Record<string, unknown> {
  return !!o && typeof o.instagram_caption === 'string'
}

function isSoundBait(
  o: Record<string, unknown> | undefined
): o is SoundBaitOutput & Record<string, unknown> {
  return !!o && Array.isArray(o.hooks) && Array.isArray(o.video_concepts)
}

function isDistroAdvisor(
  o: Record<string, unknown> | undefined
): o is DistroAdvisorOutput & Record<string, unknown> {
  return !!o && Array.isArray(o.metadata_review) && typeof o.release_timing === 'string'
}

function isRoyaltyAudit(
  o: Record<string, unknown> | undefined
): o is RoyaltyAuditOutput & Record<string, unknown> {
  return !!o && typeof o.pro_recommendation === 'string' && Array.isArray(o.royalty_types)
}

function isSpotifyPitch(
  o: Record<string, unknown> | undefined
): o is SpotifyPitchOutput & Record<string, unknown> {
  return !!o && typeof o.pitch === 'string' && Array.isArray(o.genres)
}

// Standalone DropReady / SoundBait outputs can be saved into a campaign slot
// (D-11). Pick the single most caption-like string as the default to save —
// DropReady's Instagram caption, or SoundBait's first hook.
function saveableCaption(o: Record<string, unknown> | undefined): string | null {
  if (isDropReady(o)) return o.instagram_caption
  if (isSoundBait(o)) return o.hooks?.[0] ?? null
  return null
}

function EpkCard({ data }: { data: EpkOutput }) {
  return (
    <div className="space-y-4 text-sm">
      <Field label="Pull quote">
        <p className="text-base font-medium italic text-white/90">“{data.pull_quote}”</p>
      </Field>
      <Field label="Short bio">
        <p className="text-white/70">{data.bio_short}</p>
      </Field>
      <Field label="Full bio">
        {data.bio_long.split('\n').filter(Boolean).map((p, i) => (
          <p key={i} className="text-white/70">
            {p}
          </p>
        ))}
      </Field>
      <Field label="About this release">
        <p className="text-white/70">{data.project_blurb}</p>
      </Field>
      <Field label="Key facts">
        <ul className="list-inside list-disc space-y-1 text-white/70">
          {data.key_facts?.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </Field>
      <Field label="Pitch angles">
        <ul className="list-inside list-disc space-y-1 text-white/70">
          {data.pitch_angles?.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </Field>
    </div>
  )
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  return (
    <Field label={label}>
      <p className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.02] p-3 text-white/70">
        {text}
      </p>
    </Field>
  )
}

function DropReadyCard({ data }: { data: DropReadyOutput }) {
  return (
    <div className="space-y-4 text-sm">
      <CopyBlock label="Instagram caption" text={data.instagram_caption} />
      <CopyBlock label="TikTok caption" text={data.tiktok_caption} />
      <CopyBlock label="X / Twitter post" text={data.twitter_post} />
      <CopyBlock label="Short announcement" text={data.short_announcement} />
      <Field label="Hashtags">
        <div className="flex flex-wrap gap-1.5">
          {data.hashtags?.map((h, i) => (
            <span
              key={i}
              className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/60"
            >
              #{h.replace(/^#/, '')}
            </span>
          ))}
        </div>
      </Field>
      <Field label="Posting tips">
        <ul className="list-inside list-disc space-y-1 text-white/70">
          {data.posting_tips?.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </Field>
    </div>
  )
}

function BulletList({ label, items }: { label: string; items?: string[] }) {
  return (
    <Field label={label}>
      <ul className="list-inside list-disc space-y-1 text-white/70">
        {items?.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </Field>
  )
}

function TagRow({ label, items }: { label: string; items?: string[] }) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5">
        {items?.map((h, i) => (
          <span
            key={i}
            className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/60"
          >
            #{h.replace(/^#/, '')}
          </span>
        ))}
      </div>
    </Field>
  )
}

function SoundBaitCard({ data }: { data: SoundBaitOutput }) {
  return (
    <div className="space-y-4 text-sm">
      <BulletList label="Hooks" items={data.hooks} />
      <BulletList label="Video concepts" items={data.video_concepts} />
      <BulletList label="Posting plan" items={data.posting_plan} />
      <BulletList label="Sound tips" items={data.sound_tips} />
      <BulletList label="Caption templates" items={data.caption_templates} />
      <TagRow label="Hashtags" items={data.hashtags} />
    </div>
  )
}

function DistroAdvisorCard({ data }: { data: DistroAdvisorOutput }) {
  return (
    <div className="space-y-4 text-sm">
      <Field label="Metadata review">
        <ul className="space-y-2 text-white/70">
          {data.metadata_review?.map((m, i) => (
            <li key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <p className="font-medium text-white/90">{m.field}</p>
              <p className="mt-0.5 text-white/60">{m.recommendation}</p>
            </li>
          ))}
        </ul>
      </Field>
      <CopyBlock label="Release timing" text={data.release_timing} />
      <BulletList label="Platform priorities" items={data.platform_priorities} />
      <BulletList label="Pre-save strategy" items={data.pre_save_strategy} />
      <BulletList label="Common pitfalls" items={data.common_pitfalls} />
      <BulletList label="Submission checklist" items={data.submission_checklist} />
    </div>
  )
}

function RoyaltyAuditCard({ data }: { data: RoyaltyAuditOutput }) {
  return (
    <div className="space-y-4 text-sm">
      <CopyBlock label="PRO recommendation" text={data.pro_recommendation} />
      <BulletList label="Registration steps" items={data.registration_steps} />
      <Field label="Royalty types">
        <ul className="space-y-2 text-white/70">
          {data.royalty_types?.map((r, i) => (
            <li key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <p className="font-medium text-white/90">{r.type}</p>
              <p className="mt-0.5 text-white/60">{r.description}</p>
            </li>
          ))}
        </ul>
      </Field>
      <BulletList label="Split sheet guidance" items={data.split_sheet_guidance} />
      <BulletList label="Collection setup" items={data.collection_setup} />
      <BulletList label="Action items" items={data.action_items} />
    </div>
  )
}

function SpotifyPitchCard({ data }: { data: SpotifyPitchOutput }) {
  const tags = (items?: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {items?.map((t, i) => (
        <span key={i} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/60">
          {t}
        </span>
      ))}
    </div>
  )
  return (
    <div className="space-y-4 text-sm">
      <CopyBlock label="Editorial pitch — paste into Spotify for Artists" text={data.pitch} />
      <Field label="Hook">
        <p className="italic text-white/80">{data.hook}</p>
      </Field>
      <Field label="Genres to tag">{tags(data.genres)}</Field>
      <Field label="Moods">{tags(data.moods)}</Field>
      <Field label="Instruments / sounds">{tags(data.instruments)}</Field>
      <BulletList label="Submission tips" items={data.submission_tips} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-white/40">{label}</p>
      {children}
    </div>
  )
}

export function ToolsPanel({ projectId, outputs }: { projectId: string; outputs: Output[] }) {
  const router = useRouter()
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Active campaign for the "Save to calendar" affordance (D-11). Fetched
  // client-side so this standalone tools surface needs no server-page changes;
  // stays null (affordance hidden) when the project has no active campaign.
  const [activeCampaign, setActiveCampaign] = useState<SocialCampaign | null>(null)
  const [pickerCaption, setPickerCaption] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadActiveCampaign() {
      try {
        const res = await fetch(`/api/launchpad/${projectId}/campaigns`)
        if (!res.ok) return
        const json = await res.json().catch(() => ({}))
        const campaigns: SocialCampaign[] = (json.data as SocialCampaign[]) ?? []
        if (!cancelled) setActiveCampaign(campaigns.find(c => c.is_active) ?? null)
      } catch {
        // No campaign context — the Save-to-calendar button stays hidden.
      }
    }
    void loadActiveCampaign()
    return () => {
      cancelled = true
    }
  }, [projectId])

  // Persist a standalone tool output into a chosen slot's caption via the same
  // slot-PATCH path the calendar uses. Never touches tool_outputs history (D-11).
  async function saveToSlot(slotId: string, caption: string) {
    if (!activeCampaign) return
    await fetch(
      `/api/launchpad/${projectId}/campaigns/${activeCampaign.id}/slots/${slotId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption }),
      }
    )
  }

  const canSaveToCalendar = Boolean(activeCampaign && activeCampaign.posts.length > 0)

  const outputBySlug = new Map(outputs.map(o => [o.tool_slug, o]))

  async function run(slug: ToolSlug) {
    setRunning(slug)
    setError(null)
    const res = await fetch(`/api/tools/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Tool run failed')
      setRunning(null)
      return
    }
    setRunning(null)
    router.refresh()
  }

  return (
    <section>
      <p className="text-sm text-white/50">
        Generate launch-ready assets from your project and profile.
      </p>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TOOLS.map(tool => {
          const existing = outputBySlug.get(tool.slug)
          return (
            <div
              key={tool.slug}
              className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">{tool.name}</p>
                  <p className="text-xs text-white/40">{tool.tagline}</p>
                </div>
                {existing && (
                  <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">
                    Done
                  </span>
                )}
              </div>
              <p className="mt-2 flex-1 text-sm text-white/60">{tool.description}</p>
              <div className="mt-3">
                {tool.available ? (
                  <button
                    onClick={() => run(tool.slug)}
                    disabled={running !== null}
                    className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
                  >
                    {running === tool.slug
                      ? 'Generating…'
                      : existing
                        ? 'Regenerate'
                        : 'Run'}
                  </button>
                ) : (
                  <span className="text-xs text-white/30">Coming soon</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {outputs.length > 0 && (
        <div className="mt-6 space-y-4">
          {outputs.map(o => {
            const saveCaption = saveableCaption(o.output)
            return (
              <div key={o.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{o.title ?? o.tool_slug}</p>
                  {canSaveToCalendar && saveCaption && (
                    <button
                      type="button"
                      onClick={() => setPickerCaption(saveCaption)}
                      className="shrink-0 rounded-lg border border-brandindigo/40 bg-brandindigo/10 px-3 py-1.5 text-xs font-semibold text-brandindigo transition hover:bg-brandindigo/20"
                    >
                      Save to calendar
                    </button>
                  )}
                </div>
                {isEpk(o.output) ? (
                  <EpkCard data={o.output} />
                ) : isDropReady(o.output) ? (
                  <DropReadyCard data={o.output} />
                ) : isSoundBait(o.output) ? (
                  <SoundBaitCard data={o.output} />
                ) : isDistroAdvisor(o.output) ? (
                  <DistroAdvisorCard data={o.output} />
                ) : isRoyaltyAudit(o.output) ? (
                  <RoyaltyAuditCard data={o.output} />
                ) : isSpotifyPitch(o.output) ? (
                  <SpotifyPitchCard data={o.output} />
                ) : (
                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-white/60">
                    {JSON.stringify(o.output, null, 2)}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* D-11 standalone save — writes a tool output into a chosen campaign slot */}
      <SaveToCalendarPicker
        open={pickerCaption !== null}
        toolOutput={pickerCaption ?? ''}
        posts={activeCampaign?.posts ?? []}
        onClose={() => setPickerCaption(null)}
        onSave={saveToSlot}
      />
    </section>
  )
}
