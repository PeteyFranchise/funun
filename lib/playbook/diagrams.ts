export const PLAYBOOK_DIAGRAM_MAX_CHARS = 12_000
export const PLAYBOOK_DIAGRAM_MAX_LINES = 180

const SUPPORTED_DIAGRAM_HEADERS = /^(?:flowchart\s+(?:TD|TB|BT|RL|LR)|graph\s+(?:TD|TB|BT|RL|LR)|sequenceDiagram|stateDiagram-v2|classDiagram)\b/
const FORBIDDEN_SOURCE = [
  /<\/?(?:script|style|iframe|object|embed|foreignObject|image|a)\b/i,
  /\b(?:click|href|linkStyle)\b/i,
  /^\s*(?:classDef|style)\b/im,
  /\b(?:javascript|data|vbscript|file):/i,
  /\b(?:url|src)\s*\(/i,
  /%%\{[\s\S]*?\}%%/,
] as const

const FORBIDDEN_SANITIZED_SVG = [
  /<\/?(?:script|iframe|object|embed|foreignObject|image|a)\b/i,
  /\son[a-z]+\s*=/i,
  /\b(?:javascript|data|vbscript|file):/i,
  /(?:href|xlink:href)\s*=\s*["'](?!#)/i,
  /@import\b/i,
  /expression\s*\(/i,
  /url\(\s*["']?(?!#)/i,
] as const

export type DiagramValidation =
  | { ok: true; source: string }
  | { ok: false; error: string }

export function validatePlaybookDiagramSource(raw: string): DiagramValidation {
  const source = raw.trim()
  if (!source) return { ok: false, error: 'The diagram is empty.' }
  if (source.length > PLAYBOOK_DIAGRAM_MAX_CHARS) {
    return { ok: false, error: `Diagram source exceeds ${PLAYBOOK_DIAGRAM_MAX_CHARS.toLocaleString()} characters.` }
  }
  if (source.split(/\r?\n/).length > PLAYBOOK_DIAGRAM_MAX_LINES) {
    return { ok: false, error: `Diagram source exceeds ${PLAYBOOK_DIAGRAM_MAX_LINES} lines.` }
  }
  if (!SUPPORTED_DIAGRAM_HEADERS.test(source)) {
    return {
      ok: false,
      error: 'Supported diagrams are flowcharts, sequence diagrams, state diagrams and class diagrams.',
    }
  }
  if (FORBIDDEN_SOURCE.some(pattern => pattern.test(source))) {
    return { ok: false, error: 'Interactive links, directives, HTML and remote resources are not allowed.' }
  }
  return { ok: true, source }
}

/**
 * Defense after DOMPurify. Mermaid uses local marker references such as
 * `url(#arrowhead)`, but a Playbook diagram must never retain a remote URL,
 * executable attribute or active HTML element.
 */
export function assertSafePlaybookDiagramSvg(svg: string): string {
  if (!svg.trim().startsWith('<svg') || FORBIDDEN_SANITIZED_SVG.some(pattern => pattern.test(svg))) {
    throw new Error('The rendered diagram contained unsafe SVG and was blocked.')
  }
  return svg
}
