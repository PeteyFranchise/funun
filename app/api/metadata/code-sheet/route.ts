import { createApiClient } from '@/lib/supabase/server'
import { buildCodeSheet, type CodeSheetProjectRow, type CodeSheetTrackRow } from '@/lib/metadata/code-sheet'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const PROJECT_COLS = 'id, title, release_date, upc, grid, catalog_number'
const TRACK_COLS = 'project_id, title, track_number, isrc, iswc, duration_seconds'

// GET /api/metadata/code-sheet
// Returns a CSV listing every track's identifiers across the AUTHENTICATED
// CALLER'S ENTIRE catalog. Deliberately takes NO projectId/userId
// parameter — ownership is derived from the session alone via explicit
// `.eq('user_id', user.id)` column selects on both queries, so there is
// no id for a caller to tamper with to request another artist's code
// sheet (T-16-11-1).
export async function GET() {
  if (DEMO) {
    return new Response('Code sheet export is not available in demo mode', { status: 400 })
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: projects } = await supabase
    .from('vault_projects')
    .select(PROJECT_COLS)
    .eq('user_id', user.id)

  const { data: tracks } = await supabase
    .from('tracks')
    .select(TRACK_COLS)
    .eq('user_id', user.id)

  const csv = buildCodeSheet(
    (projects ?? []) as unknown as CodeSheetProjectRow[],
    (tracks ?? []) as unknown as CodeSheetTrackRow[]
  )

  const date = new Date().toISOString().slice(0, 10)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="funun-code-sheet-${date}.csv"`,
    },
  })
}
