import type {
  LyricCommentParticipant,
  WorkVersionComment,
  WorkVersionCommentView,
} from '@/types/catalogue'

export type VersionOrderRow = { id: string; created_at: string }

export function formatTrackTimestamp(timestampMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function orderVersions(rows: VersionOrderRow[]): VersionOrderRow[] {
  return [...rows].sort((a, b) => {
    const byDate = a.created_at.localeCompare(b.created_at)
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id)
  })
}

export function versionDisplayMap(rows: VersionOrderRow[]): Map<string, string> {
  return new Map(orderVersions(rows).map((row, index) => [row.id, `v${index + 1}`]))
}

export function previousVersionId(rows: VersionOrderRow[], targetVersionId: string): string | null {
  const ordered = orderVersions(rows)
  const index = ordered.findIndex(row => row.id === targetVersionId)
  return index > 0 ? ordered[index - 1]!.id : null
}

export function presentVersionComments({
  comments,
  profiles,
  versionDisplays,
  viewerUserId,
  viewerIsOwner,
  viewerCanAdminister,
}: {
  comments: WorkVersionComment[]
  profiles: Map<string, LyricCommentParticipant>
  versionDisplays: Map<string, string>
  viewerUserId: string
  viewerIsOwner: boolean
  viewerCanAdminister: boolean
}): WorkVersionCommentView[] {
  return comments.map(comment => ({
    id: comment.id,
    versionId: comment.version_id,
    parentCommentId: comment.parent_comment_id,
    body: comment.body,
    timestampMs: comment.timestamp_ms,
    author: comment.author_user_id
      ? (profiles.get(comment.author_user_id) ?? {
          userId: comment.author_user_id,
          name: 'A former room member',
          handle: null,
          avatarUrl: null,
        })
      : null,
    mentioned: comment.mentioned_user_ids
      .map(id => profiles.get(id))
      .filter((participant): participant is LyricCommentParticipant => Boolean(participant)),
    resolvedAt: comment.resolved_at,
    resolvedByName: comment.resolved_by_user_id
      ? (profiles.get(comment.resolved_by_user_id)?.name ?? 'A writer')
      : null,
    carriedFromVersionId: comment.carried_from_version_id,
    carriedFromVersionDisplay: comment.carried_from_version_id
      ? (versionDisplays.get(comment.carried_from_version_id) ?? 'an earlier version')
      : null,
    createdAt: comment.created_at,
    canResolve:
      comment.parent_comment_id === null &&
      (viewerIsOwner || viewerCanAdminister || comment.author_user_id === viewerUserId),
  }))
}
