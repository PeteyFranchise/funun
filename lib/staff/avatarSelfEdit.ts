// Whether a non-manager staff member may change their OWN profile photo.
//
// Default ENABLED. To lock photo changes down to Leadership/TMS (e.g. if
// self-service is abused), set STAFF_AVATAR_SELF_EDIT to off / false / 0 /
// disabled in the environment — owner-revertible, no code change. Leadership
// and TMS can always set any member's photo regardless of this flag.
export function isAvatarSelfEditEnabled(): boolean {
  const v = (process.env.STAFF_AVATAR_SELF_EDIT ?? '').trim().toLowerCase()
  return !(v === 'off' || v === 'false' || v === '0' || v === 'disabled')
}
