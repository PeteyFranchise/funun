import { readEsignState } from '@/lib/esign/provider'

// ─── Stage 3 — Complete the Documentation ────────────────────────────
// The legal gate between uploading files (Stage 2) and generating assets
// (Stage 4). This module runs the five documentation checks and produces
// a flat list of requirements the Stage 3 UI renders as cards.
//
// Each of the five tools maps to a vault_documents type (except ContentID,
// which is tracked on the project itself):
//   splitsheet   → split_sheet          (per track, >1 writer)        REQUIRED
//   hireright    → hire_right            (per hired collaborator)      REQUIRED
//   copyrightkit → copyright_registration (project level)             REQUIRED
//   sampleclear  → sample_clearance      (per track with has_sample)   REQUIRED
//   contentid    → project.content_id_registered                      RECOMMENDED

export type Stage3ToolSlug =
  | 'splitsheet'
  | 'hireright'
  | 'copyrightkit'
  | 'sampleclear'
  | 'contentid'

export type DocStatus = 'missing' | 'pending' | 'signed'
export type DocSeverity = 'required' | 'recommended'
export type DocScope = 'project' | 'track' | 'collaborator'

export type DocRequirement = {
  /** Stable key for React lists and pre-fill routing. */
  key: string
  tool: Stage3ToolSlug
  title: string
  /** Plain-language line: what this document protects. */
  protects: string
  scope: DocScope
  severity: DocSeverity
  status: DocStatus
  /** Track this applies to, when scope === 'track'. */
  trackId?: string
  trackTitle?: string
  /** Collaborator name, when scope === 'collaborator' (HireRight). */
  collaborator?: string
  collaboratorRole?: string
  /** Existing document id, if one has been generated. */
  documentId?: string
  /** Public storage URL of the uploaded signed PDF. */
  file_url?: string | null
  /** ISO timestamp of when the document was signed. */
  signed_at?: string | null
  /** Per-signer status from document_data.esign.signers. */
  signers?: { name: string; email: string; status: 'pending' | 'signed' | 'declined' }[]
  /** Data passed into the tool side panel to pre-fill the form. */
  prefill: Record<string, unknown>
}

// Minimal shapes — supersets of the live rows; only what the checks read.
type TrackLike = {
  id: string
  title?: string | null
  writers?: string[] | null
  producers?: string[] | null
  mixing_engineer?: string | null
  mastering_engineer?: string | null
  has_sample?: boolean | null
  sample_details?: string | null
}

type DocLike = {
  id: string
  type: string
  status: string
  track_id?: string | null
  document_data?: Record<string, unknown> | null
  file_url?: string | null
  signed_at?: string | null
}

type ProjectLike = {
  id: string
  title: string
  type: string
  content_id_registered?: boolean | null
  content_id_dismissed_until?: string | null
}

const STATUS_RANK: Record<DocStatus, number> = { missing: 0, pending: 1, signed: 2 }

function docStatusToReq(s: string): DocStatus {
  return s === 'signed' || s === 'verified' ? 'signed' : 'pending'
}

type BestStatusResult = {
  status: DocStatus
  documentId?: string
  file_url?: string | null
  signed_at?: string | null
  signers?: { name: string; email: string; status: 'pending' | 'signed' | 'declined' }[]
}

/** Best (most complete) status across a set of matching documents. */
function bestStatus(docs: DocLike[]): BestStatusResult {
  let status: DocStatus = 'missing'
  let documentId: string | undefined
  let file_url: string | null | undefined
  let signed_at: string | null | undefined
  let signers: BestStatusResult['signers']
  for (const d of docs) {
    const s = docStatusToReq(d.status)
    if (STATUS_RANK[s] >= STATUS_RANK[status]) {
      status = s
      documentId = d.id
      file_url = d.file_url ?? null
      signed_at = d.signed_at ?? null
      const esignState = readEsignState(d.document_data ?? null)
      if (esignState?.signers && esignState.signers.length > 0) {
        signers = esignState.signers.map(s => ({ name: s.name, email: s.email, status: s.status }))
      } else {
        const contribs = Array.isArray((d.document_data as Record<string, unknown> | null)?.contributors)
          ? ((d.document_data as Record<string, unknown>).contributors as Array<Record<string, unknown>>)
          : []
        if (contribs.length > 0) {
          const signerStatus: 'pending' | 'signed' | 'declined' =
            d.status === 'signed' || d.status === 'verified' ? 'signed' : 'pending'
          signers = contribs
            .filter(c => typeof c.name === 'string' && (c.name as string).trim())
            .map(c => ({
              name: String(c.name).trim(),
              email: typeof c.email === 'string' && (c.email as string).trim() ? String(c.email).trim() : '',
              status: signerStatus,
            }))
        } else {
          signers = undefined
        }
      }
    }
  }
  return { status, documentId, file_url, signed_at, signers }
}

export type Stage3Result = {
  required: DocRequirement[]
  recommended: DocRequirement[]
  complete: DocRequirement[]
  /** Counts over REQUIRED items only. */
  requiredComplete: number
  requiredTotal: number
  /** Whether the artist may advance to Stage 4 (Generate Assets). */
  canContinue: boolean
  /** Whether an uncleared flagged sample is blocking distribution. */
  sampleBlock: boolean
}

const CONTINUE_THRESHOLD = 60

