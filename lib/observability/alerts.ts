import { getAlertRecipients } from './config'
import { sendEmail } from '@/lib/email'

// ─── D-08 extensible alert fan-out (32-05 Task 1) ──────────────────────
// The concrete realization of "never a hardcoded single sink; add company
// people as the team grows" — fanOutAlert reads the growable recipient
// list from lib/observability/config.ts (getAlertRecipients, table-backed
// with a Pete-only fallback) and loops lib/email's sendEmail once per
// recipient. Mirrors app/api/cron/curator-reach/route.ts's per-row
// resilience: one failed/rejected send never aborts the batch, other
// recipients still get their email. No literal recipient address lives in
// this file — the address list comes only from config.
export async function fanOutAlert(
  subject: string,
  html: string
): Promise<{ sent: number; failed: number }> {
  const recipients = await getAlertRecipients()

  let sent = 0
  let failed = 0

  for (const recipient of recipients) {
    try {
      const result = await sendEmail({ to: recipient.email, subject, html })
      if (result.ok) {
        sent += 1
      } else {
        failed += 1
      }
    } catch {
      // Never let one recipient's failure abort the batch.
      failed += 1
    }
  }

  return { sent, failed }
}
