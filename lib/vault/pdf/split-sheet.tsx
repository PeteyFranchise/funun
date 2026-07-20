// ─── Split Sheet — server-side PDF renderer ────────────────────────────
// Produces a real PDF file (not a browser print-to-PDF) using
// @react-pdf/renderer, cloning the structure/StyleSheet/footer of
// lib/vault/pdf/credits-sheet.tsx for consistent branding across all
// three generated PDFs. Called by the mint route (Plan 06) at unanimous-
// approval or fast-lane send time — never client-invoked.
//
// This module must run under the default Node runtime — renderToBuffer()
// depends on Node built-ins (fonts, buffers). NEVER add an Edge runtime
// export to any route that calls renderSplitSheet (RESEARCH Pitfall 6).
//
// Every party's signature line renders a literal DocuSeal signature
// text-tag (`{{Signature;role=PartyN;type=signature}}`) bound to that
// party's partyRoleTag(index). Because this renderer is the ONLY producer
// of the buffer submitted to DocuSeal's /templates/pdf API, and it only
// ever accepts structured split_sheets/split_sheet_parties DB state (never
// a client-supplied file), AM-2's "Funūn template only" guardrail holds by
// construction (RESEARCH Pattern 2, Security Domain).

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { PRO_LABELS, COMPOSER_ROLE_LABELS, type PRO, type ComposerRole } from '@/lib/metadata/schema'
import type { SplitSheetParty } from '@/lib/split-sheets/approval'
import { registerFunuunPdfFonts, PDF_FONT_FAMILY } from './fonts'

// Must run before any StyleSheet below is consumed by a render — see
// lib/vault/pdf/fonts.ts header comment (ESIGN-15 / P17-08). This is the
// ONLY font registration call in this file; do not call Font.register
// directly here.
registerFunuunPdfFonts()

// ─── Role tag helper ───────────────────────────────────────────────────

/**
 * Deterministic, DocuSeal-safe role identifier for the party at `index`
 * (Party1, Party2, …). Used both as the PDF's literal signature text tag
 * (`role=Party1`) and as the mint route's `submitters[].role` — the two
 * must agree exactly for DocuSeal to bind a submitter to their field.
 */
export function partyRoleTag(index: number): string {
  return `Party${index + 1}`
}

