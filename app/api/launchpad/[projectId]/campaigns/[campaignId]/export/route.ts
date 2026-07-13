import { createApiClient } from '@/lib/supabase/server'
import {
  readPosts,
  PLATFORM_LABELS,
  CONTENT_TYPE_LABELS,
  type Platform,
  type ContentType,
} from '@/lib/launchpad/campaigns'

// Buffer bulk-upload CSV headers — case-sensitive per Buffer's spec (D-15/D-16/D-17)
const BUFFER_CSV_HEADERS = ['Text', 'Image URL', 'Tags', 'Posting Time']

// Reuse lib/metadata/export.ts's csvCell regex escaper verbatim (T-07-14)
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Format posting time as YYYY-MM-DD HH:mm (24h, no timezone suffix).
// NEVER use .toISOString() — Buffer rejects ISO 8601 with T/Z (Pitfall 3, D-15).
function formatBufferPostingTime(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

// Content types where Image URL = project cover_art_url (D-16)
const IMAGE_CONTENT_TYPES: ContentType[] = ['static_image', 'lyric_graphic']

// GET /api/launchpad/[projectId]/campaigns/[campaignId]/export
// Returns a Buffer-compatible CSV with a platform/week subset filter (D-18).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; campaignId: string }> }
) {
  const { projectId, campaignId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // Load campaign scoped by user_id (IDOR guard — T-07-12/T-07-13)
  const { data: campaign } = await supabase
    .from('social_campaigns')
    .select('id, project_id, user_id, posts')
    .eq('id', campaignId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!campaign) return new Response('Campaign not found', { status: 404 })

  // Fetch project for cover_art_url and title slug
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, cover_art_url')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return new Response('Project not found', { status: 404 })

  // D-18 subset filter: parse ?platforms=instagram,tiktok&weeks=1,2 query params
  const url = new URL(request.url)
  const platformsParam = url.searchParams.get('platforms')
  const weeksParam = url.searchParams.get('weeks')

  const selectedPlatforms: Platform[] | null = platformsParam
    ? (platformsParam.split(',').map(s => s.trim()).filter(Boolean) as Platform[])
    : null
  const selectedWeeks: (1 | 2 | 3 | 4)[] | null = weeksParam
    ? (weeksParam
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => [1, 2, 3, 4].includes(n)) as (1 | 2 | 3 | 4)[])
    : null

  let posts = readPosts(campaign.posts)

  // Apply subset filter — excluded slots are filtered out, not blanked (no-empty-rows rule, D-18)
  if (selectedPlatforms && selectedPlatforms.length > 0) {
    posts = posts.filter(p => selectedPlatforms.includes(p.platform))
  }
  if (selectedWeeks && selectedWeeks.length > 0) {
    posts = posts.filter(p => selectedWeeks.includes(p.week))
  }

  // Build CSV rows
  const headerRow = BUFFER_CSV_HEADERS.join(',')
  const dataRows = posts.map(post => {
    // Image URL: cover_art_url only for static_image / lyric_graphic; blank for video/text/stories (D-16)
    const imageUrl = IMAGE_CONTENT_TYPES.includes(post.content_type)
      ? (project.cover_art_url ?? '')
      : ''

    // Tags: "Platform label, content type label" — always derived from slot fields (D-17)
    const platformLabel = PLATFORM_LABELS[post.platform] ?? post.platform
    const contentTypeLabel =
      CONTENT_TYPE_LABELS[post.content_type] ??
      post.content_type.replace(/_/g, ' ')
    const tags = `${platformLabel}, ${contentTypeLabel}`

    // Posting Time: YYYY-MM-DD HH:mm — never .toISOString() (Pitfall 3)
    const postingTime = formatBufferPostingTime(post.posting_time)

    return [post.caption, imageUrl, tags, postingTime].map(csvCell).join(',')
  })

  const csv = [headerRow, ...dataRows].join('\n')

  // Filesystem-safe slug from project title
  const slug =
    project.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() ||
    'campaign'

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-social-calendar.csv"`,
    },
  })
}
