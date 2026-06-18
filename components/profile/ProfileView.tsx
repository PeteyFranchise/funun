import Link from 'next/link'
import type { ProfileRole, OpenTo } from '@/types'
import { PROFILE_ROLE_LABELS } from '@/types'
import { FollowButton } from './FollowButton'
import { Wall, type WallState } from './Wall'
import { Endorsements, type EndorsementState } from './Endorsements'
import { ReleaseComments, type ReleaseCommentsState } from './ReleaseComments'

export type FollowState = { profileUserId: string; isFollowing: boolean; canFollow: boolean }

// ─── Public showcase profile (full-page, no app shell) ───────────────
// v1 = showcase: banner, header, About, Featured, Releases, sidebar.
// Social layer (follow/DM/wall/comments/endorsements) is deferred (#23)
// and rendered as a disabled stub.

const OPEN_TO_LABELS: Record<OpenTo, string> = {
  collabs: 'Co-writes',
  sync: 'Sync licensing',
  features: 'Features',
  production: 'Production',
  writing: 'Writing',
  management: 'Management',
  booking: 'Booking',
}

export type ProfileRelease = {
  id: string
  title: string
  typeLabel: string
  year: string | null
  score: number
  coverUrl: string | null
}

export type ProfileData = {
  name: string
  handle: string | null
  pronouns: string | null
  verified: boolean
  avatarUrl: string | null
  bannerUrl: string | null
  location: string | null
  since: string | null
  bio: string | null
  roles: ProfileRole[]
  openTo: OpenTo[]
  tags: string[]
  monthlyListeners: number | null
  totalStreams: number | null
  avgReadiness: number | null
  followerCount: number | null
  featured: ProfileRelease | null
  releases: ProfileRelease[]
}

function roleLabel(r: ProfileRole): string {
  return r.kind === 'preset' ? PROFILE_ROLE_LABELS[r.slug] : r.label
}
function initials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}
function fmtNum(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}
function band(score: number): { arc: string; value: string } {
  if (score >= 80) return { arc: '#34D399', value: '#34D399' }
  if (score >= 50) return { arc: '#F59E0B', value: '#F4C77B' }
  return { arc: '#F43F5E', value: '#F43F5E' }
}

function ReleaseCard({ r }: { r: ProfileRelease }) {
  const b = band(r.score)
  return (
    <div className="overflow-hidden rounded-[14px] border border-hair bg-card2">
      <Link href={`/r/${r.id}`} className="relative block h-[120px] bg-gradient-to-br from-brandindigo/40 to-brandfuchsia/30 bg-cover bg-center" style={r.coverUrl ? { backgroundImage: `url('${r.coverUrl}')` } : undefined}>
        <span className="absolute bottom-3 left-3 flex h-[34px] w-[34px] items-center justify-center rounded-full border border-white/20 bg-black/55 backdrop-blur">
          <svg viewBox="0 0 24 24" className="ml-[2px] h-[14px] w-[14px]" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
        </span>
        <span className="absolute -bottom-[18px] right-[14px] flex h-12 w-12 items-center justify-center rounded-full shadow-[0_6px_16px_rgba(0,0,0,.5)]" style={{ background: `conic-gradient(${b.arc} 0 ${r.score}%,rgba(199,203,247,.16) ${r.score}% 100%)` }}>
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#0c0b1a] text-[15px] font-extrabold tnum" style={{ color: b.value }}>{r.score}</span>
        </span>
      </Link>
      <div className="p-4">
        <div className="text-[16px] font-bold text-white">{r.title}</div>
        <div className="mt-[3px] text-[13px] text-lavdim">
          {r.typeLabel}
          {r.year ? ` · ${r.year}` : ''}
        </div>
      </div>
    </div>
  )
}

