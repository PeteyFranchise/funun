import { createHash } from 'node:crypto'

export type DeliveryKind = 'tagged_mp3' | 'metadata_sidecar'

export type DeliveryFileIdentity = {
  bucket: string
  path: string
  sha256: string
}

export type DeliveryArtifactIdentity = DeliveryFileIdentity & {
  filename: string
  mime_type: string
  size_bytes: number
}

export type DeliveryManifest = {
  schema_version: 'funun.delivery-manifest.v1'
  delivery_id: string
  created_at: string
  kind: DeliveryKind
  project_id: string
  track_id: string
  source: DeliveryFileIdentity & { unchanged: true }
  artifact: DeliveryArtifactIdentity
  metadata_snapshot: Record<string, unknown>
  metadata_sha256: string
}

export type DeliveryReceipt = {
  schema_version: 'funun.export-receipt.v1'
  receipt_id: string
  delivery_id: string
  created_at: string
  actor_user_id: string
  action: 'generated'
  status: 'complete'
  artifact_sha256: string
  statement: string
}

type BuildDeliveryDocumentsInput = {
  deliveryId: string
  createdAt: string
  kind: DeliveryKind
  projectId: string
  trackId: string
  actorUserId: string
  source: DeliveryFileIdentity
  artifact: DeliveryArtifactIdentity
  metadataSnapshot: Record<string, unknown>
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)])
    )
  }
  return value
}

/** Stable JSON is used only for evidence hashes; presentation JSON may stay human-formatted. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Hash a Storage download without copying the whole Blob into a second buffer. */
export async function sha256Blob(blob: Blob): Promise<string> {
  const hash = createHash('sha256')
  const reader = blob.stream().getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    hash.update(value)
  }
  return hash.digest('hex')
}

function fileStem(path: string): string {
  const name = path.split('/').pop() ?? 'track'
  return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-') || 'track'
}

/** A delivery id in the path makes every correction a new artifact instead of an overwrite. */
export function buildDeliveryArtifactPath(
  sourcePath: string,
  deliveryId: string,
  kind: DeliveryKind
): string {
  const slash = sourcePath.lastIndexOf('/')
  const directory = slash === -1 ? '' : sourcePath.slice(0, slash + 1)
  const suffix = kind === 'tagged_mp3' ? 'tagged.mp3' : 'metadata.txt'
  return `${directory}deliveries/${fileStem(sourcePath)}/${deliveryId}.${suffix}`
}

export function buildDeliveryDocuments(input: BuildDeliveryDocumentsInput): {
  manifest: DeliveryManifest
  receipt: DeliveryReceipt
} {
  const metadataSha256 = sha256Text(canonicalJson(input.metadataSnapshot))
  const manifest: DeliveryManifest = {
    schema_version: 'funun.delivery-manifest.v1',
    delivery_id: input.deliveryId,
    created_at: input.createdAt,
    kind: input.kind,
    project_id: input.projectId,
    track_id: input.trackId,
    source: { ...input.source, unchanged: true },
    artifact: input.artifact,
    metadata_snapshot: input.metadataSnapshot,
    metadata_sha256: metadataSha256,
  }
  const receipt: DeliveryReceipt = {
    schema_version: 'funun.export-receipt.v1',
    receipt_id: input.deliveryId,
    delivery_id: input.deliveryId,
    created_at: input.createdAt,
    actor_user_id: input.actorUserId,
    action: 'generated',
    status: 'complete',
    artifact_sha256: input.artifact.sha256,
    statement:
      'Funūn generated this artifact from the identified source and metadata snapshot. This is an export record, not confirmation that a recipient received or accepted the file.',
  }
  return { manifest, receipt }
}
