// ─── Split Sheet — server-side PDF renderer ────────────────────────────
// Produces a real PDF file (not a browser print-to-PDF) using
// @react-pdf/renderer. Rebuilt from a bare table into an agreement
// (ESIGN-16, P17-09) per the approved template spec:
// .planning/phases/17-split-sheet-esign/17-SPLIT-SHEET-TEMPLATE-SPEC.md —
// itself sourced from the original "SONGWRITER/PUBLISHING SPLITS
// AGREEMENT" contract. Structure, column set, and operative wording all
// follow that spec; do not diverge from it without a fresh Pete review.
//
// Called by the mint route (Plan 06) at unanimous-approval or fast-lane
// send time — never client-invoked.
//
// This module must run under the default Node runtime — renderToBuffer()
// depends on Node built-ins (fonts, buffers). NEVER add an Edge runtime
// export to any route that calls renderSplitSheet (RESEARCH Pitfall 6).
//
// Every party's signature block renders a literal DocuSeal signature
// text-tag (`{{Signature;role=PartyN;type=signature}}`) AND a literal
// DocuSeal date text-tag (`{{Date;role=PartyN;type=date}}`), both bound to
// that party's partyRoleTag(index). Because this renderer is the ONLY
// producer of the buffer submitted to DocuSeal's /templates/pdf API, and
// it only ever accepts structured split_sheets/split_sheet_parties DB
// state (never a client-supplied file), AM-2's "Funūn template only"
// guardrail holds by construction (RESEARCH Pattern 2, Security Domain).

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { PRO_LABELS, type PRO } from '@/lib/metadata/schema'
import type { SplitSheetParty } from '@/lib/split-sheets/approval'
import { AGREEMENT_CLAUSES, GUIDANCE_NOTES, displayValue } from '@/lib/split-sheets/agreement'
import { registerFunuunPdfFonts, PDF_FONT_FAMILY } from './fonts'

// Must run before any StyleSheet below is consumed by a render — see
// lib/vault/pdf/fonts.ts header comment (ESIGN-15 / P17-08). This is the
// ONLY font registration call in this file; do not call Font.register
// directly here.
registerFunuunPdfFonts()

// ─── Role tag helper ───────────────────────────────────────────────────

/**
 * Deterministic, DocuSeal-safe role identifier for the party at `index`
 * (Party1, Party2, …). Used both as the PDF's literal signature/date text
 * tags (`role=Party1`) and as the mint route's `submitters[].role` — the
 * two must agree exactly for DocuSeal to bind a submitter to their fields.
 */
