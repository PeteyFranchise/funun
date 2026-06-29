// ─── User & Access ────────────────────────────────────────────────────
export type UserRole = 'artist' | 'industry' | 'admin'
export type Tier = 'free' | 'pro' | 'studio' | 'founding'

export const TIER_ORDER: Record<Tier, number> = {
  free: 0, pro: 1, studio: 2, founding: 3,
}

export function hasAccess(userTier: Tier, requiredTier: Tier): boolean {
  if (userTier === 'founding') return true
  return TIER_ORDER[userTier] >= TIER_ORDER[requiredTier]
}

// ─── Sound Vault — Project Types ─────────────────────────────────────
/**
 * Five project types that live in Sound Vault.
 *
 * single     — one track, full distribution and legal package
 * snippet    — 15–60 second social media clip, simplified checklist
 * ep         — 3–6 tracks, full project
 * album      — complete project, full discography entry
 * unreleased — demo / work in progress / shelved idea
 */
export type VaultProjectType = 'single' | 'snippet' | 'ep' | 'album' | 'unreleased'

export type VaultProjectStatus =
  | 'in_progress'  // being built — not ready to submit
  | 'vault_ready'  // readiness score met — can submit
  | 'submitted'    // at least one submission sent
  | 'released'     // live on streaming / social platforms
  | 'archived'     // past project, kept for history
  | 'shelved'      // paused indefinitely

export type VaultProject = {
  id: string
  user_id: string
  title: string
  type: VaultProjectType
  status: VaultProjectStatus
  release_date: string | null
  vault_readiness_score: number    // 0–100, auto-calculated
  genre: string | null
  sub_genre: string | null
  cover_art_url: string | null
  upc: string | null
  is_public: boolean
  notes: string | null
  content_id_registered: boolean
  content_id_dismissed_until: string | null
  // Metadata Studio — release-level rights & contact (migration 006)
  label: string | null
  publisher: string | null
  c_line: string | null
  p_line: string | null
  copyright_year: number | null
  primary_language: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  // Distribution (migration 016) — where this release will be distributed
  distributor: string | null
  // Rights registration status (migrations 024–025)
  copyright_status: 'not_filed' | 'filed' | 'registered' | null
  pro_registration_status: 'not_registered' | 'registered' | null
  soundexchange_registered: boolean | null
  mlc_registered: boolean | null
  // Relations
  tracks?: Track[]
  assets?: VaultAsset[]
  documents?: VaultDocument[]
  submissions?: Submission[]
  tool_outputs?: ToolOutput[]
  created_at: string
  updated_at: string
}

export const VAULT_PROJECT_TYPE_LABELS: Record<VaultProjectType, string> = {
  single:     'Single',
  snippet:    'Snippet',
  ep:         'EP',
  album:      'Album',
  unreleased: 'Unreleased',
}

// ─── Vault Readiness Score ────────────────────────────────────────────
export type ReadinessItem = {
  key: string
  label: string
  description: string
  points: number
  applies_to: VaultProjectType[]  // which project types need this
  status: 'complete' | 'warning' | 'missing'
  action_label?: string
  action_tool?: string
}

