// ─── Playbook IT-room doc reader ────────────────────────────────────────
// Mirrors lib/vault/pdf/fonts.ts's fail-fast fs + process.cwd() pattern:
// docs/observability/*.md are read at request time via a runtime-computed
// path, which is invisible to Next.js's output file tracer unless
// next.config.mjs's outputFileTracingIncludes explicitly bundles it (see
// 33-RESEARCH.md "Deployment risk" / PLAYBOOK-06). This module never falls
// back to a silent blank render — a missing/renamed doc throws loudly,
// naming the resolved path and pointing at the deploy-time fix.

import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'

const DOCS_DIR = path.join(process.cwd(), 'docs', 'observability')

/**
 * Reads a markdown doc from docs/observability/ by filename. Throws a
 * descriptive Error (naming the resolved absolute path) if the file does
 * not exist — this is a fail-fast guard, not a workaround: silently
 * rendering a blank page would hide a broken outputFileTracingIncludes
 * entry until a real production deploy surfaces it.
 */
export async function readObservabilityDoc(filename: string): Promise<string> {
  const filePath = path.join(DOCS_DIR, filename)
  if (!fsSync.existsSync(filePath)) {
    throw new Error(
      `readObservabilityDoc(): required doc not found at "${filePath}". ` +
        'If this is a production deploy, confirm outputFileTracingIncludes in ' +
        'next.config.mjs actually shipped docs/observability/ into the serverless bundle ' +
        '(see 33-RESEARCH.md "Deployment risk" section).',
    )
  }
  return fs.readFile(filePath, 'utf-8')
}
