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
    label: 'PRO registration confirmed',
    description: 'Songs registered with ASCAP, BMI, or SESAC',
    points: 10,
    applies_to: ['single', 'ep', 'album'],
    action_label: 'Audit with RoyaltyAudit →',
    action_tool: 'royaltyaudit',
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
    points: 10,
    applies_to: ['ep', 'album'],
    action_label: 'Build with EPK.fyi →',
    action_tool: 'epkfyi',
  },
  {
    key: 'metadata',
    label: 'Metadata optimised',
    description: 'DSP metadata fields complete and correct',
    points: 10,
    applies_to: ['single', 'ep', 'album'],
    action_label: 'Optimise with DistroAdvisor →',
    action_tool: 'distroadvisor',
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

export type VaultDocument = {
  id: string
  project_id: string | null
  track_id: string | null
  user_id: string
  type: DocumentType
  status: 'pending' | 'signed' | 'verified'
  document_data: Record<string, unknown>
  signed_at: string | null
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
export type Opportunity = {
  id: string
  created_by: string
  title: string
  description: string
  type: 'sync' | 'playlist' | 'label' | 'venue' | 'festival' | 'press' | 'brand'
  genres: string[]
  mood_tags: string[]
  deadline: string | null
  active: boolean
  exclusive: boolean
  compensation: string | null
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
