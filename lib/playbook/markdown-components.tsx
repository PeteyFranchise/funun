// ─── Playbook doc-page markdown element map ─────────────────────────────
// Shared react-markdown `components` override satisfying 33-UI-SPEC.md's
// "Doc-Page Markdown Container Contract" table verbatim. Applies uniformly
// to all 4 rendered IT-room docs (VENDOR-DIRECTORY, RUNBOOK,
// OPERATING-RHYTHM, THRESHOLDS-AND-SEVERITY) via components/playbook/MarkdownDoc.tsx.
//
// Token note: the UI-SPEC's "Doc-Page Markdown Container Contract" table
// and its own drafted code samples use mockup-equivalent token names
// (`var(--lav)`, `var(--hair)`, `var(--card2)`) — but the UI-SPEC's own
// "Design System" section explicitly maps those to the REAL CSS custom
// properties already live in components/admin/console-theme.ts's `.fncon`
// block: --lav -> --ink-2, --lavdim -> --ink-3, --hair -> --border,
// --card -> --panel, --card2 -> --panel-2, --white -> --ink (--indigo is
// the same name in both). This file uses the real token names — the
// mockup-equivalent aliases are NOT declared anywhere in this codebase
// (UI-SPEC: "adds zero new CSS custom properties to the token block"), so
// using them literally would resolve to nothing and render invisibly.
//
// No dangerouslySetInnerHTML anywhere — react-markdown returns React
// elements through this typed `components` map, never a raw-HTML sink
// (T-33-02).

import { isValidElement, type ReactElement } from 'react'
import type { Components } from 'react-markdown'
import { PlaybookDiagram } from '@/components/playbook/PlaybookDiagram'
import { PlaybookVideo } from '@/components/playbook/PlaybookVideo'
import { parsePlaybookVideoBlock } from '@/lib/playbook/media'

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function safeHref(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  if (raw.startsWith('#')) return raw
  try {
    const url = new URL(raw)
    return SAFE_PROTOCOLS.has(url.protocol) ? raw : undefined
  } catch {
    return undefined
  }
}

function headingId(children: unknown): string | undefined {
  if (typeof children !== 'string') return undefined
  const value = children
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return value || undefined
}

const CALLOUT_STYLES: Record<string, { label: string; className: string }> = {
  note: { label: 'Note', className: 'border-[#60A5FA] bg-[#60A5FA0F]' },
  tip: { label: 'Tip', className: 'border-[#34D399] bg-[#34D3990F]' },
  caution: { label: 'Caution', className: 'border-[#F59E0B] bg-[#F59E0B0F]' },
  warning: { label: 'Warning', className: 'border-[#FB7185] bg-[#FB71850F]' },
}

export const markdownComponents: Components = {
  h1: ({ node, ...props }) => (
    <h1
      className="text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[color:var(--ink)]"
      {...props}
    />
  ),
  h2: ({ node, children, ...props }) => (
    <h2
      id={headingId(children)}
      className="mb-3 mt-8 text-[20px] font-bold text-[color:var(--ink)]"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ node, children, ...props }) => (
    <h3
      id={headingId(children)}
      className="mt-[22px] text-[15px] font-bold text-[color:var(--ink)]"
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ node, children, ...props }) => (
    <h4
      id={headingId(children)}
      className="mt-5 text-[13px] font-bold uppercase tracking-[.04em] text-[color:var(--ink)]"
      {...props}
    >
      {children}
    </h4>
  ),
  p: ({ node, ...props }) => (
    <p className="text-[14px] leading-[1.6] text-[color:var(--ink-2)]" {...props} />
  ),
  strong: ({ node, ...props }) => (
    <strong className="font-semibold text-[color:var(--ink)]" {...props} />
  ),
  a: ({ node, href, ...props }) => {
    const safe = safeHref(href)
    if (!safe) return <span className="text-[color:var(--ink-3)]" {...props} />
    const external = safe.startsWith('http://') || safe.startsWith('https://')
    return (
      <a
        href={safe}
        className="text-[color:var(--indigo)] no-underline hover:underline"
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        {...props}
      />
    )
  },
  img: ({ alt }) => (
    <span className="text-[12px] italic text-[color:var(--ink-3)]">
      {alt ? `[Image blocked: ${alt}]` : '[Remote image blocked]'}
    </span>
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="my-4 rounded-r-xl border-l-[3px] border-[#F59E0B] bg-[#F59E0B0F] px-4 py-3"
      {...props}
    />
  ),
  aside: ({ node, children, ...props }) => {
    const dataCallout = (props as unknown as { 'data-callout'?: unknown })['data-callout']
    const rawKind = typeof dataCallout === 'string' ? dataCallout : 'note'
    const style = CALLOUT_STYLES[rawKind] ?? CALLOUT_STYLES.note
    return (
      <aside
        className={`my-4 rounded-r-xl border-l-[3px] px-4 py-3 ${style.className}`}
        aria-label={style.label}
      >
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[.08em] text-[color:var(--ink)]">
          {style.label}
        </p>
        {children}
      </aside>
    )
  },
  table: ({ node, ...props }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-[color:var(--border)]">
      <table className="w-full min-w-[560px] border-collapse" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead {...props} />,
  th: ({ node, ...props }) => (
    <th
      className="bg-[color:var(--panel-2)] px-3 py-2.5 text-[11px] font-bold uppercase text-[color:var(--ink-3)]"
      {...props}
    />
  ),
  td: ({ node, ...props }) => (
    <td
      className="border-t border-[color:var(--border)] px-3 py-2.5 text-[13px] text-[color:var(--ink-2)]"
      {...props}
    />
  ),
  code: ({ node, ...props }) => (
    <code
      className="rounded bg-[color:var(--panel-2)] px-1.5 py-0.5 font-mono text-[12.5px] text-[color:var(--ink-2)]"
      {...props}
    />
  ),
  pre: ({ node, children, ...props }) => {
    const child = isValidElement(children)
      ? children as ReactElement<{ className?: string; children?: unknown }>
      : null
    if (child?.props.className?.split(/\s+/).includes('language-mermaid')) {
      const source = typeof child.props.children === 'string'
        ? child.props.children.replace(/\n$/, '')
        : ''
      return <PlaybookDiagram source={source} />
    }
    if (child?.props.className?.split(/\s+/).includes('language-video')) {
      const source = typeof child.props.children === 'string'
        ? child.props.children.replace(/\n$/, '')
        : ''
      const video = parsePlaybookVideoBlock(source)
      return video
        ? <PlaybookVideo video={video} />
        : <p className="rounded-lg border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-[12px] text-rose-300">Video blocked: use an HTTPS YouTube, Vimeo, Loom, or authenticated Funūn media URL and include a title.</p>
    }
    return (
      <pre
        className="overflow-x-auto rounded-[10px] border border-[color:var(--border)] bg-[color:var(--panel)] px-4 py-3.5 font-mono text-[12.5px]"
        {...props}
      >
        {children}
      </pre>
    )
  },
  ul: ({ node, ...props }) => (
    <ul
      className="list-disc space-y-1.5 pl-5 text-[14px] leading-[1.6] text-[color:var(--ink-2)]"
      {...props}
    />
  ),
  ol: ({ node, ...props }) => (
    <ol
      className="list-decimal space-y-1.5 pl-5 text-[14px] leading-[1.6] text-[color:var(--ink-2)]"
      {...props}
    />
  ),
  hr: () => <hr className="my-8 border-t border-[color:var(--border)]" />,
}
