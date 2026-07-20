// ─── Funūn Certificate of Completion — server-side PDF renderer ────────
// Funūn's OWN artist-facing record that a split sheet was fully executed
// (ESIGN-19, P17-10). Filed into Contract Locker by the completion
// webhook (17-07) alongside the executed PDF and the provider's audit log.
//
// ── THE HONESTY CONSTRAINT (read before changing this file) ────────────
//
// Funūn is not the signing provider. DocuSeal's audit log captures each
// signer's IP address, session id, user agent, timezone, and
// email-verification status. Funūn captured NONE of it — it arrives over
// a webhook as a report from a third party. This certificate may state
// those facts, and it must attribute them. It must never present them as
// evidence Funūn independently gathered, because this document can end up
// in a royalty dispute, and a certificate that implies Funūn observed
// what it merely received is a false evidentiary claim.
//
// That constraint is enforced STRUCTURALLY, not by convention. The input
// is two named groups — `funuunObserved` (facts from Funūn's own
// database) and `providerReported` (facts the provider told us) — and
// exactly ONE component, ProviderRecordSection, ever receives the
// providerReported group. To print an IP address in the execution summary
// a future contributor would first have to move the value across a type
// boundary, which is the moment they are meant to notice why it is there.
// Do NOT flatten these two groups into a single props bag; the separation
// IS the mitigation (T-17-30), and completion-certificate.test.ts asserts
// containment by walking the rendered tree.
//
// The provider's own certificate remains the authoritative evidence
// artifact. Funūn's certificate is the artist-facing summary that CITES
// it — by stored location, never by reproducing its contents. Both land
// in Contract Locker, which is what makes the citation checkable.
//
// Share vocabulary: this certificate reports the same single share
// dimension the executed agreement states (the approved template spec is
// songwriting/publishing-only, with master ownership expressly carved
// out — see lib/split-sheets/agreement.ts GUIDANCE_NOTES). It does not
// re-derive or reinterpret it.
//
// Runs under the default Node runtime only — renderToBuffer() depends on
// Node built-ins. NEVER add an Edge runtime export to a route that calls
// renderCompletionCertificate.

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { displayValue, displayLegalName } from '@/lib/split-sheets/agreement'
import { registerFunuunPdfFonts, PDF_FONT_FAMILY } from './fonts'

// Must run before any StyleSheet below is consumed by a render — see
// lib/vault/pdf/fonts.ts (ESIGN-15 / P17-08). Party legal names carry
// non-Latin-1 characters; a standard-14 WinAnsi fallback silently drops
// them ("Nikola Jokić" → "Nikola Joki").
registerFunuunPdfFonts()

// ─── Constants ──────────────────────────────────────────────────────────

/**
 * Marker on the single attributed provider-record region. Exported so the
 * containment test can locate that subtree and assert no provider-reported
 * value renders outside it.
 */
export const PROVIDER_RECORD_ID = 'provider-record'

/**
 * Scope + disclaimer, mirroring the executed agreement's own posture:
 * Funūn organizes documents, it does not determine rights and it does not
 * substitute for counsel.
 */
export const NOT_LEGAL_ADVICE_STATEMENT =
  'This certificate records the completion of a signing process. It is not legal advice, ' +
  'and it does not itself create, transfer, or determine any ownership interest.'

/**
 * The agreement's master-ownership carve-out, restated so the certificate
 * cannot be read as covering master rights it never governed.
 */
export const SCOPE_STATEMENT =
  'Songwriting and publishing shares only. Master ownership and master revenue splits, if any, ' +
  'are not determined by the underlying split sheet unless expressly stated in a separate ' +
  'written agreement.'

// ─── Input types — provenance is separated AT THE TYPE LEVEL ───────────

/** A party as recorded on Funūn's own split sheet. */
export type CertificateParty = {
  legalName: string
  /** Professional/stage name, rendered as "(p/k/a …)" when it differs. */
  professionalName?: string | null
  /**
   * The single share dimension the executed agreement states — the
   * songwriting/publishing split. Not re-derived, not flattened from
   * multiple dimensions: the approved document only ever had this one.
   */
  splitPercentage: number
  pro?: string | null
  publishingDesignee?: string | null
  administrator?: string | null
}

/**
 * Facts Funūn holds in its own database and can stand behind directly.
 * Anything in this group may render anywhere on the certificate.
 */
export type FunuunObservedFacts = {
  songName: string
  artistName?: string | null
  albumProjectTitle?: string | null
  /** Title of the linked vault project, when the sheet is attached to one. */
  projectTitle?: string | null
  recordLabel?: string | null
  /** Funūn's split_sheets.id — the identifier this certificate is about. */
  splitSheetId: string
  /** Contract Locker storage path of the executed PDF. */
  executedDocumentPath: string
  parties: CertificateParty[]
  /** Optional override of the default songwriting/publishing scope note. */
  rightsScope?: string | null
}

