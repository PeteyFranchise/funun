export type PlaybookVideoProvider = 'youtube' | 'vimeo' | 'loom' | 'funun'

export type PlaybookVideoConfig = {
  url: string
  title: string
  caption?: string
  transcript?: string
  provider: PlaybookVideoProvider
  embedUrl: string
}

const INTERNAL_MEDIA_PATH = /^\/api\/admin\/playbook\/media\/[0-9a-f-]{36}\/stream$/i

function youtubeId(url: URL): string | null {
  if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
    if (url.pathname === '/watch') return url.searchParams.get('v')
    const match = url.pathname.match(/^\/(?:embed|shorts)\/([^/?]+)/)
    return match?.[1] ?? null
  }
  return null
}

function safeMediaUrl(raw: string): Pick<PlaybookVideoConfig, 'provider' | 'embedUrl'> | null {
  if (INTERNAL_MEDIA_PATH.test(raw)) return { provider: 'funun', embedUrl: raw }
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'https:') return null

  const ytId = youtubeId(url)
  if (ytId && /^[A-Za-z0-9_-]{6,20}$/.test(ytId)) {
    return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}` }
  }
  const vimeo = url.hostname === 'vimeo.com' || url.hostname === 'www.vimeo.com'
    ? url.pathname.match(/^\/(\d+)\/?$/)?.[1]
    : null
  if (vimeo) return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vimeo}` }
  const loom = ['loom.com', 'www.loom.com'].includes(url.hostname)
    ? url.pathname.match(/^\/share\/([A-Za-z0-9]+)\/?$/)?.[1]
    : null
  if (loom) return { provider: 'loom', embedUrl: `https://www.loom.com/embed/${loom}` }
  return null
}

export function parsePlaybookVideoBlock(source: string): PlaybookVideoConfig | null {
  const fields = new Map<string, string>()
  let activeKey: string | null = null
  for (const rawLine of source.replace(/\r/g, '').split('\n')) {
    const match = rawLine.match(/^([a-zA-Z][a-zA-Z_-]*):\s*(.*)$/)
    if (match) {
      activeKey = match[1].toLowerCase()
      fields.set(activeKey, match[2].trim())
    } else if (activeKey && rawLine.trim()) {
      fields.set(activeKey, `${fields.get(activeKey) ?? ''}\n${rawLine.trim()}`.trim())
    }
  }
  const rawUrl = fields.get('url') ?? ''
  const title = fields.get('title')?.trim() ?? ''
  const safe = safeMediaUrl(rawUrl)
  if (!safe || !title || title.length > 180) return null
  const caption = fields.get('caption')?.trim().slice(0, 1000)
  const transcript = fields.get('transcript')?.trim().slice(0, 50_000)
  return { url: rawUrl, title, caption: caption || undefined, transcript: transcript || undefined, ...safe }
}

export function playbookVideoSnippet(): string {
  return '```video\nurl: https://www.youtube.com/watch?v=VIDEO_ID\ntitle: Training video title\ncaption: What this video covers.\ntranscript: Add an accessible transcript here.\n```\n\n'
}
