export type NextMoveKind = 'complete_draft' | 'review_approve' | 'respond_to_counter' | 'sign_document'
export type NextMoveTier = 'pinned' | 'flexible'
export type NextMoveRow = {
  kind: NextMoveKind
  sheetId: string | null
  documentId: string | null
  label: string
  href: string
  tier: NextMoveTier
}
export type NextMoveSections = { pinned: NextMoveRow[]; flexible: NextMoveRow[] }
export type NextMoveSheetPartyInput = { userId: string | null }
export type NextMoveSheetInput = {
  id: string
  songName: string
  status: string
  initiatorUserId: string
  parties: NextMoveSheetPartyInput[]
}
export type BuildNextMovesInput = { viewerUserId: string; sheets: NextMoveSheetInput[] }

export function buildNextMoves(_input: BuildNextMovesInput): NextMoveSections {
  throw new Error('not implemented')
}
