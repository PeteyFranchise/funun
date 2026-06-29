import type { VaultProject } from '@/types'

/**
 * Local preview seed for the Sound Vault page.
 *
 * Used only when NEXT_PUBLIC_VAULT_DEMO=true so `npm run dev` shows a
 * populated page without a live Supabase project or signed-in user.
 * Relation shapes match the live query so readiness counts render the same.
 */
export type VaultProjectRow = Omit<
  VaultProject,
  'tracks' | 'assets' | 'documents' | 'submissions' | 'tool_outputs'
> & {
  tracks: {
    id: string
    title?: string
    track_number?: number
    isrc: string | null
    iswc?: string | null
    metadata?: Record<string, unknown> | null
  }[]
  vault_assets: { id: string; type: string }[]
  vault_documents: { id: string; type: string; status: string }[]
  tool_outputs: { id: string; tool_slug: string }[]
}

const DEMO_USER = '00000000-0000-0000-0000-000000000000'

function row(
  partial: Partial<VaultProjectRow> &
    Pick<VaultProjectRow, 'title' | 'type' | 'status' | 'vault_readiness_score'>,
  id: string
): VaultProjectRow {
  return {
    id,
    user_id: DEMO_USER,
    release_date: null,
    genre: null,
    sub_genre: null,
    cover_art_url: null,
    upc: null,
    is_public: false,
    notes: null,
    content_id_registered: false,
    content_id_dismissed_until: null,
    label: null,
    publisher: null,
    c_line: null,
    p_line: null,
    copyright_year: null,
    primary_language: null,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    distributor: null,
    // Rights registration status (migrations 024–025)
    copyright_status: null,
    pro_registration_status: null,
    soundexchange_registered: null,
    mlc_registered: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    tracks: [],
    vault_assets: [],
    vault_documents: [],
    tool_outputs: [],
    ...partial,
  }
}

export const DEMO_VAULT_PROJECTS: VaultProjectRow[] = [
  row(
    {
      title: 'Midnight Oil',
      type: 'single',
      status: 'released',
      genre: 'R&B',
      release_date: '2026-03-14',
      vault_readiness_score: 90,
      tracks: [
        {
          id: 't1',
          isrc: 'USX9P2600001',
          iswc: 'T3450824601',
          metadata: {
            composers: [
              { name: 'Demo Artist', role: 'composer_lyricist', pro: 'ASCAP', ipi: '00123456789', split: 100 },
            ],
          },
        },
      ],
      vault_assets: [{ id: 'a1', type: 'cover_art' }],
      vault_documents: [
        { id: 'd1', type: 'split_sheet', status: 'signed' },
        { id: 'd2', type: 'copyright_registration', status: 'verified' },
        { id: 'd3', type: 'hire_right', status: 'signed' },
      ],
      tool_outputs: [
        { id: 'o1', tool_slug: 'royaltyaudit' },
        { id: 'o2', tool_slug: 'distroadvisor' },
      ],
    },
    'demo-single-1'
  ),
  row(
    {
      title: 'Paper Planes',
      type: 'single',
      status: 'in_progress',
      genre: 'Pop',
      release_date: '2026-08-01',
      vault_readiness_score: 20,
      tracks: [{ id: 't2', isrc: null }],
      vault_assets: [{ id: 'a2', type: 'cover_art' }],
      vault_documents: [{ id: 'd4', type: 'split_sheet', status: 'pending' }],
    },
    'demo-single-2'
  ),
  row(
    {
      title: 'Hook 03 — TikTok cut',
      type: 'snippet',
      status: 'in_progress',
      genre: 'Hip-Hop',
      vault_readiness_score: 40,
      vault_assets: [{ id: 'a3', type: 'snippet_visual' }],
      tool_outputs: [{ id: 'o3', tool_slug: 'soundbait' }],
    },
    'demo-snippet-1'
  ),
  row(
    {
      title: 'Lowlight',
      type: 'ep',
      status: 'submitted',
      genre: 'Alt R&B',
      release_date: '2026-07-15',
      vault_readiness_score: 80,
      tracks: [
        { id: 't3', isrc: 'USX9P2600010' },
        { id: 't4', isrc: 'USX9P2600011' },
      ],
      vault_assets: [{ id: 'a4', type: 'cover_art' }],
      vault_documents: [
        { id: 'd5', type: 'split_sheet', status: 'signed' },
        { id: 'd6', type: 'copyright_registration', status: 'verified' },
      ],
      tool_outputs: [
        { id: 'o4', tool_slug: 'royaltyaudit' },
        { id: 'o5', tool_slug: 'distroadvisor' },
      ],
    },
    'demo-ep-1'
  ),
  row(
    {
      title: 'FIRST LIGHT',
      type: 'album',
      status: 'in_progress',
      genre: 'R&B',
      vault_readiness_score: 30,
      tracks: [
        { id: 't5', isrc: 'USX9P2600020' },
        { id: 't6', isrc: 'USX9P2600021' },
      ],
      vault_assets: [{ id: 'a5', type: 'cover_art' }],
    },
    'demo-album-1'
  ),
  row(
    {
      title: 'demo — untitled (Apr)',
      type: 'unreleased',
      status: 'shelved',
      vault_readiness_score: 10,
      tracks: [{ id: 't7', isrc: null }],
    },
    'demo-unreleased-1'
  ),
]