function Card({ title, children, eyebrow }: { title?: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[18px] border border-hair bg-card p-7">
      {(title || eyebrow) && (
        <div className="mb-[18px] flex items-center justify-between">
          {title && <h2 className="text-[20px] font-extrabold tracking-[-.01em] text-white">{title}</h2>}
          {eyebrow && <span className="text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">{eyebrow}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

export function ProfileView({
  data,
  mode,
  follow,
  wall,
  endorsements,
  comments,
}: {
  data: ProfileData
  mode: 'owner' | 'public'
  follow?: FollowState
  wall?: WallState
  endorsements?: EndorsementState
  comments?: ReleaseCommentsState
}) {
  return (
    <div className="min-h-screen bg-ink text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex items-center gap-6 border-b border-hair bg-ink/70 px-[clamp(24px,4vw,72px)] py-4 backdrop-blur-xl">
        <Link href="/vault" className="leading-none">
          <div className="gtext text-[23px] font-black tracking-[.04em]">FUNŪN</div>
          <div className="mt-[3px] text-[9.5px] font-bold tracking-[.32em] text-lavdim">THE ARTS</div>
        </Link>
        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {['Discover', 'Opportunities', 'Network'].map((l, i) => (
            <span key={l} className={`rounded-[9px] px-[14px] py-[9px] text-[14.5px] font-semibold ${i === 0 ? 'border border-hairstrong bg-card2 text-white' : 'text-lav'}`}>
              {l}
            </span>
          ))}
        </nav>
        <span className="ml-auto flex h-[42px] w-[42px] items-center justify-center rounded-full border border-hairstrong bg-gradient-to-br from-emerald-400 to-emerald-700 text-[15px] font-extrabold">
          {initials(data.name)}
        </span>
      </header>

      <div className="px-[clamp(24px,4vw,72px)] pb-24">
        {/* Banner */}
        <div
          className="relative h-[280px] rounded-b-[24px]"
          style={{
            background: data.bannerUrl
              ? `url('${data.bannerUrl}') center/cover`
              : 'radial-gradient(900px 420px at 16% -40%, rgba(129,140,248,.55), transparent 60%), radial-gradient(760px 420px at 84% 150%, rgba(217,70,239,.5), transparent 60%), linear-gradient(120deg,#1b1740 0%,#120f26 55%,#241338 100%)',
          }}
        />

        {/* Header */}
        <div className="relative z-[5] -mt-[92px] flex flex-wrap items-end gap-7 px-9">
          <div
            className="h-[168px] w-[168px] flex-none rounded-full border-[5px] border-ink bg-gradient-to-br from-brandindigo to-brandfuchsia bg-cover bg-center shadow-[0_20px_50px_-16px_rgba(0,0,0,.7)]"
            style={data.avatarUrl ? { backgroundImage: `url('${data.avatarUrl}')` } : undefined}
          >
            {!data.avatarUrl && <span className="flex h-full w-full items-center justify-center text-[44px] font-black">{initials(data.name)}</span>}
          </div>

          <div className="flex-1 pb-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[40px] font-extrabold tracking-[-.02em]">{data.name}</span>
              {data.verified && (
                <svg viewBox="0 0 24 24" className="h-7 w-7 text-brandindigo" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg>
              )}
              {data.pronouns && <span className="text-[15px] font-medium text-lavdim">{data.pronouns}</span>}
            </div>

            {data.roles.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-[10px]">
                {data.roles.map((r, i) => (
                  <span key={i} className={`rounded-full border px-[14px] py-[7px] text-[15px] font-bold ${i === 0 ? 'border-brandindigo/40 bg-[linear-gradient(105deg,rgba(129,140,248,.22),rgba(217,70,239,.18))] text-white' : 'border-hairstrong bg-card2 text-white'}`}>
                    {roleLabel(r)}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-[14px] flex flex-wrap items-center gap-2 text-[15px] font-medium text-lav">
              {data.location && <span>{data.location}</span>}
              {data.since && (
                <>
                  <span className="text-lavdim">·</span>
                  <span>On Funūn since {data.since}</span>
                </>
              )}
              {data.openTo.length > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-[13px] py-[6px] text-[14px] font-bold text-emerald-400">
                  Open to {OPEN_TO_LABELS[data.openTo[0]].toLowerCase()}
                  {data.openTo.length > 1 ? ' & more' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pb-[10px]">
            {mode === 'owner' ? (
              <>
                <Link href="/settings" className="inline-flex items-center gap-[9px] rounded-[11px] bg-grad px-[22px] py-[13px] text-[15px] font-bold text-white shadow-cta">
                  Edit profile
                </Link>
                <button className="inline-flex items-center gap-[9px] rounded-[11px] border border-hairstrong bg-card px-[22px] py-[13px] text-[15px] font-bold text-white">
                  Share
                </button>
                <button className="rounded-[11px] border border-hairstrong bg-card px-[22px] py-[13px] text-[15px] font-bold text-lavdim" title="Analytics coming soon">
                  Analytics
                </button>
              </>
            ) : (
              <>
                {follow ? (
                  <FollowButton
                    profileUserId={follow.profileUserId}
                    initialFollowing={follow.isFollowing}
                    canFollow={follow.canFollow}
                  />
                ) : (
                  <button className="inline-flex items-center gap-[9px] rounded-[11px] bg-grad px-[22px] py-[13px] text-[15px] font-bold text-white opacity-60 shadow-cta" title="Following coming soon" disabled>
                    Follow
                  </button>
                )}
                <button className="inline-flex items-center gap-[9px] rounded-[11px] border border-hairstrong bg-card px-[22px] py-[13px] text-[15px] font-bold text-white opacity-60" title="Messaging coming soon" disabled>
                  Message
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="mt-9 grid items-start gap-7 lg:grid-cols-[1fr_360px]">
          {/* Main column */}
          <div className="flex flex-col gap-6">
            {data.bio && (
              <Card title="About">
                <p className="text-[16px] leading-[1.62] text-lav">{data.bio}</p>
                {data.tags.length > 0 && (
                  <div className="mt-[18px] flex flex-wrap gap-[9px]">
                    {data.tags.map(t => (
                      <span key={t} className="rounded-full border border-hair bg-card2 px-[13px] py-[7px] text-[13.5px] font-semibold text-lav">{t}</span>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {data.featured && (
              <section>
                <div className="mb-[18px] text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">Featured</div>
                <div className="relative flex items-center gap-[22px] overflow-hidden rounded-[18px] border border-brandindigo/30 bg-[linear-gradient(150deg,#1c1640_0%,#0f0c20_60%)] p-6">
                  <span className="absolute right-[18px] top-[18px] inline-flex items-center gap-[7px] rounded-full bg-grad px-[13px] py-[6px] text-[12px] font-extrabold uppercase tracking-[.08em] text-white">Featured</span>
                  <Link href={`/r/${data.featured.id}`} className="relative h-[140px] w-[140px] flex-none rounded-[14px] bg-gradient-to-br from-brandindigo/40 to-brandfuchsia/30 bg-cover bg-center shadow-[0_16px_40px_-14px_rgba(0,0,0,.7)]" style={data.featured.coverUrl ? { backgroundImage: `url('${data.featured.coverUrl}')` } : undefined}>
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full border border-white/25 bg-black/55 backdrop-blur">
                        <svg viewBox="0 0 24 24" className="ml-[3px] h-[22px] w-[22px]" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                      </span>
                    </span>
                  </Link>
                  <div className="flex-1">
                    <div className="text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">{data.featured.typeLabel}</div>
                    <div className="mt-[6px] text-[30px] font-extrabold tracking-[-.01em]">{data.featured.title}</div>
                    <div className="mt-2 text-[15px] text-lav">Readiness {data.featured.score} · {data.featured.score >= 80 ? 'cleared for sync' : 'in progress'}</div>
                  </div>
                </div>
              </section>
            )}

            <Card title="Releases">
              {data.releases.length === 0 ? (
                <p className="text-[14px] text-lavdim">No public releases yet.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                  {data.releases.map(r => <ReleaseCard key={r.id} r={r} />)}
                </div>
              )}
              {comments && <ReleaseComments state={comments} />}
            </Card>

            {endorsements && <Endorsements state={endorsements} />}
            {wall && <Wall wall={wall} />}

            {/* Follow, Wall, Endorsements & Comments are live; the rest is rolling out. */}
            <div className="rounded-[18px] border border-dashed border-hairstrong bg-card/40 p-5 text-[13px] text-lavdim">
              More network features — activity feed & direct messaging — are rolling out.
            </div>
          </div>

          {/* Sidebar */}
          <aside className="flex flex-col gap-6 lg:sticky lg:top-[88px]">
            <Card title="Stats">
              <Stat k="Followers" v={fmtNum(data.followerCount)} />
              <Stat k="Monthly listeners" v={fmtNum(data.monthlyListeners)} />
              <Stat k="Total streams" v={fmtNum(data.totalStreams)} />
              <Stat k="Releases" v={String(data.releases.length)} />
              <Stat k="Avg. readiness" v={data.avgReadiness != null ? String(data.avgReadiness) : '—'} cls="gtext" last />
            </Card>

            {data.openTo.length > 0 && (
              <Card title="Open to">
                <div className="flex flex-wrap gap-[9px]">
                  {data.openTo.map(o => (
                    <span key={o} className="inline-flex items-center gap-[7px] rounded-full border border-emerald-400/26 bg-emerald-400/10 px-[13px] py-[7px] text-[13.5px] font-semibold text-emerald-400">
                      <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="m20 6-11 11-5-5" /></svg>
                      {OPEN_TO_LABELS[o]}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {data.roles.length > 0 && (
              <Card title="Roles">
                <div className="flex flex-wrap gap-2">
                  {data.roles.map((r, i) => (
                    <span key={i} className="rounded-[10px] border border-hairstrong bg-card2 px-[14px] py-2 text-[14px] font-semibold text-white">{roleLabel(r)}</span>
                  ))}
                  {mode === 'owner' && (
                    <Link href="/settings" className="rounded-[10px] border border-dashed border-hairstrong px-[14px] py-2 text-[14px] font-semibold text-lavdim">+ Add role</Link>
                  )}
                </div>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

function Stat({ k, v, cls, last }: { k: string; v: string; cls?: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-[14px] ${last ? '' : 'border-b border-hair'}`}>
      <span className="text-[14.5px] font-medium text-lav">{k}</span>
      <span className={`tnum text-[24px] font-extrabold tracking-[-.01em] ${cls ?? ''}`}>{v}</span>
    </div>
  )
}
