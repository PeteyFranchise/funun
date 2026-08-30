// ─── Profile display-title derivation (D-11, D-12) ───────────────────
// D-11: with an artist name set, the profile header shows the artist name
// as the title and @handle beneath it. With none, the @handle IS the
// title — never a fabricated name, never "Unnamed artist".
// D-12 boundary: these functions take exactly artistName/handle/title and
// nothing else. The four contract-only legal-name fields on the profile
// row (first, middle, last, suffix) are not parameters, are not read, and
// are not referenced anywhere in this module — they are for contracts and
// must never reach public profile rendering.

/**
 * The resolved public title: the trimmed artist name when set, otherwise
 * `@` + the handle exactly as stored (D-04: casing preserved), otherwise
 * the empty string. The empty-string branch is deliberate: D-11 forbids
 * substituting any invented stand-in, so when there is nothing real to
 * show the correct output is nothing. This branch becomes unreachable
 * once plan 07's NOT NULL constraint on handle lands.
 */
export function profileDisplayTitle(input: { artistName: string | null; handle: string | null }): string {
  const name = (input.artistName ?? '').trim()
  if (name) return name
  if (input.handle) return `@${input.handle}`
  return ''
}

/**
 * The muted @handle line rendered beneath the title, or null when there
 * is nothing to show. Takes the already-resolved title (rather than the
 * raw artist name) so components/profile/ProfileView.tsx can call it with
 * nothing but the ProfileData it already holds — ProfileData carries
 * `name` and `handle`, not the raw artist name. Returns null when the
 * title already IS the `@handle` string, so the handle never renders
 * twice.
 */
export function profileHandleSubtitle(input: { title: string; handle: string | null }): string | null {
  if (!input.handle) return null
  const asTitle = `@${input.handle}`
  if (input.title === asTitle) return null
  return asTitle
}
