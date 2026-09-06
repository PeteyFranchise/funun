/**
 * Returns true when `/signin` was opened to deliberately replace the browser's
 * current identity. This only controls whether the sign-in form may render;
 * it never grants access to either workspace.
 */
export function isAccountTransitionSignIn({
  pathname,
  switchTo,
  accountChanged,
}: {
  pathname: string
  switchTo: string | null
  accountChanged: string | null
}): boolean {
  if (!pathname.startsWith('/signin')) return false

  return switchTo === 'personal' || switchTo === 'team' || accountChanged === '1'
}