// ─── Styles (mirror credits-sheet scaffolding) ────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9,
    padding: 40,
    color: '#1a1a1a',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 16,
    borderBottom: '1pt solid #1a1a1a',
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
  },
  headerArtist: {
    fontSize: 11,
    marginTop: 2,
    color: '#444444',
  },
  headerMeta: {
    fontSize: 8,
    marginTop: 4,
    color: '#777777',
  },
  section: {
    marginBottom: 14,
  },
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
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    backgroundColor: '#fafafa',
  },
  colName: {
    flex: 2,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
  },
  colRole: {
    flex: 2,
    color: '#444444',
  },
  colPro: {
    flex: 2,
    color: '#444444',
  },
  colIpi: {
    flex: 2,
    color: '#666666',
  },
  colSplit: {
    flex: 1,
    textAlign: 'right',
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 6,
    paddingTop: 4,
  },
  totalLabel: {
    fontSize: 8,
    color: '#555555',
    marginRight: 6,
  },
  totalValue: {
    fontSize: 8,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
  },
  totalWarning: {
    fontSize: 8,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
    color: '#cc3300',
  },
  signatureSection: {
    marginTop: 20,
  },
  signatureBlock: {
    marginTop: 18,
    paddingTop: 6,
    borderTop: '0.5pt solid #cccccc',
  },
  signatureLabel: {
    fontSize: 8,
    color: '#444444',
    marginBottom: 4,
  },
  signatureLine: {
    fontSize: 10,
    fontFamily: PDF_FONT_FAMILY,
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

// ─── Display helpers ───────────────────────────────────────────────────

function proLabel(pro: string | null | undefined): string {
  if (!pro || pro === 'none') return '—'
  return PRO_LABELS[pro as PRO] ?? pro
}

function roleLabel(role: string | null | undefined): string {
  if (!role) return '—'
  return COMPOSER_ROLE_LABELS[role as ComposerRole] ?? role
}

// ─── Sub-components ───────────────────────────────────────────────────────

type PartyRowProps = {
  party: SplitSheetParty
  index: number
}

function PartyRow({ party, index }: PartyRowProps) {
  return (
    <View style={index % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}>
      <Text style={styles.colName}>{party.name}</Text>
      <Text style={styles.colRole}>{roleLabel(party.role)}</Text>
      <Text style={styles.colPro}>{proLabel(party.pro)}</Text>
      <Text style={styles.colIpi}>{party.ipi ?? '—'}</Text>
      <Text style={styles.colSplit}>{party.split_percentage}%</Text>
    </View>
  )
}

function PartySignatureBlock({ party, index }: PartyRowProps) {
  const tag = partyRoleTag(index)
  return (
    <View style={styles.signatureBlock}>
      <Text style={styles.signatureLabel}>
        {party.name} — {roleLabel(party.role)}
      </Text>
      {/* Literal DocuSeal PDF-API text tag — this is the ONLY place a
          signature field is defined. Funūn's renderer is therefore the
          sole path into DocuSeal's template API (AM-2 template-only). */}
      <Text style={styles.signatureLine}>{`{{Signature;role=${tag};type=signature}}`}</Text>
    </View>
  )
}

// ─── Document component (exported for testability) ───────────────────────

export type SplitSheetDocProps = {
  songName: string
  projectTitle?: string | null
  initiatorName?: string | null
  parties: SplitSheetParty[]
}

export function SplitSheetDocument({
  songName,
  projectTitle,
  initiatorName,
  parties,
}: SplitSheetDocProps) {
  const splitTotal = parties.reduce((sum, p) => sum + p.split_percentage, 0)
  const splitOk = parties.length === 0 || Math.abs(splitTotal - 100) < 0.01
  // Absent, empty, or whitespace-only initiator names must not render a
  // dangling "Prepared by " clause with nothing after it (P17-08 bug 2).
  const trimmedInitiator = (initiatorName ?? '').trim()
  const headerMetaText = trimmedInitiator
    ? `Split Sheet · Prepared by ${trimmedInitiator}`
    : 'Split Sheet'

  return (
    <Document title={`${songName} — Split Sheet`} author="Funūn">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{songName}</Text>
          {projectTitle ? <Text style={styles.headerArtist}>{projectTitle}</Text> : null}
          <Text style={styles.headerMeta}>{headerMetaText}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Collaborator</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Role</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>PRO</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>IPI / CAE</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Split</Text>
          </View>
          {parties.map((party, i) => (
            <PartyRow key={i} party={party} index={i} />
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={splitOk ? styles.totalValue : styles.totalWarning}>
              {splitTotal.toFixed(1)}%{!splitOk ? ' — does not total 100%' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.signatureSection}>
          {parties.map((party, i) => (
            <PartySignatureBlock key={i} party={party} index={i} />
          ))}
        </View>

        <Text style={styles.footer} fixed>
          Prepared with Funūn · Confidential — for licensing and registration use only
        </Text>
      </Page>
    </Document>
  )
}

// ─── Renderer (called by the mint route) ──────────────────────────────────

export type RenderSplitSheetInput = SplitSheetDocProps

/**
 * Render the split sheet as a PDF Buffer. Accepts only structured server
 * state (songName/projectTitle/initiatorName/parties) — never a
 * client-supplied file — so this is the sole path that can ever produce
 * the buffer the mint route submits to DocuSeal's PDF-template API.
 */
export async function renderSplitSheet(input: RenderSplitSheetInput): Promise<Buffer> {
  const doc = (
    <SplitSheetDocument
      songName={input.songName}
      projectTitle={input.projectTitle}
      initiatorName={input.initiatorName}
      parties={input.parties}
    />
  )
  return renderToBuffer(doc)
}