// Full checklist — applies_to controls which types each item gates
// ─── Readiness item design rule ──────────────────────────────────────────────
// Each distinct registration body gets its own item. Never lump two registries
// into one item — they have different requirements, different deadlines, and
// different consequences for missing them. Current registries and their items:
//   US Copyright Office   → 'copyright'
//   PRO (ASCAP/BMI/SESAC/SOCAN) → 'pro_registration'  ← Phase 4: split per-PRO
//   The MLC               → 'mlc_registration'
//   SoundExchange         → Phase 4 (per-party, recording-side)
//   Harry Fox / DistroKid → Phase 4 if mechanical licensing path is added
// When adding a new registry in any future phase, always create a new key.
// ─────────────────────────────────────────────────────────────────────────────
export const READINESS_ITEMS: Omit<ReadinessItem, 'status'>[] = [
  {
    key: 'audio_files',
    label: 'Audio files uploaded',
    description: 'WAV or FLAC at 44.1kHz or 48kHz',
    points: 10,
    applies_to: ['single', 'ep', 'album', 'unreleased'],
    action_label: 'Upload audio →',
    action_tool: undefined,
  },
  {
    key: 'visual_asset',
    label: 'Visual asset ready',
    description: 'Cover art (3000×3000px) or snippet visual',
    points: 10,
    applies_to: ['single', 'snippet', 'ep', 'album'],
    action_label: 'Create with LyricCard Studio →',
    action_tool: 'lyriccard',
  },
  {
    key: 'split_sheets',
    label: 'Split sheets signed',
    description: 'All collaborators have signed split sheets',
    points: 15,
    applies_to: ['single', 'ep', 'album', 'unreleased'],
    action_label: 'Generate with SplitSheet →',
    action_tool: 'splitsheet',
  },
  {
    key: 'copyright',
    label: 'Copyright registered',
    description: 'US Copyright Office registration complete',
    points: 15,
    applies_to: ['single', 'ep', 'album'],
    action_label: 'Register with CopyrightKit →',
    action_tool: 'copyrightkit',
  },
  {
    key: 'isrc_codes',
    label: 'ISRC codes assigned',
    description: 'Every track has a registered ISRC code',
    points: 10,
    applies_to: ['single', 'ep', 'album'],
    action_label: 'Add ISRC codes →',
    action_tool: undefined,
  },
  {
    key: 'pro_registration',
    label: 'PRO registration ready',
    description: 'Every track has an ISWC — required for ASCAP, BMI, SESAC, and SOCAN to register your performance royalties',
    points: 5,
    applies_to: ['single', 'ep', 'album'],
    action_label: 'Add ISWC in Metadata Studio →',
    action_tool: undefined,
  },
  {
    // Phase 4: upgrade to per-party MLC registration tracking once collaborator
    // identity reconciliation is in place — each co-writer registers their own share.
    key: 'mlc_registration',
    label: 'MLC registration ready',
    description: 'Every track has an ISWC — required for The MLC to register your mechanical royalties from streaming and downloads',
    points: 5,
    applies_to: ['single', 'ep', 'album'],
    action_label: 'Add ISWC in Metadata Studio →',
    action_tool: undefined,
  },
  {
    key: 'hire_right',
    label: 'Producer agreements signed',
    description: 'Work-for-hire agreements with all hired collaborators',
    points: 10,
    applies_to: ['single', 'ep', 'album'],
    action_label: 'Generate with HireRight →',
    action_tool: 'hireright',
  },
  {
    key: 'epk',
    label: 'EPK complete',
    description: 'Electronic press kit is current',
    points: 5,
    applies_to: ['ep', 'album'],
    action_label: 'Build with EPK.fyi →',
    action_tool: 'epkfyi',
  },
  {
    key: 'metadata',
    label: 'Metadata captured',
    description: 'Composers and publishing splits captured for every track',
    points: 10,
    applies_to: ['single', 'ep', 'album'],
    action_label: 'Complete in Metadata Studio →',
    action_tool: undefined,
  },
  {
    key: 'distributor',
    label: 'Distributor selected',
    description: 'Chosen where this release will be uploaded for distribution',
    points: 10,
    applies_to: ['single', 'ep', 'album'],
    action_label: 'Choose a distributor →',
    action_tool: undefined,
  },
  // Snippet-specific items
  {
    key: 'caption_copy',
    label: 'Caption copy generated',
    description: 'IG, TikTok, and Threads captions ready',
    points: 40,
    applies_to: ['snippet'],
    action_label: 'Generate with DropReady →',
    action_tool: 'dropready',
  },
  {
    key: 'tiktok_strategy',
    label: 'TikTok sound strategy',
    description: 'Sound seeding plan for TikTok',
    points: 30,
    applies_to: ['snippet'],
    action_label: 'Create with SoundBait →',
    action_tool: 'soundbait',
  },
]

