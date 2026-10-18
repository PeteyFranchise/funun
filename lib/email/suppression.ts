/**
 * Shared by sendEmail (reader), the Resend webhook (writer) and the staff
 * un-suppress route, so the three can never disagree on what an address
 * looks like. public.email_suppressions enforces `email = lower(btrim(email))`,
 * so a writer that skipped this would be rejected and a reader that skipped it
 * would miss the row.
 */

/** `error` value sendEmail returns when every recipient is on the suppression list. */
export const RECIPIENT_SUPPRESSED_ERROR = 'Recipient suppressed'

/** Bare, lowercased address ("Name <a@b.c>" -> "a@b.c"). */
export function normalizeEmailAddress(raw: string): string {
  const angle = raw.match(/<([^>]*)>/)
  return (angle ? angle[1] : raw).trim().toLowerCase()
}
