import type { CuratorPlatform } from '@/types'

// ─── Reach signal fetchers ───────────────────────────────────────────────
// Graceful no-op pattern (mirrors lib/email/index.ts): return null
// immediately when credentials are unset, and never throw — a single
// curator's fetch failure must not break the weekly cron batch loop (D-04).
//
// Reach signal is nullable/approximate everywhere it's displayed — a
// missing or hidden count must resolve to null, never 0 (RESEARCH Pitfall 5).

// ─── URL parsers ──────────────────────────────────────────────────────────

/** Extracts the playlist ID from a Spotify playlist URL or URI. */
export function extractSpotifyPlaylistId(playlistUrl: string): string | null {
  const trimmed = playlistUrl.trim()
  // https://open.spotify.com/playlist/{id}?si=...
  const urlMatch = trimmed.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/)
  if (urlMatch) return urlMatch[1]
  // spotify:playlist:{id}
  const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]+)$/)
  if (uriMatch) return uriMatch[1]
  return null
}

/** Extracts the @handle from a youtube.com/@handle URL, or the raw channel ID from /channel/UC... */
export function extractYouTubeHandle(channelUrl: string): { handle: string | null; channelId: string | null } {
  const trimmed = channelUrl.trim()
  const channelIdMatch = trimmed.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/)
  if (channelIdMatch) return { handle: null, channelId: channelIdMatch[1] }
  const handleMatch = trimmed.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/)
  if (handleMatch) return { handle: handleMatch[1], channelId: null }
  // Bare "@handle" input
  const bareHandleMatch = trimmed.match(/^@([a-zA-Z0-9_.-]+)$/)
  if (bareHandleMatch) return { handle: bareHandleMatch[1], channelId: null }
  return { handle: null, channelId: null }
}

// ─── Spotify Web API (client-credentials flow) ─────────────────────────

export async function fetchSpotifyFollowers(playlistUrl: string): Promise<number | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null // graceful no-op (D-04, D-23)

  const playlistId = extractSpotifyPlaylistId(playlistUrl)
  if (!playlistId) return null

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    })
    if (!tokenRes.ok) return null
    const tokenJson = (await tokenRes.json()) as { access_token?: string }
    if (!tokenJson.access_token) return null

    const playlistRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?fields=followers.total`,
      { headers: { Authorization: `Bearer ${tokenJson.access_token}` } }
    )
    if (!playlistRes.ok) return null
    const data = (await playlistRes.json()) as { followers?: { total?: number } }
    return typeof data.followers?.total === 'number' ? data.followers.total : null
  } catch {
    return null // never throw — cron loop must keep going for other curators
  }
}

// ─── YouTube Data API v3 ─────────────────────────────────────────────────

export async function fetchYouTubeSubscribers(channelUrl: string): Promise<number | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return null // graceful no-op (D-04, D-23)

  const { handle, channelId } = extractYouTubeHandle(channelUrl)
  if (!handle && !channelId) return null

  try {
    // Handle-based URLs (the common case, youtube.com/@handle) need
    // forHandle=; classic /channel/UC... URLs pass id= instead
    // (RESEARCH Pitfall 5).
    const query = handle
      ? `forHandle=${encodeURIComponent(handle)}`
      : `id=${encodeURIComponent(channelId as string)}`
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&${query}&key=${apiKey}`
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      items?: Array<{
        statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean }
      }>
    }
    const stats = data.items?.[0]?.statistics
    if (!stats || stats.hiddenSubscriberCount) return null // never 0 for hidden counts
    const count = Number(stats.subscriberCount)
    return Number.isFinite(count) && count > 0 ? count : null
  } catch {
    return null
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

/** Routes to the correct fetcher based on curator platform. Returns null for platforms with no reach-signal source. */
export async function fetchReachSignal(
  platform: CuratorPlatform,
  url: string | null
): Promise<number | null> {
  if (!url) return null
  if (platform === 'spotify') return fetchSpotifyFollowers(url)
  if (platform === 'youtube_music') return fetchYouTubeSubscribers(url)
  return null
}
