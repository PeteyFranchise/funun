// ─── Metadata Studio — exports ───────────────────────────────────────
// Turns the captured metadata into the formats each destination needs:
//   • ID3 field map  → embedded file tags (mapped to node-id3 in the route)
//   • sidecar (.txt) → travels next to WAV/AIFF that can't hold tags
//   • CSV            → universal sheet the artist uploads to any distributor
//   • DDEX ERN (XML) → DDEX-aligned delivery message (best-effort)
// Client-safe: no Node-only deps.

import {
  artistCredit,
  composerCredit,
  COMPOSER_ROLE_LABELS,
  PRO_LABELS,
  type Composer,
  type ReleaseRights,
  type TrackLyrics,
  type Performer,
  type RecordingInfo,
} from '@/lib/metadata/schema'

// ISO 639-1 → 639-2/T for the ID3 USLT language field (3-letter).
const ISO2TO3: Record<string, string> = {
  en: 'eng', es: 'spa', fr: 'fra', pt: 'por', de: 'deu', it: 'ita',
  ja: 'jpn', ko: 'kor', zh: 'zho', ar: 'ara', hi: 'hin',
}
function iso3(code: string | null | undefined): string {
  return ISO2TO3[(code ?? '').toLowerCase()] ?? 'eng'
}

export type TrackMeta = {
  title: string
  track_number: number | null
  isrc: string | null
  iswc: string | null
  duration_seconds: number | null
  bpm: number | null
  key_signature: string | null
  explicit: boolean
  language: string | null
  featuring_artists: string[]
  composers: Composer[]
  lyrics: TrackLyrics | null
  performers: Performer[]
  recording: RecordingInfo | null
  audio_file_url: string | null
}

export type ReleaseBundle = {
  artistName: string
  releaseTitle: string
  releaseType: string
  genre: string | null
  sub_genre: string | null
  release_date: string | null
  upc: string | null
  cover_art_url: string | null
  rights: ReleaseRights
  tracks: TrackMeta[]
}

// Normalized ID3 fields — the embed route maps these to node-id3 frames.
export type Id3Fields = {
  title: string
  artist: string
  albumArtist: string
  album: string
  composer: string
  trackNumber: string
  year: string
  genre: string
  copyright: string
  publisher: string
  language: string
  bpm: string
  isrc: string
  iswc: string
  upc: string
  comment: string
  lyrics: string
  lyricsLanguage: string
}

function rightsLines(r: ReleaseRights): string {
  const parts = [r.p_line, r.c_line].filter(Boolean)
  return parts.join('  ')
}

/** The "Comments & Contact" block embedded as the ID3 comment / sidecar. */
export function buildContactComment(release: ReleaseBundle, track: TrackMeta): string {
  const r = release.rights
  const lines: string[] = []
  if (r.contact_name) lines.push(`Contact: ${r.contact_name}`)
  if (r.contact_email) lines.push(`Email: ${r.contact_email}`)
  if (r.contact_phone) lines.push(`Phone: ${r.contact_phone}`)
  if (r.label) lines.push(`Label: ${r.label}`)
  if (r.publisher) lines.push(`Publisher: ${r.publisher}`)
  const rights = rightsLines(r)
  if (rights) lines.push(rights)
  if (track.composers.length > 0) {
    const splits = track.composers
      .map(c => `${c.name} ${c.split}%${c.pro && c.pro !== 'none' ? ` [${c.pro}]` : ''}`)
      .join(', ')
    lines.push(`Writers: ${splits}`)
  }
  if (track.isrc) lines.push(`ISRC: ${track.isrc}`)
  return lines.join('\n')
}

export function buildId3Fields(release: ReleaseBundle, track: TrackMeta): Id3Fields {
  return {
    title: track.title,
    artist: artistCredit(release.artistName, track.featuring_artists),
    albumArtist: release.artistName,
    album: release.releaseTitle,
    composer: composerCredit(track.composers),
    trackNumber: track.track_number != null ? String(track.track_number) : '',
    year: release.rights.copyright_year
      ? String(release.rights.copyright_year)
      : release.release_date
        ? new Date(release.release_date).getUTCFullYear().toString()
        : '',
    genre: [release.genre, release.sub_genre].filter(Boolean).join(' / '),
    copyright: rightsLines(release.rights),
    publisher: release.rights.publisher ?? '',
    language: track.language ?? release.rights.primary_language ?? '',
    bpm: track.bpm != null ? String(track.bpm) : '',
    isrc: track.isrc ?? '',
    iswc: track.iswc ?? '',
    upc: release.upc ?? '',
    comment: buildContactComment(release, track),
    lyrics: track.lyrics?.text ?? '',
    lyricsLanguage: iso3(track.lyrics?.language ?? track.language),
  }
}

