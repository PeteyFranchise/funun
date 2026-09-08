'use client'

import { useEffect, useState } from 'react'
import {
  readPlaybookRecovery,
  removePlaybookRecovery,
  writePlaybookRecovery,
  type PlaybookRecoveryDraft,
  type PlaybookRecoveryRecord,
} from '@/lib/playbook/draft-recovery'

export function usePlaybookDraftRecovery({
  storageKey,
  draft,
  hasWork,
  onRestore,
}: {
  storageKey: string
  draft: PlaybookRecoveryDraft
  hasWork: boolean
  onRestore: (draft: PlaybookRecoveryDraft) => void
}) {
  const { entryType, title, body, subGroupId, templateKey } = draft
  const [candidate, setCandidate] = useState<PlaybookRecoveryRecord | null>(null)
  const [checked, setChecked] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [storageUnavailable, setStorageUnavailable] = useState(false)

  useEffect(() => {
    const recovered = readPlaybookRecovery(window.localStorage, storageKey)
    setCandidate(recovered)
    setSavedAt(recovered?.savedAt ?? null)
    setChecked(true)
  }, [storageKey])

  useEffect(() => {
    if (!checked || candidate || !hasWork) return
    const timer = window.setTimeout(() => {
      const record = writePlaybookRecovery(window.localStorage, storageKey, {
        entryType,
        title,
        body,
        subGroupId,
        templateKey,
      })
      if (record) {
        setSavedAt(record.savedAt)
        setStorageUnavailable(false)
      } else {
        setStorageUnavailable(true)
      }
    }, 900)
    return () => window.clearTimeout(timer)
  }, [body, candidate, checked, entryType, hasWork, storageKey, subGroupId, templateKey, title])

  const restore = () => {
    if (!candidate) return
    onRestore(candidate.draft)
    setCandidate(null)
    setSavedAt(candidate.savedAt)
  }

  const discard = () => {
    const removed = removePlaybookRecovery(window.localStorage, storageKey)
    setCandidate(null)
    setSavedAt(null)
    setStorageUnavailable(!removed)
  }

  const clear = () => {
    const removed = removePlaybookRecovery(window.localStorage, storageKey)
    setCandidate(null)
    setSavedAt(null)
    setStorageUnavailable(!removed)
  }

  return { candidate, savedAt, storageUnavailable, restore, discard, clear }
}