export function partyRoleTag(index: number): string {
  return `Party${index + 1}`
}

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
  // fontSize 19 is large enough that the page's default lineHeight (1.5,
  // inherited implicitly by any Text without its own override) collapses
  // the title's line box short of its actual glyph height, so the
  // subtitle beneath it overlaps. Every other renderer's header is
  // smaller and never hit this — the explicit lineHeight here is
  // load-bearing, not decorative. See the title/subtitle overlap
  // regression test in split-sheet.test.ts.
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
    marginTop: 20,
    marginBottom: 8,
  },
  section: {
    marginBottom: 4,
  },
  // ─── Work Details ──────────────────────────────────────────────────
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
  // ─── Split Breakdown table ─────────────────────────────────────────
  // Column widths tuned to fit the "Legal Name (p/k/a Stage)" notation
  // without orphaning — do not rebalance without re-checking a 3+ party
  // sheet with long legal names and p/k/a suffixes.
  colName: { flex: 3.4, paddingRight: 8 },
  // paddingRight keeps the right-aligned split % off the PRO column —
  // without it the money column reads as "45%ASCAP (US)" (approved preview).
  colSplit: { flex: 0.9, textAlign: 'right', paddingRight: 12 },
  colPro: { flex: 1.45 },
  colDesignee: { flex: 2 },
  colAdmin: { flex: 1.8 },
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
  // ─── Agreement ───────────────────────────────────────────────────────
  agreementParagraph: {
    fontSize: 9,
    lineHeight: 1.5,
    color: '#333333',
    marginBottom: 8,
  },
  // ─── Writer Signature Details ────────────────────────────────────────
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
  signatureDetailRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  signatureDetailLabel: {
    flex: 1,
    fontSize: 8,
    color: '#666666',
  },
  signatureDetailValue: {
    flex: 2,
    fontSize: 9,
    fontFamily: PDF_FONT_FAMILY,
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
  // ─── Guidance Notes ──────────────────────────────────────────────────
  guidanceBox: {
    marginTop: 8,
    borderLeft: '2pt solid #818CF8',
    paddingLeft: 10,
    paddingVertical: 2,
  },
  guidanceNote: {
    fontSize: 8,
    color: '#555555',
    lineHeight: 1.4,
    marginBottom: 8,
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

/**
 * Splits a party into its bold "legal name" portion and, when a distinct
 * professional/stage name is on file, the muted "p/k/a X" suffix — the
 * two are rendered with different weights in the Split Breakdown table
 * (decision 6). Falls back to the professional name when no legal_name
 * has been captured (pre-063 legacy row, or simply not yet entered).
 */
function partyLegalName(party: SplitSheetParty): { legal: string; pka: string | null } {
  const legal = (party.legal_name ?? '').trim()
  const professional = party.name.trim()
  if (!legal) return { legal: professional, pka: null }
  if (legal === professional) return { legal, pka: null }
  return { legal, pka: professional }
}

/**
 * Formats the agreement/execution date for the Work Details "Date" row.
 * Parsed and formatted in UTC deliberately — a date-only ISO string
 * ("2026-07-20") parses as UTC midnight, and formatting in the local
 * system timezone can shift it a day in either direction depending on
 * offset. Returns an em-dash when absent/invalid (decision 4/5 — a sheet
 * that has not yet been fully executed has no date yet).
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

// ─── Sub-components ───────────────────────────────────────────────────────

function WorkDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.workDetailsRow}>
      <Text style={styles.workDetailsLabel}>{label}</Text>
      <Text style={styles.workDetailsValue}>{value}</Text>
    </View>
  )
}

type PartyRowProps = {
  party: SplitSheetParty
  index: number
}

function PartyRow({ party, index }: PartyRowProps) {
  const { legal, pka } = partyLegalName(party)
  return (
    <View style={index % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}>
      <Text style={[styles.colName, styles.rowCellBold]}>
        {legal}
        {pka ? <Text style={styles.namePka}>{` (p/k/a ${pka})`}</Text> : null}
      </Text>
      <Text style={[styles.colSplit, styles.rowCellBold]}>{party.split_percentage}%</Text>
      <Text style={[styles.colPro, styles.rowCellMuted]}>{proLabel(party.pro)}</Text>
      <Text style={[styles.colDesignee, styles.rowCellMuted]}>{displayValue(party.publishing_designee)}</Text>
      <Text style={[styles.colAdmin, styles.rowCellMuted]}>{displayValue(party.administrator)}</Text>
    </View>
  )
}

function PartySignatureBlock({ party, index }: PartyRowProps) {
  const tag = partyRoleTag(index)
  const { legal, pka } = partyLegalName(party)
  const headerName = pka ? `${legal} (p/k/a ${pka})` : legal

  return (
    // wrap={false} — a signature block (name, locked PRO/designee/admin
    // text, and the two DocuSeal tag lines) must never split across a
    // page boundary; a party's signature line separated from their name
    // by a page break is exactly the ambiguity this rebuild exists to
    // remove.
    <View style={styles.signatureBlock} wrap={false}>
      <Text style={styles.signatureHeader}>{`(${index + 1}) ${headerName}`}</Text>

      <View style={styles.signatureDetailRow}>
        <Text style={styles.signatureDetailLabel}>PRO / Society</Text>
        <Text style={styles.signatureDetailValue}>{proLabel(party.pro)}</Text>
      </View>
      <View style={styles.signatureDetailRow}>
        <Text style={styles.signatureDetailLabel}>Publishing Designee</Text>
        <Text style={styles.signatureDetailValue}>{displayValue(party.publishing_designee)}</Text>
      </View>
      <View style={styles.signatureDetailRow}>
        <Text style={styles.signatureDetailLabel}>Administrator</Text>
        <Text style={styles.signatureDetailValue}>{displayValue(party.administrator)}</Text>
      </View>

      <View style={styles.signatureFieldsRow}>
        <View style={styles.signatureFieldBlock}>
          {/* Literal DocuSeal PDF-API text tag — this is the ONLY place a
              signature field is defined. Funūn's renderer is therefore
              the sole path into DocuSeal's template API (AM-2). */}
          <Text style={styles.signatureFieldTag}>{`{{Signature;role=${tag};type=signature}}`}</Text>
          <View style={styles.signatureFieldCaptionWrap}>
            <Text style={styles.signatureFieldCaption}>Signature</Text>
          </View>
        </View>
        <View style={styles.signatureFieldBlock}>
          {/* Literal DocuSeal date text tag — new in this rebuild, the
              source contract's "Date:______" beside every signature. */}
          <Text style={styles.signatureFieldTag}>{`{{Date;role=${tag};type=date}}`}</Text>
          <View style={styles.signatureFieldCaptionWrap}>
            <Text style={styles.signatureFieldCaption}>Date</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

// ─── Document component (exported for testability) ───────────────────────

export type SplitSheetDocProps = {
  /** Composition Title. */
  songName: string
  /** Work Details "Artist Name". Optional (decision 4) — em-dash when absent. */
  artistName?: string | null
  /** Work Details "Album / Project Title". Optional — em-dash when absent. */
  albumProjectTitle?: string | null
  /**
   * @deprecated legacy alias for albumProjectTitle, kept for backward
   * compatibility with pre-spec callers that passed the linked
   * vault_projects title directly. Used as a fallback only when
   * albumProjectTitle is not supplied.
   */
  projectTitle?: string | null
  /** Work Details "Record Label". Optional — em-dash when absent. */
  recordLabel?: string | null
  /**
   * Execution date (decision 5 — the date of full execution, stamped
   * when the final signature lands). Accepts an ISO date string or a
   * Date; renders as an em-dash when not yet known.
   */
  agreementDate?: string | Date | null
  /** Preparer clause — only rendered when a non-blank name is present
   * (P17-08 bug 2 fix, preserved by this rebuild). */
  initiatorName?: string | null
  parties: SplitSheetParty[]
}

export function SplitSheetDocument({
  songName,
  artistName,
  albumProjectTitle,
  projectTitle,
  recordLabel,
  agreementDate,
  initiatorName,
  parties,
}: SplitSheetDocProps) {
  const resolvedAlbumTitle = albumProjectTitle ?? projectTitle ?? null
  // Absent, empty, or whitespace-only initiator names must not render a
  // dangling "Prepared by" row with nothing after it (P17-08 bug 2) — the
  // row is omitted entirely rather than shown with an em-dash, since
  // "prepared by —" would be a stranger claim than simply not printing it.
  const trimmedInitiator = (initiatorName ?? '').trim()

  const splitTotal = parties.reduce((sum, p) => sum + p.split_percentage, 0)
  const splitOk = parties.length === 0 || Math.abs(splitTotal - 100) < 0.01

  return (
    <Document title={`${songName} — Split Sheet`} author="Funūn">
      <Page size="A4" style={styles.page}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Split Sheet powered by Funūn</Text>
          <Text style={styles.subtitle}>Songwriter and Publishing Split Confirmation</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Work Details</Text>
          <WorkDetailRow label="Date" value={formatAgreementDate(agreementDate)} />
          <WorkDetailRow label="Composition Title" value={songName} />
          <WorkDetailRow label="Artist Name" value={displayValue(artistName)} />
          <WorkDetailRow label="Album / Project Title" value={displayValue(resolvedAlbumTitle)} />
          <WorkDetailRow label="Record Label" value={displayValue(recordLabel)} />
          {trimmedInitiator ? (
            <WorkDetailRow label="Prepared by" value={`${trimmedInitiator} · sent through Funūn`} />
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Split Breakdown</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colName]}>Writer Legal Name</Text>
            <Text style={[styles.tableHeaderCell, styles.colSplit]}>Split %</Text>
            <Text style={[styles.tableHeaderCell, styles.colPro]}>PRO / Society</Text>
            <Text style={[styles.tableHeaderCell, styles.colDesignee]}>Publishing Designee</Text>
            <Text style={[styles.tableHeaderCell, styles.colAdmin]}>Administrator</Text>
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

        <View>
          <Text style={styles.sectionLabel}>Agreement</Text>
          {AGREEMENT_CLAUSES.map((clause, i) => (
            <Text key={i} style={styles.agreementParagraph}>{clause}</Text>
          ))}
        </View>

        <View>
          <Text style={styles.sectionLabel}>Writer Signature Details</Text>
          {parties.map((party, i) => (
            <PartySignatureBlock key={i} party={party} index={i} />
          ))}
        </View>

        <View>
          <Text style={styles.sectionLabel}>Guidance Notes</Text>
          <View style={styles.guidanceBox}>
            {GUIDANCE_NOTES.map((note, i) => (
              <Text key={i} style={styles.guidanceNote}>{note}</Text>
            ))}
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Prepared with Funūn · Confidential — for licensing and registration use only
        </Text>
      </Page>
    </Document>
  )
}

// ─── Renderer (called by the mint route) ──────────────────────────────────

export type SplitSheetAgreementInput = SplitSheetDocProps
export type RenderSplitSheetInput = SplitSheetAgreementInput

/**
 * Render the split sheet as a PDF Buffer. Accepts only structured server
 * state — never a client-supplied file — so this is the sole path that
 * can ever produce the buffer the mint route submits to DocuSeal's
 * PDF-template API.
 */
export async function renderSplitSheet(input: RenderSplitSheetInput): Promise<Buffer> {
  const doc = <SplitSheetDocument {...input} />
  return renderToBuffer(doc)
}
