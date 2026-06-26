// ─── Launchpad — the launch playbook ─────────────────────────────────
// The marketing/promo tasks around a release, grouped by phase. This is the
// in-app, navigable version of docs/release-journey.md's marketing sections —
// the "Launch Readiness" companion to Release Readiness. Pure data; the room
// renders it. `status` reflects what Funūn actually supports today, so the room
// never over-promises. Per-release campaign tracking comes in a later increment.

export type PlaybookStatus = 'built' | 'partial' | 'planned'
export type LaunchPhaseKey = 'pre' | 'week' | 'post'

export type PlaybookTask = {
  key: string
  label: string
  why: string
  status: PlaybookStatus
  /** Internal route to act on it now, or null if not yet actionable. */
  href: string | null
  /** Where the link goes (button label). */
  via?: string
}

export const LAUNCH_PHASES: { key: LaunchPhaseKey; title: string; blurb: string }[] = [
  { key: 'pre', title: 'Pre-release', blurb: 'Set the stage weeks ahead — assets, pitches, and pre-save.' },
  { key: 'week', title: 'Release week', blurb: 'Go live and convert the momentum you built.' },
  { key: 'post', title: 'Post-release', blurb: 'Keep the song working — playlists, ads, and audience.' },
]

export const PLAYBOOK: Record<LaunchPhaseKey, PlaybookTask[]> = {
  pre: [
    { key: 'epk', label: 'Press kit (EPK)', why: 'A press-ready bio + pitch angles (EPK.fyi tool).', status: 'built', href: '/vault', via: 'Sound Vault' },
    { key: 'captions', label: 'Announcement captions', why: 'Platform-ready reveal copy (DropReady tool).', status: 'built', href: '/vault', via: 'Sound Vault' },
    { key: 'tiktok', label: 'Short-form / TikTok plan', why: 'Hooks + a posting plan to seed the song (SoundBait tool).', status: 'built', href: '/vault', via: 'Sound Vault' },
    { key: 'distributor', label: 'Choose a distributor', why: 'Pick where the release uploads, in Release readiness.', status: 'built', href: '/vault', via: 'Sound Vault' },
    { key: 'social_assets', label: 'Social banners & posts', why: 'AI caption copy today; on-brand banner art is coming.', status: 'partial', href: '/vault', via: 'Sound Vault' },
    { key: 'sync', label: 'Submit to sync agents', why: 'TV / film / ad placements via opportunities.', status: 'partial', href: '/antenna', via: 'Antenna' },
    { key: 'press', label: 'Press / blog outreach', why: 'Reviews and features build credibility.', status: 'partial', href: '/tools/pitchplug', via: 'PitchPlug' },
    { key: 'presave', label: 'Pre-save campaign', why: 'Early saves train the algorithm before day one.', status: 'planned', href: null },
    { key: 'spotify_pitch', label: 'Pitch Spotify editorial', why: 'Draft a ready-to-paste pitch (SpotPitch tool); submit 4+ weeks ahead.', status: 'built', href: '/vault', via: 'Sound Vault' },
    { key: 'canvas', label: 'Spotify Canvas', why: 'A looping visual that lifts saves and shares.', status: 'planned', href: null },
  ],
  week: [
    { key: 'announce', label: 'Announce across channels', why: 'Coordinated reveal on release day (DropReady copy).', status: 'partial', href: '/vault', via: 'Sound Vault' },
    { key: 'activate_presave', label: 'Activate pre-save → live', why: 'Convert pre-saves into day-one streams.', status: 'planned', href: null },
    { key: 'email_network', label: 'Email your list & network', why: 'Your warmest audience converts first.', status: 'planned', href: null },
  ],
  post: [
    { key: 'benchmark', label: 'Track + benchmark growth', why: 'See how you compare to artists who broke through.', status: 'built', href: '/benchmarks', via: 'Benchmarks' },
    { key: 'opportunities', label: 'Chase unlocked opportunities', why: 'Your metrics open new doors in Antenna.', status: 'built', href: '/antenna', via: 'Antenna' },
    { key: 'playlist_pitch', label: 'Pitch playlists', why: 'Editorial + independent curators.', status: 'partial', href: '/tools/pitchplug', via: 'PitchPlug' },
    { key: 'artist_pick', label: 'Set Spotify Artist Pick', why: 'Feature the release on your profile.', status: 'planned', href: null },
    { key: 'discovery_mode', label: 'Spotify Discovery Mode', why: 'Algorithmic reach in exchange for a royalty trim.', status: 'planned', href: null },
    { key: 'ads', label: 'Run ads (Meta / TikTok / Spotify)', why: 'Amplify what is already converting.', status: 'planned', href: null },
  ],
}
