// ─── Credits & Splits Sheet — server-side PDF renderer ────────────────
// Produces a real PDF file (not a browser print-to-PDF) using
// @react-pdf/renderer. Called by the export route (Plan 06) to bundle the
// credits-and-splits.pdf into the ZIP archive.
//
// Data source: readComposers() from lib/metadata/schema.ts — the same
// function the onesheet uses; do NOT re-derive composer data here.
// Render target: @react-pdf/renderer <Document> component tree.

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { readComposers, COMPOSER_ROLE_LABELS, PRO_LABELS } from '@/lib/metadata/schema'
import type { ExportManifest, ExportTrack } from '@/lib/vault/export-pack'

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
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
    fontFamily: 'Helvetica-Bold',
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
  trackSection: {
    marginBottom: 14,
  },
  trackHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f3f3',
    padding: '4pt 6pt',
    marginBottom: 2,
  },
  trackTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    flex: 1,
  },
  splitTotalBadge: {
    fontSize: 8,
    color: '#555555',
    alignSelf: 'center',
  },
  splitTotalWarning: {
    fontSize: 8,
    color: '#cc3300',
    alignSelf: 'center',
  },
  // Table rows for composers
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
    fontFamily: 'Helvetica-Bold',
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
    fontFamily: 'Helvetica-Bold',
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
    fontFamily: 'Helvetica-Bold',
    color: '#666666',
    textTransform: 'uppercase',
  },
  noCredits: {
    fontSize: 8,
    color: '#999999',
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontStyle: 'italic',
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

// ─── Sub-components ───────────────────────────────────────────────────────

type TrackCreditsProps = {
  track: ExportTrack
  index: number
}

function TrackCredits({ track, index: _index }: TrackCreditsProps) {
  const composers = track.composers
  const splitTotal = composers.reduce((sum, c) => sum + c.split, 0)
  const splitOk = composers.length === 0 || Math.abs(splitTotal - 100) < 0.01

  return (
    <View style={styles.trackSection}>
      <View style={styles.trackHeader}>
        <Text style={styles.trackTitle}>
          {track.track_number != null ? `${track.track_number}. ` : ''}
          {track.title}
        </Text>
        {composers.length > 0 && (
          <Text style={splitOk ? styles.splitTotalBadge : styles.splitTotalWarning}>
            {splitTotal.toFixed(1)}% total{!splitOk ? ' ⚠' : ''}
          </Text>
        )}
      </View>

      {composers.length === 0 ? (
        <Text style={styles.noCredits}>No writer credits added for this track.</Text>
      ) : (
        <>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Writer</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Role</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>PRO</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>IPI / CAE</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Split</Text>
          </View>
          {composers.map((c, i) => (
            <View
              key={i}
              style={i % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}
            >
              <Text style={styles.colName}>{c.name}</Text>
              <Text style={styles.colRole}>{COMPOSER_ROLE_LABELS[c.role]}</Text>
              <Text style={styles.colPro}>
                {c.pro && c.pro !== 'none' ? PRO_LABELS[c.pro] : '—'}
              </Text>
              <Text style={styles.colIpi}>{c.ipi ?? '—'}</Text>
              <Text style={styles.colSplit}>{c.split}%</Text>
            </View>
          ))}
        </>
      )}
    </View>
  )
}

// ─── Document component (exported for testability) ───────────────────────

type CreditsSheetDocProps = {
  releaseTitle: string
  artistName: string
  tracks: ExportTrack[]
}

export function CreditsSheetDocument({ releaseTitle, artistName, tracks }: CreditsSheetDocProps) {
  return (
    <Document title={`${releaseTitle} — Credits & Splits`} author="Funūn">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{releaseTitle}</Text>
          <Text style={styles.headerArtist}>{artistName}</Text>
          <Text style={styles.headerMeta}>Credits & Publishing Splits</Text>
        </View>

        {tracks.map((t, i) => (
          <TrackCredits key={t.id} track={t} index={i} />
        ))}

        <Text style={styles.footer} fixed>
          Prepared with Funūn · Confidential — for licensing and registration use only
        </Text>
      </Page>
    </Document>
  )
}

// ─── Renderer (called by the export route) ───────────────────────────────

type CreditsSheetInput = {
  releaseTitle: string
  artistName: string
  tracks: ExportManifest['tracks']
}

/**
 * Render the credits/splits sheet as a PDF Buffer.
 * Accepts an ExportManifest (or any object with releaseTitle + artistName +
 * tracks); the tracks array must carry readComposers()-populated composers
 * (already done by buildExportManifest).
 */
export async function renderCreditsSheet(input: CreditsSheetInput): Promise<Buffer> {
  const doc = (
    <CreditsSheetDocument
      releaseTitle={input.releaseTitle}
      artistName={input.artistName}
      tracks={input.tracks}
    />
  )
  return renderToBuffer(doc)
}