/**
 * How a signer's completion was produced. The provider labels these
 * distinctly, and the P17-01 fast lane produces 'api' completions — a
 * party who never sat in front of a signing session must not be presented
 * identically to one who did.
 */
export type CompletionMethod = 'interactive' | 'api'

/**
 * One signer AS REPORTED BY THE PROVIDER. Every field here arrived over a
 * webhook. Funūn observed none of it.
 */
export type ProviderReportedSigner = {
  name: string
  email: string
  /** ISO timestamp, or null when the provider has not reported one. */
  completedAt?: string | null
  completionMethod: CompletionMethod
  emailVerified?: boolean | null
  ipAddress?: string | null
  sessionId?: string | null
  userAgent?: string | null
  timezone?: string | null
}

/**
 * Facts the signing provider reported to Funūn. THIS GROUP HAS EXACTLY
 * ONE CONSUMER — ProviderRecordSection — and that is deliberate. See the
 * honesty constraint in this file's header before widening its use.
 */
export type ProviderReportedFacts = {
  /** Display name of the signing provider, e.g. "DocuSeal". */
  providerName: string
  /** The provider's submission/envelope identifier. */
  submissionId: string
  originalDocumentSha256?: string | null
  resultDocumentSha256?: string | null
  /** Contract Locker path of the provider's audit log — cited, not copied. */
  auditLogPath?: string | null
  signers: ProviderReportedSigner[]
}

export type CompletionCertificateInput = {
  funuunObserved: FunuunObservedFacts
  providerReported: ProviderReportedFacts
}

// ─── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9,
    padding: 40,
    paddingBottom: 64,
    color: '#1a1a1a',
    backgroundColor: '#ffffff',
  },
  titleBlock: {
    marginBottom: 18,
  },
  title: {
    fontSize: 19,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 11,
    color: '#555555',
    marginTop: 6,
    lineHeight: 1.3,
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 18,
    marginBottom: 8,
  },
  section: {
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  detailLabel: {
    flex: 1,
    fontSize: 9,
    color: '#666666',
  },
  detailValue: {
    flex: 2,
    fontSize: 9,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
  },
  // ─── Party table ────────────────────────────────────────────────────
  colParty: { flex: 3.4, paddingRight: 8 },
  colShare: { flex: 1.6, textAlign: 'right', paddingRight: 12 },
  colPro: { flex: 1.4 },
  colDesignee: { flex: 2 },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1pt solid #cccccc',
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: '#eeeeee',
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
    color: '#666666',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #e0e0e0',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    backgroundColor: '#fafafa',
  },
  rowCellBold: {
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
  },
  rowCellMuted: {
    color: '#444444',
  },
  namePka: {
    color: '#777777',
    fontWeight: 400,
  },
  scopeNote: {
    fontSize: 8,
    color: '#555555',
    lineHeight: 1.4,
    marginTop: 8,
  },
  // ─── Provider record region ─────────────────────────────────────────
  // Visually set apart on purpose: a reader must be able to see at a
  // glance where Funūn's own record stops and the provider's report
  // begins.
  providerRecord: {
    marginTop: 20,
    borderLeft: '2pt solid #818CF8',
    paddingLeft: 12,
    paddingVertical: 4,
  },
  providerHeading: {
    fontSize: 11,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
    marginBottom: 6,
  },
  attribution: {
    fontSize: 8,
    color: '#444444',
    lineHeight: 1.5,
    marginBottom: 4,
  },
  providerSubLabel: {
    fontSize: 8,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 6,
  },
  signerBlock: {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: '0.5pt solid #e8e8e8',
  },
  signerName: {
    fontSize: 9,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
    marginBottom: 3,
  },
  signerDetailRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  signerDetailLabel: {
    flex: 1.2,
    fontSize: 8,
    color: '#666666',
  },
  signerDetailValue: {
    flex: 2.4,
    fontSize: 8,
    color: '#222222',
  },
  hashValue: {
    fontSize: 7,
    color: '#222222',
    lineHeight: 1.4,
  },
  disclaimer: {
    fontSize: 8,
    color: '#555555',
    lineHeight: 1.4,
    marginTop: 16,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    borderTop: '0.5pt solid #cccccc',
    paddingTop: 4,
    fontSize: 7,
    color: '#aaaaaa',
    textAlign: 'center',
  },
})

// ─── Display helpers ────────────────────────────────────────────────────

