export type ReturnedMixReviewOutcome = 'made_working' | 'kept_current'

export function returnedMixReviewAction(input: { isWorking: boolean; hasWorkingTake: boolean }): {
  primary: string
  secondary: string | null
} {
  if (input.isWorking) return { primary: 'Confirm as working', secondary: null }
  return {
    primary: 'Make this the working take',
    secondary: input.hasWorkingTake ? 'Keep current working take' : 'Leave working take unset',
  }
}
