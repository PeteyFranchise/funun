// ─── DDEX RDR-N export (neighbouring-rights claim) ───────────────────
// Builds a DeclarationOfSoundRecordingRightsClaimMessage in the DDEX MLC
// (Music Licensing Companies) schema — namespace mlc/131 — the schema that
// houses the RDR-N messages, for registering masters with music licensing
// companies (SoundExchange / PPL …). Validated against the normative MLC 1.31
// XSD. NOT a certified package — route submission via a partner (RDx /
// aggregator). See docs/ddex-rdr-compliance.md.
import { artistCredit } from '@/lib/metadata/schema'
import type { ReleaseBundle, TrackMeta } from '@/lib/metadata/export'

const PLACEHOLDER_DPID = 'PADPIDA0000000000Z'
const DPID = process.env.DDEX_DPID || PLACEHOLDER_DPID

function esc(v: string | null | undefined): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function iso8601Duration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return 'PT0M0S'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `PT${m}M${s}S`
}

function soundRecording(release: ReleaseBundle, t: TrackMeta, i: number): string {
  const ref = `A${i + 1}`
  const displayArtist = artistCredit(release.artistName, t.featuring_artists)
  const rightsOwner = release.rights.label?.trim() || release.artistName
  const year = release.rights.copyright_year ?? (release.release_date ? new Date(release.release_date).getUTCFullYear() : new Date().getUTCFullYear())

  // Performers → FeaturedArtist / NonFeaturedArtist composites (mlc:Artist).
  const performers = t.performers
    .map(p => {
      const tag = p.role === 'featured' ? 'FeaturedArtist' : 'NonFeaturedArtist'
      return `        <${tag}><PartyName><FullName>${esc(p.name)}</FullName></PartyName></${tag}>`
    })
    .join('\n')

  return `    <SoundRecording>
      <SoundRecordingType>MusicalWorkSoundRecording</SoundRecordingType>
      <SoundRecordingId><ISRC>${esc(t.isrc ?? '')}</ISRC></SoundRecordingId>
      <ResourceReference>${ref}</ResourceReference>
      <ReferenceTitle><TitleText>${esc(t.title)}</TitleText></ReferenceTitle>
      <Duration>${iso8601Duration(t.duration_seconds)}</Duration>
      <SoundRecordingDetailsByTerritory>
        <TerritoryCode>Worldwide</TerritoryCode>
        <Title TitleType="DisplayTitle"><TitleText>${esc(t.title)}</TitleText></Title>
        <DisplayArtist><PartyName><FullName>${esc(displayArtist)}</FullName></PartyName><ArtistRole>MainArtist</ArtistRole></DisplayArtist>
${performers ? performers + '\n' : ''}        <LabelName>${esc(rightsOwner)}</LabelName>
        <RightsController>
          <PartyName><FullName>${esc(rightsOwner)}</FullName></PartyName>
          <RightsControllerRole>RightsController</RightsControllerRole>
          <RightSharePercentage>100</RightSharePercentage>
          <RightsControllerType>OriginalOwner</RightsControllerType>
          <DelegatedUsageRights>
            <UseType>OnDemandStream</UseType>
            <PeriodOfRightsDelegation><StartDate>${esc((release.release_date || new Date().toISOString()).slice(0, 10))}</StartDate></PeriodOfRightsDelegation>
            <TerritoryOfRightsDelegation>Worldwide</TerritoryOfRightsDelegation>
          </DelegatedUsageRights>
        </RightsController>
        <PLine><Year>${year}</Year><PLineText>${esc(release.rights.p_line ?? `${year} ${rightsOwner}`)}</PLineText></PLine>
      </SoundRecordingDetailsByTerritory>
    </SoundRecording>`
}

export function buildRdrN(release: ReleaseBundle): string {
  const now = new Date().toISOString()
  const label = release.rights.label?.trim() || release.artistName
  const resources = release.tracks.map((t, i) => soundRecording(release, t, i)).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- DDEX RDR-N (Recording Data and Rights) sound-recording rights claim, in the
     MLC 1.31 schema, from Funūn. Validated against the normative MLC XSD. Replace
     the placeholder DPID with a registered DDEX Party ID and route via a partner
     (RDx / aggregator) before submission. -->
<mlc:DeclarationOfSoundRecordingRightsClaimMessage xmlns:mlc="http://ddex.net/xml/mlc/131" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ddex.net/xml/mlc/131 http://service.ddex.net/xml/mlc/131/music-licensing-companies.xsd" LanguageAndScriptCode="en">
  <MessageHeader>
    <MessageThreadId>FUNUN-RDR-${Date.now()}</MessageThreadId>
    <MessageId>FUNUN-RDR-${Date.now()}</MessageId>
    <MessageSender>
      <PartyId>${DPID}</PartyId>
      <PartyName><FullName>${esc(label)}</FullName></PartyName>
    </MessageSender>
    <MessageRecipient>
      <PartyId>${PLACEHOLDER_DPID}</PartyId>
      <PartyName><FullName>Music Licensing Company</FullName></PartyName>
    </MessageRecipient>
    <MessageCreatedDateTime>${now}</MessageCreatedDateTime>
  </MessageHeader>
  <ResourceList>
${resources}
  </ResourceList>
</mlc:DeclarationOfSoundRecordingRightsClaimMessage>`
}
