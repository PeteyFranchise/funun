// ─── Blanket Agreement — server-side PDF renderer ──────────────────────
// Sibling to split-sheet.tsx (Phase 26, SYNCLIB-06). Renders the CURRENT
// versioned/swappable blanket-agreement template (lib/sync-library/
// agreement.ts) plus the signing artist's identity and a SINGLE signature
// block. Single-signer only (Assumption A1) — no Funūn countersignature
// field; the mint route's one signer (partyRoleTag(0) → "Party1") binds to
// the one field this renderer embeds.
//
// MUST import and call registerFunuunPdfFonts() (Unicode safety). This is
// the ONLY font registration call in this file — do not call Font.register
// directly here. Skipping this reintroduces the P17-08 bug where "Funūn"
// rendered as "Funkn" (ESIGN-15): @react-pdf/renderer's standard-14 fonts
// use WinAnsi encoding, which corrupts any character outside Latin-1.
//
// This module runs under the default Node runtime only — renderToBuffer()
// depends on Node built-ins (fonts, buffers). NEVER add an Edge runtime
// export to a route that calls renderBlanketAgreement.

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { partyRoleTag } from './split-sheet'
import { registerFunuunPdfFonts, PDF_FONT_FAMILY } from './fonts'
import { getCurrentBlanketAgreement } from '@/lib/sync-library/agreement'

// Must run before any StyleSheet below is consumed by a render — see
// lib/vault/pdf/fonts.ts header comment (ESIGN-15 / P17-08).
registerFunuunPdfFonts()

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9,
    padding: 40,
    color: '#1a1a1a',
    backgroundColor: '#ffffff',
  },
  titleBlock: {
    marginBottom: 20,
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
  versionTag: {
    fontSize: 8,
    color: '#999999',
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 6,
  },
  section: {
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 9,
    lineHeight: 1.5,
    color: '#333333',
    marginBottom: 6,
  },
  workDetailsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  workDetailsLabel: {
    flex: 1,
    fontSize: 9,
    color: '#666666',
  },
  workDetailsValue: {
    flex: 2,
    fontSize: 9,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
  },
  signatureBlock: {
    marginTop: 18,
    paddingTop: 12,
    borderTop: '0.5pt solid #cccccc',
  },
  signatureHeader: {
    fontSize: 11,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
    marginBottom: 8,
  },
  signatureFieldsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  signatureFieldBlock: {
    width: '46%',
  },
  signatureFieldTag: {
    fontSize: 9,
    fontFamily: PDF_FONT_FAMILY,
  },
  signatureFieldCaptionWrap: {
    borderTop: '0.5pt solid #999999',
    marginTop: 6,
    paddingTop: 3,
  },
  signatureFieldCaption: {
    fontSize: 7,
    color: '#999999',
    textTransform: 'uppercase',
    letterSpacing: 1,
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

// ─── Sub-components ─────────────────────────────────────────────────────

function WorkDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.workDetailsRow}>
      <Text style={styles.workDetailsLabel}>{label}</Text>
      <Text style={styles.workDetailsValue}>{value}</Text>
    </View>
  )
}

/**
 * Formats the signature-presentation date. Parsed/formatted in UTC — a
 * date-only ISO string parses as UTC midnight, and local-timezone
 * formatting can shift it a day. Mirrors split-sheet.tsx's
 * formatAgreementDate exactly (decision 4/5 precedent).
 */
function formatAgreementDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// ─── Document component (exported for testability) ───────────────────────

export type BlanketAgreementDocProps = {
  /** The signing artist's display/legal name. */
  artistName: string
  /** The Funūn account email the artist signs under. */
  artistEmail: string
  /** Date the agreement is presented for signature (em-dash when absent). */
  agreementDate?: string | Date | null
}

export function BlanketAgreementDocument({
  artistName,
  artistEmail,
  agreementDate,
}: BlanketAgreementDocProps) {
  const { title, version, sections } = getCurrentBlanketAgreement()
  // Single-signer only (Assumption A1) — no Funūn countersignature field.
  const tag = partyRoleTag(0)

  return (
    <Document title={title} author="Funūn">
      <Page size="A4" style={styles.page}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Sync Library Representation &amp; Shopping Authorization</Text>
          <Text style={styles.versionTag}>{`Version ${version}`}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Artist</Text>
          <WorkDetailRow label="Name" value={artistName} />
          <WorkDetailRow label="Email" value={artistEmail} />
          <WorkDetailRow label="Date" value={formatAgreementDate(agreementDate)} />
        </View>

        {sections.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.heading}</Text>
            {section.paragraphs.map((paragraph, j) => (
              <Text key={j} style={styles.paragraph}>{paragraph}</Text>
            ))}
          </View>
        ))}

        <View style={styles.signatureBlock} wrap={false}>
          <Text style={styles.signatureHeader}>Signature</Text>
          <WorkDetailRow label="Artist" value={artistName} />

          <View style={styles.signatureFieldsRow}>
            <View style={styles.signatureFieldBlock}>
              {/* Literal DocuSeal PDF-API text tag — the ONLY signature
                  field on this document (single-signer, Assumption A1).
                  Must match the mint route's submitters[].role exactly. */}
              <Text style={styles.signatureFieldTag}>{`{{Signature;role=${tag};type=signature}}`}</Text>
              <View style={styles.signatureFieldCaptionWrap}>
                <Text style={styles.signatureFieldCaption}>Signature</Text>
              </View>
            </View>
            <View style={styles.signatureFieldBlock}>
              <Text style={styles.signatureFieldTag}>{`{{Date;role=${tag};type=date}}`}</Text>
              <View style={styles.signatureFieldCaptionWrap}>
                <Text style={styles.signatureFieldCaption}>Date</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Prepared with Funūn · Confidential — Sync Library Agreement
        </Text>
      </Page>
    </Document>
  )
}

// ─── Renderer (called by the mint route) ──────────────────────────────────

/**
 * Render the blanket agreement as a PDF Buffer. Accepts only the signing
 * artist's identity — the agreement's own copy always comes from
 * getCurrentBlanketAgreement(), never a caller-supplied override, so a
 * client can never smuggle alternate legal language into the document
 * submitted to DocuSeal's PDF-template API.
 */
export async function renderBlanketAgreement(input: BlanketAgreementDocProps): Promise<Buffer> {
  const doc = <BlanketAgreementDocument {...input} />
  return renderToBuffer(doc)
}