// ─── Artist Profile ───────────────────────────────────────────────────
// A member's lead role on their public profile. Members pick from this
// fixed list or supply a custom title (stored as a free string).
export const PROFILE_ROLES = [
  'artist',
  'producer',
  'songwriter',
  'music_supervisor',
  'anr',
  'exec',
] as const
export type ProfileRoleSlug = (typeof PROFILE_ROLES)[number]

export const PROFILE_ROLE_LABELS: Record<ProfileRoleSlug, string> = {
  artist: 'Artist',
  producer: 'Producer',
  songwriter: 'Songwriter',
  music_supervisor: 'Music Supervisor',
  anr: 'A&R',
  exec: 'Executive',
}

/** A role on a profile: a known slug, or a custom title the member typed. */
export type ProfileRole =
  | { kind: 'preset'; slug: ProfileRoleSlug }
  | { kind: 'custom'; label: string }

/** What a member is open to — used for discovery/matching on the profile. */
export type OpenTo =
  | 'collabs'
  | 'sync'
  | 'features'
  | 'production'
  | 'writing'
  | 'management'
  | 'booking'

// ─── Social layer (migration 012) ────────────────────────────────────
/** A lightweight author identity rendered on social items. */
export type SocialAuthor = {
  id: string
  name: string
  avatarUrl: string | null
  roleLabel: string | null
}

export type Follow = { follower_id: string; followee_id: string; created_at: string }

export type WallPost = {
  id: string
  profile_id: string
  author_id: string
  body: string
  created_at: string
  author?: SocialAuthor
}

export type Endorsement = {
  id: string
  profile_id: string
  author_id: string
  body: string
  created_at: string
  author?: SocialAuthor
}

export type ReleaseComment = {
  id: string
  project_id: string
  author_id: string
  parent_id: string | null
  body: string
  created_at: string
  author?: SocialAuthor
}

export type ActivityKind = 'placement' | 'release' | 'readiness' | 'other'
export type ActivityEvent = {
  id: string
  profile_id: string
  kind: ActivityKind
  body: string
  data: Record<string, unknown>
  created_at: string
}

export type DmThread = { id: string; a_id: string; b_id: string; created_at: string }
export type DmMessage = {
  id: string
  thread_id: string
  sender_id: string
  body: string
  created_at: string
}

export type ArtistProfile = {
  id: string
  artist_name: string | null
  genre: string | null
  location: string | null
  bio: string | null
  career_stage: 1 | 2 | 3 | 4
  instagram_handle: string | null
  threads_handle: string | null
  tiktok_handle: string | null
  spotify_url: string | null
  monthly_listeners: number | null
  total_streams: number | null
  sound_identity: SoundIdentity | null
  // ISRC self-assignment (migration 007) — set once when the artist holds
  // their own registrant code; counters track the last designation per year.
  isrc_country_code: string | null
  isrc_registrant_code: string | null
  isrc_year_counters: Record<string, number> | null
  // Legal identity (migration 021) — separate from artist/stage name.
  legal_first_name: string | null
  legal_middle_name: string | null
  legal_last_name: string | null
  legal_name_suffix: string | null
  // Contact for contracts and split sheets (migration 021).
  contact_phone: string | null
  mailing_address: Record<string, string> | null
  // Industry roles — master list of hats this person wears (migration 021).
  industry_roles: string[]
  // Genre tags — all genres that apply (migration 022).
  genres: string[]
  // Rights registry fields (migration 020) — artist's own PRO/IPI/publisher data.
  pro: string | null
  ipi: string | null
  publisher: string | null
  mlc_id: string | null
  soundexchange_id: string | null
  // Public showcase profile (migration 010). is_public is the app-level
  // gate for whether /@handle renders; handle is the shareable slug.
  handle: string | null
  is_public: boolean
  avatar_url: string | null
  banner_url: string | null
  pronouns: string | null
  verified: boolean
  roles: ProfileRole[]
  open_to: OpenTo[]
  featured_project_id: string | null
  created_at: string
  updated_at: string
}

