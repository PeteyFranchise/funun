import { createApiClient, createServiceClient } from '@/lib/supabase/server'

type DeliveryDocument = 'manifest' | 'receipt'

function isDeliveryDocument(value: string): value is DeliveryDocument {
  return value === 'manifest' || value === 'receipt'
}

// Authenticated evidence download. The ledger itself has no browser grants;
// this route proves track ownership before the service client reads one row.
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      projectId: string
      trackId: string
      deliveryId: string
      document: string
    }>
  }
) {
  const { projectId, trackId, deliveryId, document } = await params
  if (!isDeliveryDocument(document)) return new Response('Not found', { status: 404 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: track } = await supabase
    .from('tracks')
    .select('id')
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!track) return new Response('Not found', { status: 404 })

  const service = createServiceClient()
  const { data: delivery, error } = await service
    .from('metadata_delivery_exports')
    .select('manifest, receipt')
    .eq('id', deliveryId)
    .eq('project_id', projectId)
    .eq('track_id', trackId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return new Response('Could not load delivery evidence', { status: 502 })
  if (!delivery) return new Response('Not found', { status: 404 })

  const payload = document === 'manifest' ? delivery.manifest : delivery.receipt
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${deliveryId}.${document}.json"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
