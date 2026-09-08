import {
  PLAYBOOK_RECOVERY_MAX_BODY_CHARS,
  PLAYBOOK_RECOVERY_RETENTION_MS,
  playbookRecoveryKey,
  parsePlaybookRecoveryKey,
  readPlaybookRecovery,
  removePlaybookRecovery,
  writePlaybookRecovery,
  type RecoveryStorage,
} from '@/lib/playbook/draft-recovery'

function memoryStorage(): RecoveryStorage & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  }
}

describe('Playbook browser-local draft recovery', () => {
  it('isolates keys by user, room, and entry', () => {
    expect(playbookRecoveryKey({ viewerId: 'User-A', roomKey: 'A&R' })).not.toBe(
      playbookRecoveryKey({ viewerId: 'User-B', roomKey: 'A&R' })
    )
    expect(playbookRecoveryKey({ viewerId: 'User-A', roomKey: 'A&R', entryId: 'one' })).not.toBe(
      playbookRecoveryKey({ viewerId: 'User-A', roomKey: 'A&R', entryId: 'two' })
    )
  })

  it('parses only keys belonging to the requested account', () => {
    const newKey = playbookRecoveryKey({ viewerId: 'User-A', roomKey: 'A&R' })
    const entryKey = playbookRecoveryKey({ viewerId: 'User-A', roomKey: 'A&R', entryId: 'Entry:One' })

    expect(parsePlaybookRecoveryKey(newKey, 'User-A')).toEqual({ roomKey: 'a&r', entryId: null })
    expect(parsePlaybookRecoveryKey(entryKey, 'User-A')).toEqual({ roomKey: 'a&r', entryId: 'entry:one' })
    expect(parsePlaybookRecoveryKey(newKey, 'User-B')).toBeNull()
    expect(parsePlaybookRecoveryKey(`${newKey}:unexpected`, 'User-A')).toBeNull()
  })

  it('writes and reads a valid recovery record', () => {
    const storage = memoryStorage()
    const draft = { entryType: 'document' as const, title: 'Doctrine', body: 'Work in progress' }

    expect(writePlaybookRecovery(storage, 'key', draft, 1_000)).toMatchObject({ savedAt: 1_000, draft })
    expect(readPlaybookRecovery(storage, 'key', 2_000)).toMatchObject({ savedAt: 1_000, draft })
  })

  it('removes expired, future-dated, and malformed records', () => {
    const storage = memoryStorage()
    const draft = { entryType: 'sop' as const, title: 'Checklist', body: 'One step' }

    writePlaybookRecovery(storage, 'expired', draft, 1_000)
    expect(readPlaybookRecovery(storage, 'expired', 1_000 + PLAYBOOK_RECOVERY_RETENTION_MS + 1)).toBeNull()

    writePlaybookRecovery(storage, 'future', draft, 1_000_000)
    expect(readPlaybookRecovery(storage, 'future', 1_000)).toBeNull()

    storage.setItem('bad-json', '{')
    expect(readPlaybookRecovery(storage, 'bad-json', 1_000)).toBeNull()
    expect(storage.values.has('bad-json')).toBe(false)
  })

  it('refuses oversized drafts without touching storage', () => {
    const storage = memoryStorage()
    const result = writePlaybookRecovery(storage, 'large', {
      entryType: 'document',
      title: 'Large',
      body: 'x'.repeat(PLAYBOOK_RECOVERY_MAX_BODY_CHARS + 1),
    })

    expect(result).toBeNull()
    expect(storage.values.size).toBe(0)
  })

  it('removes a recovery record explicitly', () => {
    const storage = memoryStorage()
    storage.setItem('key', 'value')

    expect(removePlaybookRecovery(storage, 'key')).toBe(true)
    expect(storage.getItem('key')).toBeNull()
  })
})
