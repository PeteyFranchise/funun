'use client'

export type PendingIdeaCapture = {
  id: string
  ideaId: string | null
  blob: Blob
  fileName: string
  durationSeconds: number | null
  markers: { timestampMs: number; label?: string | null }[]
  savedAt: string
}

const DB_NAME = 'funun-idea-captures'
const STORE = 'pending'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local capture storage.'))
  })
}

export async function savePendingCapture(capture: PendingIdeaCapture): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put(capture)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not protect this recording locally.'))
  })
  db.close()
}

export async function removePendingCapture(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear local capture storage.'))
  })
  db.close()
}

export async function newestPendingCapture(): Promise<PendingIdeaCapture | null> {
  const db = await openDb()
  const values = await new Promise<PendingIdeaCapture[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result as PendingIdeaCapture[])
    request.onerror = () => reject(request.error ?? new Error('Could not read local capture storage.'))
  })
  db.close()
  return values.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null
}
