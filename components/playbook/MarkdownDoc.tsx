// ─── MarkdownDoc ─────────────────────────────────────────────────────────
// Renders both committed and database-authored Markdown as untrusted input.
// Deliberately NOT a Client Component — react-
// markdown has no client-only hooks/state, so this stays a plain Server
// Component and ships zero client JS for the doc-page body (RESEARCH
// Pattern 3, UI-SPEC "No markdown renderer is installed yet" section).
//
// No dangerouslySetInnerHTML — ReactMarkdown returns React elements
// through the typed markdownComponents map (T-33-02).

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { markdownComponents } from '@/lib/playbook/markdown-components'
import { remarkPlaybookCallouts, remarkPlaybookHeadingIds } from '@/lib/playbook/remark-callouts'

export function MarkdownBody({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkPlaybookCallouts, remarkPlaybookHeadingIds]}
      components={markdownComponents}
      skipHtml
    >
      {content}
    </ReactMarkdown>
  )
}

export function MarkdownDoc({ content }: { content: string }) {
  return (
    <div className="mx-auto max-w-[900px] px-[34px] pb-[60px] pt-[22px]">
      <MarkdownBody content={content} />
    </div>
  )
}
