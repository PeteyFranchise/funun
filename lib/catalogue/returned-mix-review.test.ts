import { returnedMixReviewAction } from './returned-mix-review'

describe('returned mix review copy', () => {
  it('offers an explicit working-take decision without inventing approval language', () => {
    expect(returnedMixReviewAction({ isWorking: false, hasWorkingTake: true })).toEqual({
      primary: 'Make this the working take',
      secondary: 'Keep current working take',
    })
    expect(returnedMixReviewAction({ isWorking: false, hasWorkingTake: false }).secondary).toBe('Leave working take unset')
  })

  it('does not offer a contradictory keep-current action when the return is already working', () => {
    expect(returnedMixReviewAction({ isWorking: true, hasWorkingTake: true })).toEqual({
      primary: 'Confirm as working',
      secondary: null,
    })
  })
})
