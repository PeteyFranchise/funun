# First-sign-in experience for artists and invited collaborators

**Status:** Built and migration 157 operator-verified live on 2026-09-02; deployment confirmation and signed-in UAT remain.

## Implementation status

- [x] Existing accounts are backfilled as complete; only accounts created after migration 157 receive the experience.
- [x] Collaborator context is derived from the server-verified `claimed_by` identity bridge.
- [x] Collaborator invitees lead with “Review my profile” and receive a shared Writer's Room link when one exists.
- [x] Writer's Room invitations create and claim the member profile, mark the invitation accepted, and enter the invited song first.
- [x] The rest-of-site welcome stays pending until that member later leaves the Writer's Room for Sound Vault.
- [x] Other newly admitted artists lead with “Start my first song” and can choose “Set up my rights” to get down to business first.
- [x] “Enter my vault” permanently dismisses the welcome without trapping the person in a tour.
- [x] Buyer and staff routing remain untouched.
- [x] Apply `157_first_sign_in_experience.sql` through the human-gated production migration process — operator verified on 2026-09-02.
- [ ] Deploy the application after migration 157 is confirmed.
- [ ] Test one new Writer's Room invite end to end: email → signup → created/claimed profile → exact room landing → later Vault welcome.
- [ ] Test one collaborator invite without a linked work and one ordinary artist invite.
- [ ] Confirm returning visits no longer show the welcome after any action is chosen.

Implementation report: `.planning/quick/260902-first-sign-in-experience/SUMMARY.md`.

## Objective

Create a first session that confirms the person is in the right place,
recognizes how they arrived, and gives them one clear next action.

## Current evidence

- An invited collaborator currently lands on a generic empty Sound Vault.
- The screen presents overlapping creation actions (“Start a song,” “New
  project,” and “Create your first project”) even though the person may have
  joined primarily to review a collaborator profile or work with an inviter.
- A missing artist capability can make the sidebar look like a reduced product
  without explaining why. Migration 147 addresses that defect; onboarding
  design must not be used to conceal authorization failures.

## Access invariant

On first sign-in, a self-serve artist or invited collaborator with artist
access should see Sound Vault, Contract Locker, Split Sheets, Deals,
Collaborators, The Green Room, Network, Messages, Antenna, PitchPlug,
Benchmarks, Launchpad, Rights Coach, Earnings, and Settings. Sync Library
remains hidden until the artist has an admitted listing.

## Discussion agenda

1. Choose the first destination by signup source:
   - collaborator invite;
   - artist invite or waitlist admission;
   - later account-access paths.
2. Decide whether an invited collaborator should first review their profile,
   enter the shared song, or see a short welcome screen with one primary CTA.
3. Replace competing empty-state actions with one primary action and one quiet
   secondary path.
4. Define a short, dismissible first-session checklist, potentially covering
   profile details, PRO/IPI information, shared work, and room orientation.
5. Preserve completed onboarding state so returning users enter the product
   normally and are never trapped in a tour.

## Recommended starting concept

For a collaborator invite, show: “Welcome to Funūn. Your collaborator profile
is ready.” Use one primary CTA, “Review my profile.” If the invitation is tied
to a shared work, make “Open the song” the next contextual action. Offer song
creation only after those invitation-specific tasks, not as the dominant first
instruction.

## Definition of success

An invited collaborator can sign up, immediately recognize why they are in
Funūn, see all appropriate rooms, understand the single next step, and reach
their claimed profile or shared work without guessing between buttons.
