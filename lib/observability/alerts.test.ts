import { getAlertRecipients } from './config'
import { sendEmail } from '@/lib/email'
import { fanOutAlert } from './alerts'

// ─── lib/observability/alerts.ts (32-05 Task 1) ────────────────────────
// Covers: multi-recipient fan-out (2 recipients -> sendEmail called twice
// with each recipient's own email), one-failure-doesn't-abort (a failing
// send still lets other recipients through and is counted, not thrown),
// and the single-default-recipient case (config falling back to the Pete
// default sends exactly once). Mirrors lib/staff/createStaffAccount.test.ts's
// jest.mock('@/lib/email') style.

jest.mock('./config', () => ({
  getAlertRecipients: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('fanOutAlert', () => {
  it('sends once per recipient from the growable config list', async () => {
    ;(getAlertRecipients as jest.Mock).mockResolvedValue([
      { email: 'pete@funun.studio', role: 'primary' },
      { email: 'backup@funun.studio', role: 'backup' },
    ])
    ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })

    const result = await fanOutAlert('Subject', '<p>body</p>')

    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(sendEmail).toHaveBeenNthCalledWith(1, {
      to: 'pete@funun.studio',
      subject: 'Subject',
      html: '<p>body</p>',
    })
    expect(sendEmail).toHaveBeenNthCalledWith(2, {
      to: 'backup@funun.studio',
      subject: 'Subject',
      html: '<p>body</p>',
    })
    expect(result).toEqual({ sent: 2, failed: 0 })
  })

  it('does not let one failing recipient abort the batch', async () => {
    ;(getAlertRecipients as jest.Mock).mockResolvedValue([
      { email: 'pete@funun.studio', role: 'primary' },
      { email: 'broken@funun.studio', role: 'watcher' },
      { email: 'watcher@funun.studio', role: 'watcher' },
    ])
    ;(sendEmail as jest.Mock)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'Email not configured' })
      .mockResolvedValueOnce({ ok: true })

    const result = await fanOutAlert('Subject', '<p>body</p>')

    expect(sendEmail).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ sent: 2, failed: 1 })
  })

  it('counts a thrown/rejected send as a failure without aborting the batch', async () => {
    ;(getAlertRecipients as jest.Mock).mockResolvedValue([
      { email: 'pete@funun.studio', role: 'primary' },
      { email: 'watcher@funun.studio', role: 'watcher' },
    ])
    ;(sendEmail as jest.Mock)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ok: true })

    const result = await fanOutAlert('Subject', '<p>body</p>')

    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ sent: 1, failed: 1 })
  })

  it('sends exactly once to the single default recipient when config falls back', async () => {
    ;(getAlertRecipients as jest.Mock).mockResolvedValue([{ email: 'pete@funun.studio', role: 'primary' }])
    ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })

    const result = await fanOutAlert('Subject', '<p>body</p>')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith({
      to: 'pete@funun.studio',
      subject: 'Subject',
      html: '<p>body</p>',
    })
    expect(result).toEqual({ sent: 1, failed: 0 })
  })
})
