'use client'

import { useRef, useState } from 'react'
import {
  Avatar,
  RolePills,
  CameraGlyph,
  memberRoles,
  uploadStaffAvatar,
  validateAvatarFile,
  type StaffRow,
} from '@/components/admin/StaffAdmin'

// ─── MyProfile (/admin/profile) ─────────────────────────────────────────────
// A staff member's own profile page — Slice 2 of avatar editing. View your
// details and change your own photo (when allowed by STAFF_AVATAR_SELF_EDIT, or
// always if you're Leadership/TMS). Name, roles, and email are managed by
// Leadership/TMS, so they render read-only here.
export function MyProfile({ me, canEditPhoto }: { me: StaffRow; canEditPhoto: boolean }) {
  const [member, setMember] = useState<StaffRow>(me)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const onPick = async (file: File | null) => {
    if (!file) return
    const err = validateAvatarFile(file)
    if (err) {
      setError(err)
      setSaved(false)
      return
    }
    setError(null)
    setSaved(false)
    setUploading(true)
    try {
      const url = await uploadStaffAvatar(member.user_id, file)
      setMember(prev => ({ ...prev, avatar_url: url }))
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload the photo.')
    } finally {
      setUploading(false)
    }
  }

  const roles = memberRoles(member)

  return (
    <div className="max-w-[560px]">
      <div className="rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)] p-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-none">
            <Avatar member={member} size="lg" />
            {canEditPhoto && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                aria-label="Change your photo"
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--border-2)] bg-[color:var(--panel)] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)] disabled:opacity-60 motion-reduce:transition-none"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,.4)' }}
              >
                {uploading ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <CameraGlyph size={14} />
                )}
              </button>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-extrabold text-[color:var(--ink)]">
              {member.display_name || member.email}
            </h1>
            <p className="truncate text-[13px] text-[color:var(--ink-3)]">{member.email}</p>
          </div>
        </div>

        {canEditPhoto ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-[10px] border border-[color:var(--border)] px-3.5 py-2 text-[13px] font-bold text-[color:var(--ink-2)] transition hover:border-[color:var(--border-2)] hover:text-[color:var(--ink)] disabled:opacity-60 motion-reduce:transition-none"
            >
              {uploading ? 'Uploading…' : member.avatar_url ? 'Change photo' : 'Add photo'}
            </button>
            <span className="text-[11.5px] text-[color:var(--ink-3)]">JPG, PNG, or WebP, up to 10MB.</span>
          </div>
        ) : (
          <p className="mt-4 text-[12.5px] text-[color:var(--ink-3)]">
            Photo changes are managed by Leadership / TMS.
          </p>
        )}
        {error && <p className="mt-3 text-[13px] font-semibold text-[color:var(--rose-fg)]">{error}</p>}
        {saved && <p className="mt-3 text-[13px] font-semibold text-[color:var(--green-fg)]">Photo updated.</p>}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => {
            onPick(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />

        <div className="mt-6 border-t border-[color:var(--border)] pt-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--ink-3)]">Your roles</p>
          {roles.length > 0 ? (
            <RolePills roles={roles} />
          ) : (
            <p className="text-[13px] text-[color:var(--ink-3)]">No roles assigned.</p>
          )}
          {member.phone && (
            <p className="mt-4 text-[13px] text-[color:var(--ink-2)]">
              <span className="text-[color:var(--ink-3)]">Phone: </span>
              {member.phone}
            </p>
          )}
          <p className="mt-3 text-[12px] text-[color:var(--ink-3)]">
            Your name, roles, and email are managed by Leadership / TMS — ask them to update those.
          </p>
        </div>
      </div>
    </div>
  )
}
