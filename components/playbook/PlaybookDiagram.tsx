'use client'

import { useEffect, useId, useState } from 'react'
import { assertSafePlaybookDiagramSvg, validatePlaybookDiagramSource } from '@/lib/playbook/diagrams'

type DiagramState =
  | { status: 'loading' }
  | { status: 'ready'; svg: string }
  | { status: 'blocked'; message: string }

let initialized = false

export function PlaybookDiagram({ source }: { source: string }) {
  const reactId = useId()
  const [state, setState] = useState<DiagramState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const validation = validatePlaybookDiagramSource(source)
    if (!validation.ok) {
      setState({ status: 'blocked', message: validation.error })
      return () => { cancelled = true }
    }

    const render = async () => {
      try {
        const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([
          import('mermaid'),
          import('dompurify'),
        ])
        if (!initialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'dark',
            htmlLabels: false,
            flowchart: { htmlLabels: false, useMaxWidth: true },
            sequence: { useMaxWidth: true },
          })
          initialized = true
        }

        const diagramId = `playbook-diagram-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`
        const rendered = await mermaid.render(diagramId, validation.source)
        const sanitized = DOMPurify.sanitize(rendered.svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed', 'image', 'a'],
          FORBID_ATTR: ['href', 'xlink:href', 'onload', 'onclick', 'onerror', 'onmouseover', 'onfocus'],
        })
        const safeSvg = assertSafePlaybookDiagramSvg(sanitized)
        if (!cancelled) setState({ status: 'ready', svg: safeSvg })
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'blocked',
            message: error instanceof Error ? error.message : 'The diagram could not be rendered.',
          })
        }
      }
    }

    void render()
    return () => { cancelled = true }
  }, [reactId, source])

  return (
    <figure className="my-5 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)]">
      <figcaption className="border-b border-[color:var(--border)] px-4 py-2 text-[11px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">
        Playbook diagram
      </figcaption>
      {state.status === 'loading' && (
        <p className="px-4 py-6 text-center text-[12px] text-[color:var(--ink-3)]">Rendering diagram…</p>
      )}
      {state.status === 'ready' && (
        <div
          role="img"
          aria-label="Diagram described by the source below"
          className="overflow-x-auto p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          // DOMPurify plus the post-sanitization policy in diagrams.ts are
          // both required before Mermaid SVG reaches this HTML sink.
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      )}
      {state.status === 'blocked' && (
        <div className="border-l-4 border-amber-400 bg-amber-400/10 px-4 py-3">
          <p className="text-[12px] font-bold text-amber-300">Diagram source shown instead</p>
          <p className="mt-1 text-[11.5px] text-[color:var(--ink-2)]">{state.message}</p>
        </div>
      )}
      <details className="border-t border-[color:var(--border)]">
        <summary className="cursor-pointer px-4 py-2 text-[11px] font-semibold text-[color:var(--ink-3)]">
          Accessible diagram source
        </summary>
        <pre className="overflow-x-auto whitespace-pre-wrap px-4 pb-4 font-mono text-[11.5px] text-[color:var(--ink-2)]">
          {source}
        </pre>
      </details>
    </figure>
  )
}
