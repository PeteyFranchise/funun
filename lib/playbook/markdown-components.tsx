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

import type { Components } from 'react-markdown'

export const markdownComponents: Components = {
  h1: ({ node, ...props }) => (
    <h1
      className="text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[color:var(--ink)]"
      {...props}
    />
  ),
  h2: ({ node, ...props }) => (
    <h2
      className="mb-3 mt-8 text-[20px] font-bold text-[color:var(--ink)]"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3
      className="mt-[22px] text-[15px] font-bold text-[color:var(--ink)]"
      {...props}
    />
  ),
  p: ({ node, ...props }) => (
    <p className="text-[14px] leading-[1.6] text-[color:var(--ink-2)]" {...props} />
  ),
  strong: ({ node, ...props }) => (
    <strong className="font-semibold text-[color:var(--ink)]" {...props} />
  ),
  a: ({ node, ...props }) => (
    <a className="text-[color:var(--indigo)] no-underline hover:underline" {...props} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="my-4 rounded-r-xl border-l-[3px] border-[#F59E0B] bg-[#F59E0B0F] px-4 py-3"
      {...props}
    />
  ),
  table: ({ node, ...props }) => (
    <table
      className="w-full overflow-hidden rounded-xl border border-[color:var(--border)]"
      {...props}
    />
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
  pre: ({ node, ...props }) => (
    <pre
      className="overflow-x-auto rounded-[10px] border border-[color:var(--border)] bg-[color:var(--panel)] px-4 py-3.5 font-mono text-[12.5px]"
      {...props}
    />
  ),
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