// ── Sidecar (.txt) ───────────────────────────────────────────────────
/** Human + machine readable metadata block to ship next to the audio. */
export function buildSidecar(release: ReleaseBundle, track: TrackMeta): string {
  const f = buildId3Fields(release, track)
  const lines: string[] = [
    '─── TRACK METADATA ───',
    `Title:        ${f.title}`,
    `Artist:       ${f.artist}`,
    `Album Artist: ${f.albumArtist}`,
    `Release:      ${f.album} (${release.releaseType})`,
    `Track #:      ${f.trackNumber || '—'}`,
    `Genre:        ${f.genre || '—'}`,
    `Language:     ${f.language || '—'}`,
    `BPM / Key:    ${f.bpm || '—'} / ${track.key_signature || '—'}`,
    `Explicit:     ${track.explicit ? 'Yes' : 'No'}`,
    '',
    '─── IDENTIFIERS ───',
    `ISRC:  ${f.isrc || '—'}`,
    `ISWC:  ${f.iswc || '—'}`,
    `UPC:   ${f.upc || '—'}`,
    '',
    '─── COMPOSERS / PUBLISHING ───',
    ...(track.composers.length
      ? track.composers.map(
          c =>
            `${c.name} — ${COMPOSER_ROLE_LABELS[c.role]} — ${c.split}% — ${PRO_LABELS[c.pro]}${c.ipi ? ` — IPI ${c.ipi}` : ''}`
        )
      : ['—']),
    '',
    '─── RIGHTS & CONTACT ───',
    f.comment || '—',
    ...(track.lyrics?.text
      ? ['', `─── LYRICS${track.lyrics.explicit ? ' (explicit)' : ''} ───`, track.lyrics.text]
      : []),
  ]
  return lines.join('\n')
}

// ── CSV ──────────────────────────────────────────────────────────────
const CSV_HEADERS = [
  'track_number',
  'title',
  'artist',
  'album_artist',
  'release_title',
  'release_type',
  'isrc',
  'iswc',
  'upc',
  'genre',
  'sub_genre',
  'language',
  'explicit',
  'duration_seconds',
  'bpm',
  'key',
  'composers',
  'publishing_splits',
  'label',
  'publisher',
  'p_line',
  'c_line',
  'contact_name',
  'contact_email',
  'contact_phone',
]

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildCsv(release: ReleaseBundle): string {
  const rows = [CSV_HEADERS.join(',')]
  for (const t of release.tracks) {
    const composers = t.composers.map(c => `${c.name} (${PRO_LABELS[c.pro]})`).join('; ')
    const splits = t.composers.map(c => `${c.name}: ${c.split}%`).join('; ')
    const r = release.rights
    rows.push(
      [
        t.track_number ?? '',
        t.title,
        artistCredit(release.artistName, t.featuring_artists),
        release.artistName,
        release.releaseTitle,
        release.releaseType,
        t.isrc ?? '',
        t.iswc ?? '',
        release.upc ?? '',
        release.genre ?? '',
        release.sub_genre ?? '',
        t.language ?? r.primary_language ?? '',
        t.explicit ? 'yes' : 'no',
        t.duration_seconds ?? '',
        t.bpm ?? '',
        t.key_signature ?? '',
        composers,
        splits,
        r.label ?? '',
        r.publisher ?? '',
        r.p_line ?? '',
        r.c_line ?? '',
        r.contact_name ?? '',
        r.contact_email ?? '',
        r.contact_phone ?? '',
      ]
        .map(csvCell)
        .join(',')
    )
  }
  return rows.join('\n')
}

// ── DDEX ERN (best-effort, minimal) ──────────────────────────────────
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A trimmed DDEX ERN-flavored release message. This is NOT a certified
 * delivery package (that requires a DDEX party agreement with each DSP) —
 * it's a structured, DDEX-aligned export for label/direct ingestion and a
 * head start on a future distributor-API integration.
 */
/** ISO-8601 duration (PT#M#S) — the form ERN expects, not raw seconds. */
function iso8601Duration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `PT${m}M${s}S`
}

// Sender DDEX Party ID — set DDEX_DPID once registered, else a placeholder.
const PLACEHOLDER_DPID = 'PADPIDA0000000000Z'
const DPID = process.env.DDEX_DPID || PLACEHOLDER_DPID

