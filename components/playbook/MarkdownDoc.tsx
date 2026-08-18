// ─── MarkdownDoc ─────────────────────────────────────────────────────────
// Renders trusted, committed markdown (docs/observability/*.md — never user
// input) as React elements. Deliberately NOT a Client Component — react-
// markdown has no client-only hooks/state, so this stays a plain Server
// Component and ships zero client JS for the doc-page body (RESEARCH
// Pattern 3, UI-SPEC "No markdown renderer is installed yet" section).
//
// No dangerouslySetInnerHTML — ReactMarkdown returns React elements
// through the typed markdownComponents map (T-33-02).

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { markdownComponents } from '@/lib/playbook/markdown-components'

export function MarkdownDoc({ content }: { content: string }) {
  return (
    <div className="mx-auto max-w-[900px] px-[34px] pb-[60px] pt-[22px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
