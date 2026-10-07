// ─── "Submit a song" onboarding copy ──────────────────────────────────────
//
// Pure data. No React, no I/O, no Supabase. Every user-visible string in the
// submit-a-song flow lives here so the doctrine rules below are testable in
// one place rather than scattered across JSX.
//
// FOUR RULES THIS MODULE EXISTS TO ENFORCE
//
// 1. THE SONG GOES IN FIRST. docs/architecture/ACCOUNT-TYPES.md: profile
//    completion "is never required before capturing an idea, entering a
//    Writer's Room, uploading a take, writing lyrics, or leaving a note."
//    The first screen is a STATEMENT, not an ask. Every question is skippable.
//
// 2. PROMISE NOTHING WE DO NOT STORE. An earlier draft of this flow carried
//    the line "We'll note it on the song so nobody asks you twice." Pass 2
//    found there was no questionnaire, route or table behind it -- it recorded
//    nothing. Owner ruling: promise nothing until the storage exists. Every
//    promise below is answered by a real write through an existing endpoint,
//    and the test asserts the retired phrasing never comes back.
//
// 3. SPLITS DEFAULT TO EVEN SHARES THE WRITERS CONTROL. lib/catalogue/splits.ts
//    carries the locked rule verbatim: "splits default to EQUAL shares... The
//    system NEVER proposes contribution-based percentages." So the reassurance
//    for "not yet" must promise even shares they set -- never "we'll work out
//    who did what." Saying otherwise would be a doctrine violation dressed up
//    as a kindness.
//
// 4. ALL FOUR DOORS STAY OPEN. Deliberation decision #10 (owner 2026-08-30)
//    names Crate / Release / Registration / Distribution as first-class, with
//    "the same guidance energy for the artist who never submits to it." This
//    matters most in the failure case: someone who arrives for sync and turns
//    out ineligible must land somewhere useful, not in a dead end.
//
// Tone, per the catalogue doctrine: hygiene moments run WARMER THAN LEGAL --
// citation is a badge, not a confession. Nobody is confessing to using a tool.

export type Destination = 'crate' | 'release' | 'registration' | 'distribution'

export type QuestionId = 'room' | 'collaborators' | 'splits' | 'ai' | 'vocals' | 'destinations'

export type Answer = {
  value: string
  label: string
  /** Shown immediately after choosing. Omitted where silence is better. */
  response?: string
}

export type Question = {
  id: QuestionId
  prompt: string
  /** Multi-select questions render checkboxes; the rest render a single choice. */
  multi?: boolean
  /** Only asked when the song has vocals. */
  conditional?: 'has_vocals'
  answers: Answer[]
}

// The first screen says what already happened. It does not ask anything.
export const OPENING = {
  heading: "It's in your vault.",
  body:
    "It's private — nobody at Funūn can see it yet. Nothing below is required; " +
    'skip anything you want and come back whenever.',
} as const

export const QUESTIONS: readonly Question[] = [
  {
    id: 'room',
    prompt: "Where's this song at right now?",
    answers: [
      { value: 'done', label: "It's done — mixed, mastered, ready to go out" },
      { value: 'close', label: "It's close — needs a mix or a master" },
      { value: 'writing', label: "Still writing it" },
    ],
  },
  {
    id: 'collaborators',
    prompt: 'Who else is on it?',
    answers: [
      { value: 'solo', label: 'Just me' },
      { value: 'reachable', label: 'A few people, and I know how to reach them' },
      {
        value: 'unreachable',
        label: 'A few people, and tracking them down is the problem',
        response: "That's the part we're actually good at. Add who you remember — we'll keep the record.",
      },
    ],
  },
  {
    id: 'splits',
    prompt: 'Are the splits agreed?',
    answers: [
      {
        value: 'written',
        label: 'Agreed and written down',
        response: 'Nice. Bring it in and it rides with the song from here.',
      },
      {
        value: 'verbal',
        label: 'Agreed out loud, nothing signed',
        response: "That's most songs. Let's make it real before it matters.",
      },
      {
        value: 'not_yet',
        label: 'Not yet',
        // OWNER-DIRECTED 2026-09-26: "after not yet, say 'don't worry we got
        // you' with an emoji or something." Load-bearing, not just warm: the
        // promise is EVEN SHARES THE WRITERS SET. Never "we'll work out who
        // did what" -- see rule 3 in this file's header.
        response:
          "No stress — we got you. 🤝 We'll start a split sheet on this song at even shares. " +
          "Nothing's locked: you and whoever you wrote it with set the numbers when you're ready.",
      },
    ],
  },
  {
    id: 'ai',
    prompt: 'Did any of this come out of an AI tool?',
    answers: [
      { value: 'none', label: 'No' },
      { value: 'partial', label: 'Some of it — instruments, beats, a melody or a lyric line' },
      { value: 'whole', label: 'The whole track came out of a tool' },
    ],
  },
  {
    id: 'vocals',
    prompt: 'The voices on it — can you point to the human take each one came from?',
    conditional: 'has_vocals',
    answers: [
      { value: 'all_human', label: 'Every voice started with a person singing' },
      { value: 'built_from_take', label: 'Some were built by a tool from a take we have' },
      { value: 'no_human_take', label: 'At least one has no human take behind it' },
    ],
  },
  {
    id: 'destinations',
    prompt: 'Where do you want this song to end up?',
    multi: true,
    answers: [
      { value: 'distribution', label: 'Out on DSPs' },
      { value: 'crate', label: 'Up for sync' },
      { value: 'registration', label: 'Registered properly' },
      { value: 'unsure', label: 'Not sure yet' },
    ],
  },
]

// ─── The summary ──────────────────────────────────────────────────────────
//
// Not a score. Three plain statements: where the song lives, what it's
// missing, and the Crate verdict -- with the other doors on screen in all
// three verdict cases.

export type CrateVerdict = 'eligible' | 'not_yet' | 'not_eligible'

export const CRATE_VERDICT: Record<CrateVerdict, { heading: string; body: string }> = {
  eligible: {
    heading: 'This one can go up for sync.',
    body: "Nothing's blocking it. When you're ready, submit it and our team takes a listen.",
  },
  not_yet: {
    heading: 'Almost — one thing first.',
    body: "Finish the step above and this song can go up for sync. Nothing here is permanent.",
  },
  not_eligible: {
    heading: "This one can't go up for sync.",
    // The ineligible case is the whole reason the doors below exist. It must
    // read as a routing fact about one song, never as a judgement.
    body:
      "Sync licensing needs a human performance behind every voice, so this particular song " +
      "isn't a fit. It's still yours, it still lives here, and everything else below is open.",
  },
}

export const DOORS: Record<Destination, { title: string; body: string; href: string }> = {
  crate: {
    title: 'The Crate',
    body: 'Put it up for sync and let our team pitch it.',
    href: '/vault',
  },
  release: {
    title: 'The Release Report',
    body: 'Take it out to DSPs with the full readiness checklist.',
    href: '/vault',
  },
  registration: {
    title: 'Registration',
    body: 'Get it on record with your PRO and the copyright office.',
    href: '/vault',
  },
  distribution: {
    title: 'Distribution',
    body: 'Line up a distributor when the song is ready to ship.',
    href: '/vault',
  },
}

// Always all four, always in this order, whatever the Crate verdict says.
// Decision #10: "the same guidance energy for the artist who never submits."
export const ALL_DOORS: readonly Destination[] = ['crate', 'release', 'registration', 'distribution']

export const SKIP_LABEL = 'Skip'
export const SKIP_ALL_LABEL = 'Skip the rest'
