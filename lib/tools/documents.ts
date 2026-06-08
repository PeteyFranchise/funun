// ─── Stage 3 document-tool dispatcher ────────────────────────────────
// Bridges the five Stage 3 tools to the generation API. SplitSheet is
// form-only (handled inline by the route); the other AI tools build a
// prompt here. Each tool maps to a vault_documents type, except ContentID
// which is tracked on the project.
import type { ArtistProfile } from '@/types'
import type { Stage3ToolSlug } from '@/lib/vault/stage3'
import { buildHireRightPrompt, type HireRightInput } from '@/lib/tools/hireright'
import { buildCopyrightKitPrompt, type CopyrightKitInput } from '@/lib/tools/copyrightkit'
import { buildSampleClearPrompt, type SampleClearInput } from '@/lib/tools/sampleclear'
import { buildContentIdPrompt, type ContentIdInput } from '@/lib/tools/contentid'

export type Stage3DocType =
  | 'split_sheet'
  | 'hire_right'
  | 'copyright_registration'
  | 'sample_clearance'

/** vault_documents.type for each tool (null = no document row). */
export const TOOL_DOC_TYPE: Record<Stage3ToolSlug, Stage3DocType | null> = {
  splitsheet: 'split_sheet',
  hireright: 'hire_right',
  copyrightkit: 'copyright_registration',
  sampleclear: 'sample_clearance',
  contentid: null,
}

export const TOOL_NAME: Record<Stage3ToolSlug, string> = {
  splitsheet: 'SplitSheet',
  hireright: 'HireRight',
  copyrightkit: 'CopyrightKit',
  sampleclear: 'SampleClear',
  contentid: 'ContentID Command',
}

/** True for tools whose content is AI-generated (SplitSheet is form-only). */
export function isAiDocTool(tool: Stage3ToolSlug): boolean {
  return tool === 'hireright' || tool === 'copyrightkit' || tool === 'sampleclear' || tool === 'contentid'
}

/**
 * Build the AI prompt for a doc tool. `input` is the pre-fill payload from
 * the side panel, shaped per tool. Returns null for non-AI / unknown tools.
 */
export function buildDocPrompt(
  tool: Stage3ToolSlug,
  profile: ArtistProfile,
  input: Record<string, unknown>
): string | null {
  switch (tool) {
    case 'hireright':
      return buildHireRightPrompt(profile, input as unknown as HireRightInput)
    case 'copyrightkit':
      return buildCopyrightKitPrompt(profile, input as unknown as CopyrightKitInput)
    case 'sampleclear':
      return buildSampleClearPrompt(profile, input as unknown as SampleClearInput)
    case 'contentid':
      return buildContentIdPrompt(profile, input as unknown as ContentIdInput)
    default:
      return null
  }
}
