import {
  ALL_DOORS,
  CRATE_VERDICT,
  DOORS,
  OPENING,
  QUESTIONS,
  type Question,
} from '@/lib/onboarding/submit-song-copy'

const all = (q: Question) => q.answers.map(a => `${a.label} ${a.response ?? ''}`).join(' ')
const everyString = [
  OPENING.heading,
  OPENING.body,
  ...QUESTIONS.flatMap(q => [q.prompt, all(q)]),
  ...Object.values(CRATE_VERDICT).flatMap(v => [v.heading, v.body]),
  ...Object.values(DOORS).flatMap(d => [d.title, d.body]),
].join(' \n ')

describe('rule 1 — the song goes in first, and nothing is required', () => {
  it('opens with a statement, not a question', () => {
    expect(OPENING.heading).not.toContain('?')
    expect(OPENING.heading.toLowerCase()).toContain("it's in your vault")
  })

  it('says plainly that the vault is private and this is not a submission', () => {
    expect(OPENING.body.toLowerCase()).toContain('private')
    // The owner's framing: the CTA does not submit anything. If this screen
    // ever implies it did, the whole flow is lying about what happened.
    expect(everyString).not.toMatch(/you(r|'ve)? submitted|submission received|we have your (song|submission)/i)
  })

  it('tells the artist they can skip', () => {
    expect(OPENING.body.toLowerCase()).toMatch(/skip|nothing below is required/)
  })
})

describe('rule 2 — promise nothing we do not store', () => {
  it('never reuses the retired line Pass 2 caught', () => {
    // "We'll note it on the song so nobody asks you twice" shipped as copy
    // with no questionnaire, route or table behind it. It recorded nothing.
    expect(everyString).not.toMatch(/nobody asks you twice/i)
    expect(everyString).not.toMatch(/we'll note it on the song/i)
  })

  it('makes no claim about remembering, saving or applying an answer elsewhere', () => {
    expect(everyString).not.toMatch(/we'll remember|saved to your profile|we'll apply this/i)
  })
})

describe('rule 3 — splits default to even shares the writers control', () => {
  const splits = QUESTIONS.find(q => q.id === 'splits')!
  const notYet = splits.answers.find(a => a.value === 'not_yet')!

  it('the "not yet" answer carries the owner-directed reassurance', () => {
    expect(notYet.response).toBeDefined()
    expect(notYet.response).toMatch(/we got you/i)
  })

  it('promises EVEN shares, and says the writers set the numbers', () => {
    expect(notYet.response).toMatch(/even shares/i)
    expect(notYet.response).toMatch(/you and whoever you wrote it with set the numbers/i)
    expect(notYet.response).toMatch(/nothing's locked/i)
  })

  it('never implies the system derives a split from who did what', () => {
    // lib/catalogue/splits.ts: "The system NEVER proposes contribution-based
    // percentages... Adding one would be a doctrine violation, not a feature
    // request." Copy that implies otherwise is the same violation.
    const splitsCopy = all(splits)
    expect(splitsCopy).not.toMatch(/who did what|based on (your )?contribution|work out (the|your) split/i)
    expect(splitsCopy).not.toMatch(/we'll (decide|calculate|figure out|suggest).{0,20}(split|percentage|share)/i)
    expect(everyString).not.toMatch(/suggested split|recommended split/i)
  })

  it('all three answers are present and only the third was owner-directed', () => {
    expect(splits.answers.map(a => a.value)).toEqual(['written', 'verbal', 'not_yet'])
    // The middle answer is the genuinely risky state -- a verbal agreement is
    // what turns into a dispute -- so it gets urgency without shame.
    const verbal = splits.answers.find(a => a.value === 'verbal')!
    expect(verbal.response).toMatch(/before it matters/i)
    expect(verbal.response).not.toMatch(/should have|you failed|risk/i)
  })
})

describe('rule 4 — all four doors stay open, in every verdict', () => {
  it('names all four destinations', () => {
    expect(ALL_DOORS).toEqual(['crate', 'release', 'registration', 'distribution'])
    for (const d of ALL_DOORS) expect(DOORS[d]).toBeDefined()
  })

  it('the ineligible verdict reads as a routing fact about one song, not a judgement', () => {
    const body = CRATE_VERDICT.not_eligible.body
    expect(body).toMatch(/still yours/i)
    expect(body).toMatch(/everything else below is open/i)
    expect(body).not.toMatch(/rejected|denied|not good enough|doesn't qualify/i)
  })

  it('no verdict implies the readiness meter is the Crate gate', () => {
    // lib/vault/readiness.ts measures assets and metadata; the Crate
    // disqualifiers are AI provenance. A song can hit 100% and be ineligible.
    expect(everyString).not.toMatch(/readiness score|100%|percent ready/i)
  })
})

describe('the question set itself', () => {
  it('is the six the owner approved, with the sample question cut', () => {
    expect(QUESTIONS.map(q => q.id)).toEqual([
      'room', 'collaborators', 'splits', 'ai', 'vocals', 'destinations',
    ])
    // CUT 2026-09-26: the sample/interpolation question lives in the Release
    // Report instead (SampleFlagToggle -> computeStage3's sampleBlock).
    expect(everyString).not.toMatch(/interpolation/i)
  })

  it('asks the vocal check only when the song has vocals', () => {
    expect(QUESTIONS.find(q => q.id === 'vocals')!.conditional).toBe('has_vocals')
    expect(QUESTIONS.filter(q => q.conditional).map(q => q.id)).toEqual(['vocals'])
  })

  it('offers the two Crate disqualifiers as questions about their song, not rules to read', () => {
    const ai = QUESTIONS.find(q => q.id === 'ai')!
    const vocals = QUESTIONS.find(q => q.id === 'vocals')!
    expect(ai.prompt).toMatch(/\?$/)
    expect(vocals.prompt).toMatch(/\?$/)
    expect(ai.answers.map(a => a.value)).toContain('whole')
    expect(vocals.answers.map(a => a.value)).toContain('no_human_take')
  })

  it('keeps the AI questions warmer than legal — a badge, not a confession', () => {
    const aiCopy = all(QUESTIONS.find(q => q.id === 'ai')!) + all(QUESTIONS.find(q => q.id === 'vocals')!)
    expect(aiCopy).not.toMatch(/disclose|admit|declare|confess|violation|comply/i)
  })

  it('lets every question be answered without free text', () => {
    for (const q of QUESTIONS) expect(q.answers.length).toBeGreaterThanOrEqual(3)
  })

  it('routes "still writing" and "needs a mix" away from the Release Report', () => {
    // Corrected 2026-09-26: tracks.audio_file_url is a single column and
    // uploadTrackAudio upserts to a stable path, so a second upload OVERWRITES
    // the first. Versions and master designation live on the work side, so
    // anything unfinished belongs there.
    const room = QUESTIONS.find(q => q.id === 'room')!
    expect(room.answers.map(a => a.value)).toEqual(['done', 'close', 'writing'])
  })
})

describe('rule 2, structurally — a promise of a write is flagged as one', () => {
  const responses = QUESTIONS.flatMap(q => q.answers.filter(a => a.response))

  it('every response that commits the product to a record is marked requiresWrite', () => {
    // A nudge promises nothing. A commitment does. The distinction is what
    // stops copy from running ahead of the product again (Pass 2).
    const commits = /we'll (start|create|file|add|open|record)|we will (start|create|file|add|open|record)/i
    for (const a of responses) {
      if (commits.test(a.response!)) {
        expect(a.requiresWrite).toBe(true)
      }
    }
  })

  it('nothing is flagged that does not actually promise a write', () => {
    for (const a of responses.filter(a => a.requiresWrite)) {
      expect(a.response).toMatch(/we'll \w+/i)
    }
  })

  it('the splits "not yet" answer is the one flagged today', () => {
    const flagged = responses.filter(a => a.requiresWrite).map(a => a.value)
    expect(flagged).toEqual(['not_yet'])
  })
})