export type SoundIdentity = {
  primary_genre: string
  sub_genre: string | null
  mood_tags: string[]
  bpm_range: { min: number; max: number } | null
  energy_level: 'low' | 'medium' | 'high' | null
  similar_artists: string[]
  lyrical_themes: string[]
  last_analyzed: string
  /**
   * Latest Breakthrough Benchmarking metrics the artist saved. Shape mirrors
   * BenchmarkInput; stored here (vs. a new table) so the Antenna room can read
   * the same numbers that drive opportunity gates. Optional — absent until the
   * artist saves from the Benchmarks room.
   */
  benchmarks?: {
    monthlyListeners: number
    savesToStreamsPct: number
    followerGrowthPctMonthly: number
    engagementRatePct: number
    playlistAddsPerMonth: number
  }
}

// ─── Industry Professional ─────────────────────────────────────────────
export type IndustryProfile = {
  id: string
  user_id: string
  display_name: string
  company: string | null
  role: IndustryRole
  verified: boolean
  bio: string | null
  genres_seeking: string[]
  currently_accepting: boolean
  response_rate: number | null
  website: string | null
  created_at: string
}

export type IndustryRole =
  | 'a_and_r'
  | 'sync_supervisor'
  | 'playlist_curator'
  | 'venue_booker'
  | 'music_publisher'
  | 'festival_director'
  | 'music_supervisor'
  | 'brand_music_director'

