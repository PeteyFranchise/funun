// ─── Metadata Sheet — server-side PDF renderer ────────────────────────
// Produces a real PDF file (not a browser print-to-PDF) using
// @react-pdf/renderer. Called by the export route (Plan 06) to bundle the
// metadata.pdf into the ZIP archive.
//
// Field set mirrors the onesheet's TRACK_COLS selection:
// ISRC, ISWC, BPM, key signature, language, duration (D-10).

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import type { ExportManifest, ExportTrack } from '@/lib/vault/export-pack'
import { registerFunuunPdfFonts, PDF_FONT_FAMILY } from './fonts'

// Must run before any StyleSheet below is consumed by a render — see
// lib/vault/pdf/fonts.ts header comment (ESIGN-15 / P17-08). This is the
// ONLY font registration call in this file; do not call Font.register
// directly here.
registerFunuunPdfFonts()

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
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1pt solid #cccccc',
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: '#eeeeee',
    marginBottom: 0,
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
  colTrack: {
    flex: 3,
    fontFamily: PDF_FONT_FAMILY,
    fontWeight: 700,
  },
  colIsrc: {
    flex: 2,
  },
  colIswc: {
    flex: 2,
  },
  colBpm: {
    flex: 1,
    textAlign: 'right',
  },
  colKey: {
    flex: 1,
    textAlign: 'center',
  },
  colLang: {
    flex: 1,
    textAlign: 'center',
  },
  colDuration: {
    flex: 1,
    textAlign: 'right',
  },
  empty: {
    color: '#999999',
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

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmtDuration(s: number | null): string {
  if (s == null || s <= 0) return '—'
  // Round first, then split — rounding the remainder shows "0:60" at x:59.5+.
  const total = Math.round(s)
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function dash(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  return String(value)
}

// ─── Document component (exported for testability) ───────────────────────

type MetadataSheetDocProps = {
  releaseTitle: string
  artistName: string
  tracks: ExportTrack[]
}

export function MetadataSheetDocument({ releaseTitle, artistName, tracks }: MetadataSheetDocProps) {
  return (
    <Document title={`${releaseTitle} — Metadata`} author="Funūn">
      <Page size="A4" style={styles.page} orientation="landscape">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{releaseTitle}</Text>
          <Text style={styles.headerArtist}>{artistName}</Text>
          <Text style={styles.headerMeta}>Track Metadata — ISRC · ISWC · BPM · Key · Language · Duration</Text>
        </View>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colTrack]}>Track</Text>
          <Text style={[styles.tableHeaderCell, styles.colIsrc]}>ISRC</Text>
          <Text style={[styles.tableHeaderCell, styles.colIswc]}>ISWC</Text>
          <Text style={[styles.tableHeaderCell, styles.colBpm]}>BPM</Text>
          <Text style={[styles.tableHeaderCell, styles.colKey]}>Key</Text>
          <Text style={[styles.tableHeaderCell, styles.colLang]}>Language</Text>
          <Text style={[styles.tableHeaderCell, styles.colDuration]}>Duration</Text>
        </View>

        {/* Track rows */}
        {tracks.map((t, i) => (
          <View
            key={t.id}
            style={i % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}
          >
            <Text style={styles.colTrack}>
              {t.track_number != null ? `${t.track_number}. ` : ''}
              {t.title}
            </Text>
            <Text style={t.isrc ? styles.colIsrc : [styles.colIsrc, styles.empty]}>
              {dash(t.isrc)}
            </Text>
            <Text style={t.iswc ? styles.colIswc : [styles.colIswc, styles.empty]}>
              {dash(t.iswc)}
            </Text>
            <Text style={t.bpm != null ? styles.colBpm : [styles.colBpm, styles.empty]}>
              {dash(t.bpm)}
            </Text>
            <Text style={t.key_signature ? styles.colKey : [styles.colKey, styles.empty]}>
              {dash(t.key_signature)}
            </Text>
            <Text style={t.language ? styles.colLang : [styles.colLang, styles.empty]}>
              {dash(t.language)}
            </Text>
            <Text style={styles.colDuration}>{fmtDuration(t.duration_seconds)}</Text>
          </View>
        ))}

        <Text style={styles.footer} fixed>
          Prepared with Funūn · Confidential — for licensing and registration use only
        </Text>
      </Page>
    </Document>
  )
}

// ─── Renderer (called by the export route) ───────────────────────────────

type MetadataSheetInput = {
  releaseTitle: string
  artistName: string
  tracks: ExportManifest['tracks']
}

/**
 * Render the per-track metadata sheet as a PDF Buffer.
 * Fields: ISRC, ISWC, BPM, key signature, language, duration (D-10).
 */
export async function renderMetadataSheet(input: MetadataSheetInput): Promise<Buffer> {
  const doc = (
    <MetadataSheetDocument
      releaseTitle={input.releaseTitle}
      artistName={input.artistName}
      tracks={input.tracks}
    />
  )
  return renderToBuffer(doc)
}
