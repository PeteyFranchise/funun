import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

/**
 * Create an in-app notification (and optionally an email copy).
 *
 * Pass a SERVICE-ROLE client — inserts bypass RLS so the matching engine and
 * apply flow can notify users other than the caller. `email` is optional; when
 * provided and `sendEmailCopy` is true, an email is sent and `emailed` is set.
 */
export async function createNotification(
  service: SupabaseClient,
  args: {
    userId: string
    type: string
    title: string
    body?: string | null
    link?: string | null
    data?: Record<string, unknown>
    email?: string | null
    sendEmailCopy?: boolean
  }
): Promise<{ ok: boolean; error?: string }> {
  let emailed = false
  if (args.sendEmailCopy && args.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const linkHtml = args.link
      ? `<p><a href="${appUrl}${args.link}">Open in Funūn →</a></p>`
      : ''
    const res = await sendEmail({
      to: args.email,
      subject: args.title,
      html: `<h2>${args.title}</h2>${args.body ? `<p>${args.body}</p>` : ''}${linkHtml}`,
      text: `${args.title}\n\n${args.body ?? ''}${args.link ? `\n\n${appUrl}${args.link}` : ''}`,
    })
    emailed = res.ok
  }

  const { error } = await service.from('notifications').insert({
    user_id: args.userId,
    type: args.type,
    title: args.title,
    body: args.body ?? null,
    link: args.link ?? null,
    data: args.data ?? {},
    emailed,
  })

  return { ok: !error, error: error?.message }
}