export function computeStage3(
  project: ProjectLike,
  tracks: TrackLike[],
  documents: DocLike[],
  readinessScore: number
): Stage3Result {
  const byType = (t: string) => documents.filter(d => d.type === t)
  const reqs: DocRequirement[] = []

  // 1 ── CopyrightKit (project level, required) ────────────────────────
  {
    const docs = byType('copyright_registration')
    const { status, documentId, file_url, signed_at, signers } = bestStatus(docs)
    const allWriters = Array.from(
      new Set(tracks.flatMap(t => t.writers ?? []).filter(Boolean))
    )
    reqs.push({
      key: 'copyrightkit',
      tool: 'copyrightkit',
      title: 'Copyright registration',
      protects:
        'Without registration, you cannot sue for statutory damages if your music is stolen.',
      scope: 'project',
      severity: 'required',
      status,
      documentId,
      file_url,
      signed_at,
      signers,
      prefill: {
        project_title: project.title,
        writers: allWriters,
        track_count: tracks.length,
        registration_mode: tracks.length >= 3 ? 'collection' : 'single',
      },
    })
  }

  // 2 ── SplitSheet (per track with >1 writer, required) ───────────────
  for (const t of tracks) {
    const writers = (t.writers ?? []).filter(Boolean)
    if (writers.length <= 1) continue
    const docs = byType('split_sheet').filter(d => d.track_id === t.id)
    const { status, documentId, file_url, signed_at, signers } = bestStatus(docs)
    reqs.push({
      key: `splitsheet:${t.id}`,
      tool: 'splitsheet',
      title: 'Split sheet',
      protects: 'Documents who owns what share of the song before it earns money.',
      scope: 'track',
      severity: 'required',
      status,
      documentId,
      file_url,
      signed_at,
      signers,
      trackId: t.id,
      trackTitle: t.title ?? 'Untitled track',
      prefill: { song_name: t.title ?? '', collaborators: writers },
    })
  }

  // 3 ── HireRight (per distinct hired collaborator, required) ─────────
  // Gather hired people across all tracks, grouped by name so a producer
  // who worked on several tracks shows once.
  const hires = new Map<string, { role: string; trackIds: string[]; trackTitles: string[] }>()
  const addHire = (name: string | null | undefined, role: string, t: TrackLike) => {
    const n = (name ?? '').trim()
    if (!n) return
    const existing = hires.get(n)
    if (existing) {
      existing.trackIds.push(t.id)
      existing.trackTitles.push(t.title ?? 'Untitled track')
    } else {
      hires.set(n, { role, trackIds: [t.id], trackTitles: [t.title ?? 'Untitled track'] })
    }
  }
  for (const t of tracks) {
    for (const p of t.producers ?? []) addHire(p, 'Producer', t)
    addHire(t.mixing_engineer, 'Mixing engineer', t)
    addHire(t.mastering_engineer, 'Mastering engineer', t)
  }
  for (const [name, info] of hires) {
    const docs = byType('hire_right').filter(
      d => String(d.document_data?.collaborator ?? '').trim() === name
    )
    const { status, documentId, file_url, signed_at, signers } = bestStatus(docs)
    reqs.push({
      key: `hireright:${name}`,
      tool: 'hireright',
      title: `Work-for-hire — ${name}`,
      protects: `Confirms you own 100% of the recording and ${name} waives ownership claims.`,
      scope: 'collaborator',
      severity: 'required',
      status,
      documentId,
      file_url,
      signed_at,
      signers,
      collaborator: name,
      collaboratorRole: info.role,
      trackId: info.trackIds[0],
      trackTitle: info.trackTitles.join(', '),
      prefill: {
        collaborator: name,
        role: info.role,
        track_titles: info.trackTitles,
      },
    })
  }

  // 4 ── SampleClear (per track with has_sample, required) ─────────────
  for (const t of tracks) {
    if (!t.has_sample) continue
    const docs = byType('sample_clearance').filter(d => d.track_id === t.id)
    const { status, documentId, file_url, signed_at, signers } = bestStatus(docs)
    reqs.push({
      key: `sampleclear:${t.id}`,
      tool: 'sampleclear',
      title: 'Sample clearance',
      protects:
        'Uncleared samples can result in your entire project being taken down after release.',
      scope: 'track',
      severity: 'required',
      status,
      documentId,
      file_url,
      signed_at,
      signers,
      trackId: t.id,
      trackTitle: t.title ?? 'Untitled track',
      prefill: { song_name: t.title ?? '', sample_details: t.sample_details ?? '' },
    })
  }

  // 5 ── ContentID (project level, recommended, dismissible) ───────────
  const dismissed =
    project.content_id_dismissed_until != null &&
    new Date(project.content_id_dismissed_until).getTime() > Date.now()
  const recommended: DocRequirement[] = []
  if (!dismissed) {
    recommended.push({
      key: 'contentid',
      tool: 'contentid',
      title: 'YouTube Content ID',
      protects:
        'Claims your music on YouTube so you earn from videos that use it — and lets you issue takedowns.',
      scope: 'project',
      severity: 'recommended',
      status: project.content_id_registered ? 'signed' : 'missing',
      prefill: { project_title: project.title },
    })
  }

  // ── Partition required into open vs complete ─────────────────────────
  const open = reqs.filter(r => r.status !== 'signed')
  const complete = reqs.filter(r => r.status === 'signed')
  // Recommended items that are done also fall into the Complete section.
  const recommendedDone = recommended.filter(r => r.status === 'signed')
  const recommendedOpen = recommended.filter(r => r.status !== 'signed')

  const requiredTotal = reqs.length
  const requiredComplete = complete.length

  const sampleBlock = reqs.some(r => r.tool === 'sampleclear' && r.status !== 'signed')

  return {
    required: open,
    recommended: recommendedOpen,
    complete: [...complete, ...recommendedDone],
    requiredComplete,
    requiredTotal,
    canContinue: readinessScore >= CONTINUE_THRESHOLD && !sampleBlock,
    sampleBlock,
  }
}

export const STAGE3_CONTINUE_THRESHOLD = CONTINUE_THRESHOLD