function formatShare(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${Number(value.toFixed(3))}%`
}

/**
 * Formats a completion timestamp in UTC. UTC deliberately and explicitly
 * labelled: a completion time rendered in the rendering server's local
 * zone would be a different claim on every deploy region, on a document
 * whose whole purpose is recording when something happened. Returns an
 * em-dash for an absent or unparseable value rather than "Invalid Date".
 */
function formatCompletionTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const time = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  })
  return `${date} at ${time} UTC`
}

function completionMethodLabel(method: CompletionMethod, providerName: string): string {
  return method === 'api'
    ? `Completed via the ${providerName} API (no interactive signing session)`
    : `Signed interactively in a signing session`
}

function emailVerificationLabel(value: boolean | null | undefined): string {
  if (value === true) return 'Confirmed by the provider'
  if (value === false) return 'Not confirmed by the provider'
  return '—'
}

// ─── Sub-components: Funūn-observed surface ─────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

function PartyRow({ party, index }: { party: CertificateParty; index: number }) {
  const legal = party.legalName.trim()
  const professional = (party.professionalName ?? '').trim()
  const display = displayLegalName(legal, professional || legal)
  const pka = display !== legal ? professional : null

  return (
    <View style={index % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}>
      <Text style={[styles.colParty, styles.rowCellBold]}>
        {legal}
        {pka ? <Text style={styles.namePka}>{` (p/k/a ${pka})`}</Text> : null}
      </Text>
      <Text style={[styles.colShare, styles.rowCellBold]}>{formatShare(party.splitPercentage)}</Text>
      <Text style={[styles.colPro, styles.rowCellMuted]}>{displayValue(party.pro)}</Text>
      <Text style={[styles.colDesignee, styles.rowCellMuted]}>
        {displayValue(party.publishingDesignee)}
      </Text>
    </View>
  )
}

// ─── Sub-component: THE ONLY CONSUMER OF providerReported ──────────────

/**
 * Renders every fact the signing provider reported, and nothing else.
 *
 * This component is the enforcement point for the honesty constraint. It
 * is the sole place in the codebase that receives a ProviderReportedFacts
 * value, and everything it prints sits under a heading naming the
 * provider as the source. Do not lift any of these values out into the
 * Funūn-observed sections above — the containment test walks the rendered
 * tree and will fail, which is the intended outcome, not an obstacle.
 */
function ProviderRecordSection({ providerReported }: { providerReported: ProviderReportedFacts }) {
  const provider = providerReported.providerName

  return (
    <View style={styles.providerRecord} id={PROVIDER_RECORD_ID}>
      <Text style={styles.providerHeading}>
        {`Signing Provider Record — as reported by ${provider}`}
      </Text>

      <Text style={styles.attribution}>
        {`The execution, verification, and integrity details in this section were captured and reported by ${provider}, the signing provider used to execute this document. Funūn did not independently capture or observe them and does not present them as its own evidence.`}
      </Text>
      <Text style={styles.attribution}>
        {providerReported.auditLogPath
          ? `${provider}'s audit log is the underlying evidence record for these details. This certificate cites that record rather than reproducing it; it is filed alongside this certificate in Contract Locker at ${providerReported.auditLogPath}.`
          : `${provider}'s audit log is the underlying evidence record for these details. This certificate cites that record rather than reproducing it; its stored location has not yet been recorded.`}
      </Text>

      <Text style={styles.providerSubLabel}>{`Execution Summary (reported by ${provider})`}</Text>
      {providerReported.signers.map((signer, i) => (
        <View key={`exec-${i}`} style={styles.signerBlock} wrap={false}>
          <Text style={styles.signerName}>{`(${i + 1}) ${signer.name}`}</Text>
          <View style={styles.signerDetailRow}>
            <Text style={styles.signerDetailLabel}>Completed</Text>
            <Text style={styles.signerDetailValue}>
              {formatCompletionTimestamp(signer.completedAt)}
            </Text>
          </View>
          <View style={styles.signerDetailRow}>
            <Text style={styles.signerDetailLabel}>Method</Text>
            <Text style={styles.signerDetailValue}>
              {completionMethodLabel(signer.completionMethod, provider)}
            </Text>
          </View>
        </View>
      ))}

      <Text style={styles.providerSubLabel}>
        {`Verification Details (reported by ${provider})`}
      </Text>
      {providerReported.signers.map((signer, i) => (
        <View key={`verify-${i}`} style={styles.signerBlock} wrap={false}>
          <Text style={styles.signerName}>{`(${i + 1}) ${signer.name}`}</Text>
          <View style={styles.signerDetailRow}>
            <Text style={styles.signerDetailLabel}>Email address</Text>
            <Text style={styles.signerDetailValue}>{displayValue(signer.email)}</Text>
          </View>
          <View style={styles.signerDetailRow}>
            <Text style={styles.signerDetailLabel}>Email verification</Text>
            <Text style={styles.signerDetailValue}>
              {emailVerificationLabel(signer.emailVerified)}
            </Text>
          </View>
          <View style={styles.signerDetailRow}>
            <Text style={styles.signerDetailLabel}>IP address</Text>
            <Text style={styles.signerDetailValue}>{displayValue(signer.ipAddress)}</Text>
          </View>
          <View style={styles.signerDetailRow}>
            <Text style={styles.signerDetailLabel}>Session identifier</Text>
            <Text style={styles.signerDetailValue}>{displayValue(signer.sessionId)}</Text>
          </View>
          <View style={styles.signerDetailRow}>
            <Text style={styles.signerDetailLabel}>User agent</Text>
            <Text style={styles.signerDetailValue}>{displayValue(signer.userAgent)}</Text>
          </View>
          <View style={styles.signerDetailRow}>
            <Text style={styles.signerDetailLabel}>Time zone</Text>
            <Text style={styles.signerDetailValue}>{displayValue(signer.timezone)}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.providerSubLabel}>{`Document Integrity (reported by ${provider})`}</Text>
      <View style={styles.signerDetailRow}>
        <Text style={styles.signerDetailLabel}>Submission identifier</Text>
        <Text style={styles.signerDetailValue}>{displayValue(providerReported.submissionId)}</Text>
      </View>
      <View style={styles.signerDetailRow}>
        <Text style={styles.signerDetailLabel}>Original document SHA256</Text>
        <Text style={[styles.signerDetailValue, styles.hashValue]}>
          {displayValue(providerReported.originalDocumentSha256)}
        </Text>
      </View>
      <View style={styles.signerDetailRow}>
        <Text style={styles.signerDetailLabel}>Executed document SHA256</Text>
        <Text style={[styles.signerDetailValue, styles.hashValue]}>
          {displayValue(providerReported.resultDocumentSha256)}
        </Text>
      </View>
    </View>
  )
}

