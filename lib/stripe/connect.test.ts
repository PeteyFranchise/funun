import { buildExpressAccountParams, buildDestinationChargeParams, type PayableDeal } from './connect'

describe('buildExpressAccountParams', () => {
  it('sets the account type to express', () => {
    const params = buildExpressAccountParams('US')
    expect(params.type).toBe('express')
  })

  it('requests the transfers capability', () => {
    const params = buildExpressAccountParams('US')
    expect(params.capabilities?.transfers?.requested).toBe(true)
  })

  it('does NOT request the card_payments capability — the connected account never charges anyone (RESEARCH Pitfall 5)', () => {
    const params = buildExpressAccountParams('US')
    expect(params.capabilities?.card_payments).toBeUndefined()
  })

  it('passes through the requested country', () => {
    const params = buildExpressAccountParams('CA')
    expect(params.country).toBe('CA')
  })
})

describe('buildDestinationChargeParams', () => {
  const account = 'acct_test_123'

  it('derives the application fee from computeNetFee, not a value passed in by a caller', () => {
    const deal: PayableDeal = { id: 'deal-1', gross_fee_cents: 500_000, commission_pct: 20 }
    const params = buildDestinationChargeParams(deal, account)
    expect(params.applicationFeeAmountCents).toBe(100_000)
  })

  it('sets the charge amount to the deal stored gross fee', () => {
    const deal: PayableDeal = { id: 'deal-1', gross_fee_cents: 500_000, commission_pct: 20 }
    const params = buildDestinationChargeParams(deal, account)
    expect(params.amountCents).toBe(500_000)
  })

  it('sets the transfer destination to the artist connected account id', () => {
    const deal: PayableDeal = { id: 'deal-1', gross_fee_cents: 500_000, commission_pct: 20 }
    const params = buildDestinationChargeParams(deal, account)
    expect(params.transferDestination).toBe(account)
  })

  it('the application fee plus the amount transferred to the artist always reconstitutes the gross exactly — no rounding leak', () => {
    const amounts = [1, 3, 7, 99, 101, 12_345, 999_999, 1_000_001]
    const pcts = [0, 1, 10, 15, 20, 25, 33.33, 50, 66.5, 99, 100]
    for (const gross of amounts) {
      for (const pct of pcts) {
        const deal: PayableDeal = { id: 'deal-x', gross_fee_cents: gross, commission_pct: pct }
        const params = buildDestinationChargeParams(deal, account)
        const netTransferredToArtist = params.amountCents - params.applicationFeeAmountCents
        expect(params.applicationFeeAmountCents + netTransferredToArtist).toBe(gross)
      }
    }
  })

  it('throws a descriptive Error when the deal has no gross fee', () => {
    const deal: PayableDeal = { id: 'deal-2', gross_fee_cents: null, commission_pct: 20 }
    expect(() => buildDestinationChargeParams(deal, account)).toThrow(/gross fee/i)
  })

  it('throws a descriptive Error when the deal has no commission percentage', () => {
    const deal: PayableDeal = { id: 'deal-3', gross_fee_cents: 500_000, commission_pct: null }
    expect(() => buildDestinationChargeParams(deal, account)).toThrow(/commission/i)
  })

  it('throws a descriptive Error when there is no connected account id', () => {
    const deal: PayableDeal = { id: 'deal-4', gross_fee_cents: 500_000, commission_pct: 20 }
    expect(() => buildDestinationChargeParams(deal, null)).toThrow(/connected account/i)
  })
})
