import Link from 'next/link'
import type { CollaboratorProfile } from '@/lib/collaborators'
import type { CollaboratorIdentityHint } from '@/lib/collaborators/display-identity'
import {
  collaboratorDisplayName,
  formatMemberHandle,
  memberProfileHref,
  visibleHandle,
} from '@/lib/collaborators/display-identity'

// ─── CollaboratorIdentityLabel ────────────────────────────────────────────
// The ONE rendering of "who is this person" — used by the roster card, the
// roster list row, the Metadata Studio / Work Roster picker and the
// split-sheet PartyPicker. Every surface that asks a Member to tell two
// same-named collaborators apart must show the same two lines:
//
//   Eric Smith        ← the owner's own structured roster name
//   @ericsmith        ← only when the server resolver cleared it
//
// The component cannot source a handle itself: it renders what the hint
// carries and nothing else, so no surface can invent a looser disclosure
// rule than lib/collaborators/identity-hints.server.ts.
// ─────────────────────────────────────────────────────────────────────────

type Props = {
  collaborator: Partial<CollaboratorProfile>
  hint?: CollaboratorIdentityHint | null
  /** `card` centers the stack; `row` left-aligns it for list/picker rows. */
  align?: 'center' | 'left'
  /**
   * Link the name and handle to `/u/{handle}`. Off by default: picker rows are
   * themselves buttons, and an anchor inside a button is invalid markup.
   */
  linkProfile?: boolean
  /** Tailwind classes for the primary name line. */
  nameClassName?: string
}

export function CollaboratorIdentityLabel({
  collaborator,
  hint,
  align = 'center',
  linkProfile = false,
  nameClassName = 'text-[15px] font-bold text-white',
}: Props) {
  const name = collaboratorDisplayName(collaborator)
  const handle = visibleHandle(hint)
  const handleLabel = formatMemberHandle(handle)
  const href = linkProfile ? memberProfileHref(hint) : null
  const alignClass = align === 'center' ? 'items-center text-center' : 'items-start text-left'

  return (
    <span className={`flex min-w-0 flex-col ${alignClass}`}>
      {href ? (
        <Link href={href} className={`${nameClassName} max-w-full truncate hover:underline`}>
          {name}
        </Link>
      ) : (
        <span className={`${nameClassName} max-w-full truncate`}>{name}</span>
      )}

      {handleLabel &&
        (href ? (
          <Link href={href} className="max-w-full truncate text-[12px] text-brandindigo hover:underline">
            {handleLabel}
          </Link>
        ) : (
          <span className="max-w-full truncate text-[12px] text-brandindigo">{handleLabel}</span>
        ))}
    </span>
  )
}