export function buildDdexErn(release: ReleaseBundle): string {
  const r = release.rights
  const now = new Date().toISOString()
  const resourceRefs: string[] = []

  const soundRecordings = release.tracks
    .map((t, i) => {
      const ref = `A${i + 1}`
      resourceRefs.push(ref)
      const displayArtist = artistCredit(release.artistName, t.featuring_artists)
      const performers = t.performers
        .map(
          p =>
            `        <ResourceContributor>\n          <PartyName><FullName>${xmlEscape(p.name)}</FullName></PartyName>\n          <Role>${p.role === 'featured' ? 'FeaturedArtist' : 'Performer'}</Role>${p.contribution ? `\n          <InstrumentType>${xmlEscape(p.contribution)}</InstrumentType>` : ''}\n        </ResourceContributor>`
        )
        .join('\n')
      const writers = t.composers
        .map(
          c =>
            `        <IndirectResourceContributor>\n          <PartyName><FullName>${xmlEscape(c.name)}</FullName></PartyName>\n          <Role>${xmlEscape(COMPOSER_ROLE_LABELS[c.role])}</Role>\n        </IndirectResourceContributor>`
        )
        .join('\n')
      return `    <SoundRecording>
      <ResourceReference>${ref}</ResourceReference>
      <Type>MusicalWorkSoundRecording</Type>
      <SoundRecordingId><ISRC>${xmlEscape(t.isrc ?? '')}</ISRC></SoundRecordingId>
      <ReferenceTitle><TitleText>${xmlEscape(t.title)}</TitleText></ReferenceTitle>
      <Duration>${iso8601Duration(t.duration_seconds)}</Duration>
      <LanguageOfPerformance>${xmlEscape(t.language ?? r.primary_language ?? '')}</LanguageOfPerformance>
      <ParentalWarningType>${t.explicit ? 'Explicit' : 'NotExplicit'}</ParentalWarningType>
      <DisplayArtist>
        <PartyName><FullName>${xmlEscape(displayArtist)}</FullName></PartyName>
        <DisplayArtistRole>MainArtist</DisplayArtistRole>
      </DisplayArtist>
${[performers, writers].filter(Boolean).join('\n')}
    </SoundRecording>`
    })
    .join('\n')

  const releaseResourceRefs = resourceRefs
    .map(ref => `        <ReleaseResourceReference>${ref}</ReleaseResourceReference>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- DDEX-aligned ERN export from Funūn Metadata Studio. Best-effort against
     ERN 4.3 — validate against the normative XSD before delivery, and replace
     the placeholder MessageSender/MessageRecipient DPIDs with registered DDEX
     Party IDs. -->
<ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/43" MessageSchemaVersionId="ern/43" LanguageAndScriptCode="en">
  <MessageHeader>
    <MessageThreadId>${xmlEscape(release.releaseTitle)}</MessageThreadId>
    <MessageId>FUNUN-${Date.now()}</MessageId>
    <MessageSender>
      <PartyId>${DPID}</PartyId>
      <PartyName><FullName>${xmlEscape(r.label ?? release.artistName)}</FullName></PartyName>
    </MessageSender>
    <MessageRecipient><PartyId>${PLACEHOLDER_DPID}</PartyId></MessageRecipient>
    <MessageCreatedDateTime>${now}</MessageCreatedDateTime>
  </MessageHeader>
  <ResourceList>
${soundRecordings}
  </ResourceList>
  <ReleaseList>
    <Release>
      <ReleaseReference>R0</ReleaseReference>
      <ReleaseType>${xmlEscape(release.releaseType)}</ReleaseType>
      <ReleaseId><ICPN>${xmlEscape(release.upc ?? '')}</ICPN></ReleaseId>
      <ReferenceTitle><TitleText>${xmlEscape(release.releaseTitle)}</TitleText></ReferenceTitle>
      <DisplayArtist>
        <PartyName><FullName>${xmlEscape(release.artistName)}</FullName></PartyName>
        <DisplayArtistRole>MainArtist</DisplayArtistRole>
      </DisplayArtist>
      <LabelName>${xmlEscape(r.label ?? '')}</LabelName>
      <Genre><GenreText>${xmlEscape([release.genre, release.sub_genre].filter(Boolean).join(' / '))}</GenreText></Genre>
      <PLine><Year>${r.copyright_year ?? ''}</Year><PLineText>${xmlEscape(r.p_line ?? '')}</PLineText></PLine>
      <CLine><Year>${r.copyright_year ?? ''}</Year><CLineText>${xmlEscape(r.c_line ?? '')}</CLineText></CLine>
      <ReleaseDate>${xmlEscape(release.release_date ?? '')}</ReleaseDate>
      <ReleaseResourceReferenceList>
${releaseResourceRefs}
      </ReleaseResourceReferenceList>
    </Release>
  </ReleaseList>
  <DealList>
    <ReleaseDeal>
      <DealReleaseReference>R0</DealReleaseReference>
      <Deal>
        <DealTerms>
          <CommercialModelType>SubscriptionModel</CommercialModelType>
          <UseType>OnDemandStream</UseType>
          <UseType>PermanentDownload</UseType>
          <TerritoryCode>Worldwide</TerritoryCode>
          <ValidityPeriod><StartDate>${xmlEscape(release.release_date ?? now.slice(0, 10))}</StartDate></ValidityPeriod>
        </DealTerms>
      </Deal>
    </ReleaseDeal>
  </DealList>
</ern:NewReleaseMessage>`
}
