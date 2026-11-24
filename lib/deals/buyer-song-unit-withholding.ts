import { NextResponse } from 'next/server'

export const BUYER_SONG_UNIT_WRITES_WITHHELD = true

const WITHHOLDING_MESSAGE =
  'Song licensing is unavailable while we confirm the exact recording and its licensing details.'

/**
 * Fail closed while commercial writes still use mutable Sound Vault projects and tracks.
 * Callers must authenticate and authorize before returning this response.
 */
export function buyerSongUnitWriteWithholdingResponse(): NextResponse | null {
  if (!BUYER_SONG_UNIT_WRITES_WITHHELD) return null

  return NextResponse.json(
    {
      error: WITHHOLDING_MESSAGE,
      code: 'buyer_song_unit_withheld',
    },
    {
      status: 503,
    }
  )
}