// ─── Document component (exported for testability) ─────────────────────

export function CompletionCertificateDocument({
  funuunObserved,
  providerReported,
}: CompletionCertificateInput) {
  const {
    songName,
    artistName,
    albumProjectTitle,
    projectTitle,
    recordLabel,
    splitSheetId,
    executedDocumentPath,
    parties,
    rightsScope,
  } = funuunObserved

  return (
    <Document title={`${songName} — Certificate of Completion`} author="Funūn">
      <Page size="A4" style={styles.page}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Funūn Certificate of Completion</Text>
          <Text style={styles.subtitle}>Songwriter and Publishing Split Sheet — Fully Executed</Text>
        </View>

        {/* ── Funūn-observed: the work ─────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Work</Text>
          <DetailRow label="Composition Title" value={songName} />
          <DetailRow label="Artist Name" value={displayValue(artistName)} />
          <DetailRow label="Album / Project Title" value={displayValue(albumProjectTitle)} />
          <DetailRow label="Linked Funūn Project" value={displayValue(projectTitle)} />
          <DetailRow label="Record Label" value={displayValue(recordLabel)} />
        </View>

        {/* ── Funūn-observed: the parties and their shares ─────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Parties and Shares</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colParty]}>Party Legal Name</Text>
            <Text style={[styles.tableHeaderCell, styles.colShare]}>
              Songwriting / Publishing Split
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colPro]}>PRO / Society</Text>
            <Text style={[styles.tableHeaderCell, styles.colDesignee]}>Publishing Designee</Text>
          </View>
          {parties.map((party, i) => (
            <PartyRow key={i} party={party} index={i} />
          ))}
          <Text style={styles.scopeNote}>{rightsScope?.trim() || SCOPE_STATEMENT}</Text>
        </View>

        {/* ── Funūn-observed: Funūn's own record locators ──────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Funūn Record</Text>
          <DetailRow label="Split Sheet Identifier" value={splitSheetId} />
          <DetailRow label="Executed Document" value={executedDocumentPath} />
        </View>

        {/* ── Everything below is the PROVIDER's report, attributed ─
            ProviderRecordSection is the only consumer of the
            providerReported group. See this file's header. */}
        <ProviderRecordSection providerReported={providerReported} />

        <Text style={styles.disclaimer}>{NOT_LEGAL_ADVICE_STATEMENT}</Text>

        <Text style={styles.footer} fixed>
          Issued by Funūn · Confidential — for licensing and registration use only
        </Text>
      </Page>
    </Document>
  )
}

// ─── Renderer (called by the completion webhook, 17-07) ────────────────

/**
 * Renders the Funūn Certificate of Completion as a PDF Buffer. Pure and
 * credential-free: it takes structured completion data and returns bytes,
 * touching no network and no provider API.
 */
export async function renderCompletionCertificate(
  input: CompletionCertificateInput
): Promise<Buffer> {
  return renderToBuffer(<CompletionCertificateDocument {...input} />)
}