// ─── Track ────────────────────────────────────────────────────────────
export type Track = {
  id: string
  project_id: string
  user_id: string
  title: string
  track_number: number
  duration_seconds: number | null
  isrc: string | null
  audio_file_url: string | null
  audio_file_size: number | null
  bpm: number | null
  key_signature: string | null
  explicit: boolean
  lyrics: string | null
  featuring_artists: string[]
  writers: string[]
  producers: string[]
  mixing_engineer: string | null
  mastering_engineer: string | null
  has_sample: boolean
  sample_details: string | null
  iswc: string | null
  language: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// ─── Vault Assets ─────────────────────────────────────────────────────
export type AssetType =
  | 'cover_art'
  | 'press_photo'
  | 'lyric_card'
  | 'snippet_visual'
  | 'promo_video'
  | 'banner'

export type VaultAsset = {
  id: string
  project_id: string
  user_id: string
  type: AssetType
  url: string
  filename: string
  size_bytes: number
  width?: number
  height?: number
  created_at: string
}

// ─── Vault Documents ──────────────────────────────────────────────────
export type DocumentType =
  | 'split_sheet'
  | 'copyright_registration'
  | 'hire_right'
  | 'sample_clearance'
  | 'distribution_agreement'

export type VerificationState = 'pass' | 'fail' | 'pending'
export type VerificationCheck = {
  key: string
  label: string
  detail: string
  state: VerificationState
}
export type VerificationStatus = 'unverified' | 'verifying' | 'verified' | 'failed'

export type VaultDocument = {
  id: string
  project_id: string | null
  track_id: string | null
  user_id: string
  type: DocumentType
  status: 'pending' | 'signed' | 'verified'
  document_data: Record<string, unknown>
  signed_at: string | null
  // Contract Locker upload + AI verification (migration 011).
  source: 'generated' | 'uploaded'
  file_url: string | null
  verification_status: VerificationStatus
  verification_checks: VerificationCheck[]
  verification_summary: string | null
  verified_at: string | null
  created_at: string
}

// ─── Tool Outputs ─────────────────────────────────────────────────────
export type ToolOutput = {
  id: string
  user_id: string
  project_id: string | null
  tool_slug: string
  title: string | null
  inputs: Record<string, unknown>
  output: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── Submissions ──────────────────────────────────────────────────────
export type Submission = {
  id: string
  project_id: string
  user_id: string
  destination_type: string
  destination_name: string
  pitch_text?: string
  status: 'draft' | 'sent' | 'viewed' | 'responded' | 'accepted' | 'declined' | 'no_response'
  submitted_at: string | null
  responded_at: string | null
  response_message: string | null
  created_at: string
}

// ─── Pitches ──────────────────────────────────────────────────────────
export type Pitch = {
  id: string
  project_id: string
  artist_id: string
  recipient_id: string
  message: string | null
  status: 'sent' | 'viewed' | 'interested' | 'passed' | 'responded'
  sent_at: string
  viewed_at: string | null
  responded_at: string | null
  response_message: string | null
  project?: VaultProject
  artist?: ArtistProfile
  recipient?: IndustryProfile
}

// ─── Opportunities (The Antenna) ─────────────────────────────────────
export type OpportunityType =
  | 'sync'
  | 'playlist'
  | 'label'
  | 'venue'
  | 'festival'
  | 'press'
  | 'brand'

export type CompensationType = 'paid' | 'rev_share' | 'credit_only' | 'tbd'

export type Opportunity = {
  id: string
  created_by: string
  industry_profile_id: string | null
  title: string
  description: string
  type: OpportunityType
  genres: string[]
  mood_tags: string[]
  bpm_min: number | null
  bpm_max: number | null
  deadline: string | null
  active: boolean
  exclusive: boolean
  compensation: string | null
  submission_requirements: string | null
  // ── Antenna targeting (migration 009) ──
  min_readiness_score: number | null
  min_monthly_listeners: number | null
  max_monthly_listeners: number | null
  career_stages: number[]
  location_preference: string | null
  response_deadline: string | null
  slots_available: number
  slots_filled: number
  platform: string | null
  compensation_type: CompensationType | null
  pete_exclusive: boolean
  pete_note: string | null
  created_at: string
}

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  sync: 'Sync',
  playlist: 'Playlist',
  label: 'Label',
  venue: 'Venue',
  festival: 'Festival',
  press: 'Press',
  brand: 'Brand',
}

// ─── Antenna matching ─────────────────────────────────────────────────
export type MatchFactor = {
  key: 'genre' | 'readiness' | 'listeners' | 'mood' | 'career'
  label: string
  earned: number
  max: number
  detail: string
}

export type MatchBreakdown = {
  total: number
  factors: MatchFactor[]
}

export type OpportunityMatch = {
  id: string
  opportunity_id: string
  project_id: string
  user_id: string
  match_score: number
  breakdown: MatchBreakdown | null
  status: 'matched' | 'notified' | 'applied' | 'accepted' | 'declined'
  notified_at: string | null
  applied: boolean
  applied_at: string | null
  // Optional joined rows for UI.
  opportunity?: Opportunity
  project?: VaultProject
}

// ─── Notifications ────────────────────────────────────────────────────
export type Notification = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  data: Record<string, unknown>
  emailed: boolean
  read: boolean
  created_at: string
}

// ─── Community ────────────────────────────────────────────────────────
export type CommunityPost = {
  id: string
  user_id: string
  project_id: string | null
  type: 'vault_share' | 'feedback_request' | 'success_story' | 'question' | 'collab_search'
  content: string
  likes: number
  comment_count: number
  created_at: string
  author?: ArtistProfile
  project?: VaultProject
}

// ─── Subscription ────────────────────────────────────────────────────
export type Subscription = {
  id: string
  user_id: string
  tier: Tier
  status: 'active' | 'canceled' | 'past_due' | 'trialing'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
  pitch_credits_remaining: number
  created_at: string
}

// ─── Tools ───────────────────────────────────────────────────────────
export type Studio = 'create' | 'discover' | 'money' | 'protect' | 'growth'

export type Tool = {
  slug: string
  name: string
  tagline: string
  description: string
  studio: Studio
  tier: Tier
  price_standalone: number
  inputs: ToolInput[]
  output_type: 'json' | 'document' | 'text'
  icon: string
  feeds_vault: boolean           // does output auto-attach to active vault project?
  vault_field?: string
}

export type ToolInput = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'date' | 'url' | 'number'
  placeholder?: string
  sublabel?: string
  options?: string[]
  required: boolean
}

// ─── API Response ────────────────────────────────────────────────────
export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: string }
