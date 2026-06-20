// ─── DDEX RDR-N export (neighbouring-rights claim) ───────────────────
// Builds a best-effort DeclarationOfSoundRecordingRightsClaimMessage from a
// release bundle's recording + performer data, for registering masters with
// music licensing companies (SoundExchange / PPL …). NOT a certified RDR-N
// package — validate against the normative RDR-N XSD and route submission
// through a partner (RDx / aggregator). See docs/ddex-rdr-compliance.md.
import { artistCredit } from '@/lib/metadata/schema'
import type { ReleaseBundle, TrackMeta } from '@/lib/metadata/export'

const PLACEHOLDER_DPID = 'PADPIDA0000000000Z'

function esc(v: string | null | undefined): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function iso8601Duration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `PT${m}M${s}S`
}

const ORIGINAL_PURPOSE_AVS: Record<string, string> = {
  general: 'GeneralRelease',
  library: 'LibraryMusic',
  commissioned: 'SpeciallyCommissioned',
}

function soundRecording(release: ReleaseBundle, t: TrackMeta, i: number): string {
  const ref = `A${i + 1}`
  const rec = t.recording
  const displayArtist = artistCredit(release.artistName, t.featuring_artists)
  const rightsOwner = release.rights.label?.trim() || release.artistName

  const contributors = t.performers
    .map(
      p =>
        `      <ResourceContributor>
        <PartyName><FullName>${esc(p.name)}</FullName></PartyName>${
          p.isni ? `\n        <PartyId IsISNI="true">${esc(p.isni)}</PartyId>` : ''
        }${p.ipn ? `\n        <PartyId IsIpn="true">${esc(p.ipn)}</PartyId>` : ''}
        <ResourceContributorRole>${p.role === 'featured' ? 'FeaturedArtist' : 'Performer'}</ResourceContributorRole>${
          p.contribution ? `\n        <InstrumentType>${esc(p.contribution)}</InstrumentType>` : ''
        }
      </ResourceContributor>`
    )
    .join('\n')

  const recBits = [
    rec?.recordingDate ? `      <CreationDate>${esc(rec.recordingDate)}</CreationDate>` : '',
    rec?.recordingCountry ? `      <CountryOfCommissioning>${esc(rec.recordingCountry)}</CountryOfCommissioning>` : '',
    rec?.originalPurpose ? `      <OriginalPurpose>${ORIGINAL_PURPOSE_AVS[rec.originalPurpose] ?? 'GeneralRelease'}</OriginalPurpose>` : '',
    rec?.commerciallyAvailable !== undefined
      ? `      <CommercialAvailability>${rec.commerciallyAvailable ? 'true' : 'false'}</CommercialAvailability>`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  return `    <SoundRecording>
      <ResourceReference>${ref}</ResourceReference>
      <Type>MusicalWorkSoundRecording</Type>
      <SoundRecordingId><ISRC>${esc(t.isrc)}</ISRC></SoundRecordingId>
      <ReferenceTitle><TitleText>${esc(t.title)}</TitleText></ReferenceTitle>
      <Duration>${iso8601Duration(t.duration_seconds)}</Duration>
      <DisplayArtistName>${esc(displayArtist)}</DisplayArtistName>
${recBits ? recBits + '\n' : ''}${contributors ? contributors + '\n' : ''}      <RightsClaim>
        <RightsController>
          <PartyName><FullName>${esc(rightsOwner)}</FullName></PartyName>
          <RightsControllerRole>RightsController</RightsControllerRole>
        </RightsController>
        <RightShareUnknown>false</RightShareUnknown>
        <TerritoryCode>Worldwide</TerritoryCode>
        <RightsType>MakeAvailableRight</RightsType>
      </RightsClaim>
    </SoundRecording>`
}

export function buildRdrN(release: ReleaseBundle): string {
  const now = new Date().toISOString()
  const start = release.release_date || now.slice(0, 10)
  const resources = release.tracks.map((t, i) => soundRecording(release, t, i)).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Best-effort DDEX RDR-N (Recording Data and Rights) sound-recording rights
     claim, from Funūn. Validate against the normative RDR-N XSD and route via a
     partner (RDx / aggregator) before submission. Replace the placeholder DPID
     with a registered DDEX Party ID. -->
<rdrn:DeclarationOfSoundRecordingRightsClaimMessage xmlns:rdrn="http://ddex.net/xml/rdrn/15" MessageSchemaVersionId="rdrn/15" LanguageAndScriptCode="en" RightsStatementProfile="Recommended">
  <MessageHeader>
    <MessageThreadId>${esc(release.releaseTitle)}</MessageThreadId>
    <MessageId>FUNUN-RDR-${Date.now()}</MessageId>
    <MessageSender>
      <PartyId>${PLACEHOLDER_DPID}</PartyId>
      <PartyName><FullName>${esc(release.rights.label ?? release.artistName)}</FullName></PartyName>
    </MessageSender>
    <MessageRecipient><PartyId>${PLACEHOLDER_DPID}</PartyId></MessageRecipient>
    <MessageCreatedDateTime>${now}</MessageCreatedDateTime>
  </MessageHeader>
  <MessageNotificationPeriod>
    <StartDate>${esc(start)}</StartDate>
  </MessageNotificationPeriod>
  <ResourceList>
${resources}
  </ResourceList>
</rdrn:DeclarationOfSoundRecordingRightsClaimMessage>`
}
