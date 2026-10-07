import { postSignInPath } from '@/lib/auth/postSignInPath'
import { OPENING } from '@/lib/onboarding/submit-song-copy'
import fs from 'fs'
import path from 'path'

const PAGE = path.join(process.cwd(), 'app/(artist)/vault/new/song/page.tsx')
const source = fs.readFileSync(PAGE, 'utf8')

/**
 * Strips /* *\/ blocks (which covers {/* JSX comments *\/} too) and whole-line
 * // comments. The absence assertions below must read what a USER sees, not
 * what the file explains about itself -- this page's own header names
 * /api/sync-library/submit and "readiness score" precisely to say it does
 * neither, and an unstripped check flags that as a violation. Same discipline
 * as the migration text-lock tests.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n')
}

const visible = stripComments(source)

// No jsdom in this harness (see .claude/CLAUDE.md), so a component test here
// could not observe interaction state and would print green while proving
// nothing. These assertions cover the two things that ARE checkable: the
// deep-link contract the marketing CTA depends on, and the source-level
// commitments the doctrine rules make about this screen.

describe('the marketing CTA deep link survives sign-in', () => {
  const user = { app_metadata: {} }

  it('routes a freshly signed-in member to the capture-first screen', () => {
    expect(postSignInPath({ user, next: '/vault/new/song' })).toBe('/vault/new/song')
  })

  it('still rejects an off-site next, so the CTA cannot be turned into an open redirect', () => {
    for (const evil of ['//evil.com', '/\\evil.com', 'https://evil.com', '/\t//evil.com']) {
      expect(postSignInPath({ user, next: evil })).not.toContain('evil.com')
    }
  })

  it('falls back to the normal destination when no next is given', () => {
    expect(postSignInPath({ user, next: null })).not.toBe('/vault/new/song')
  })
})

describe('the screen keeps the promises the copy module is tested on', () => {
  it('renders the opening statement from the copy module, not a local literal', () => {
    expect(source).toMatch(/from '@\/lib\/onboarding\/submit-song-copy'/)
    expect(source).toContain('OPENING.heading')
    expect(source).toContain('OPENING.body')
    // The heading must not be duplicated inline, or the copy tests stop
    // governing what users actually read.
    expect(visible).not.toContain(OPENING.heading)
  })

  it('creates the work on an explicit action, never on page load', () => {
    // A GET that writes a row would orphan a work on every refresh or back.
    expect(source).toMatch(/onSubmit=\{createWork\}/)
    expect(source).not.toMatch(/useEffect\([^)]*fetch\('\/api\/works'/)
  })

  it('says the vault is private and that this is not a submission', () => {
    expect(visible).toMatch(/private Sound Vault/i)
    expect(visible).toMatch(/not up for sync|not to our team/i)
  })

  it('makes no submission claim and shows no readiness score', () => {
    expect(visible).not.toMatch(/you(r|'ve)? submitted|submission received|under review/i)
    expect(visible).not.toMatch(/readiness|% ready|score/i)
  })

  it('touches no submission endpoint — submitting stays a separate explicit action', () => {
    expect(visible).not.toMatch(/sync-library\/submit/)
  })
})

describe('slice 3 — the three stages, and what the summary promises', () => {
  const questions = stripComments(
    fs.readFileSync(path.join(process.cwd(), 'components/onboarding/SubmitSongQuestions.tsx'), 'utf8')
  )
  const summary = stripComments(
    fs.readFileSync(path.join(process.cwd(), 'components/onboarding/SubmitSongSummary.tsx'), 'utf8')
  )

  it('the questions screen is reached only after the song exists', () => {
    // Both question and summary branches are guarded on workId, so no question
    // can precede capture.
    expect(visible).toMatch(/workId && stage === 'questions'/)
    expect(visible).toMatch(/workId && stage === 'summary'/)
  })

  it('a response that promises a write cannot render until the write lands', () => {
    expect(questions).toMatch(/a\.requiresWrite && !fulfilledWrites\.includes\(a\.value\)/)
    // The guard lives in the component and survives every slice. The value
    // passed in started as [] (slice 3, nothing wired) and is now state driven
    // by a real write (slice 4) -- asserted in the slice 4 block below. What
    // must never change is that the guard exists at all.
    expect(questions).toMatch(/if \(a\.requiresWrite && !fulfilledWrites\.includes\(a\.value\)\) return null/)
  })

  it('every question is skippable, individually and in bulk', () => {
    expect(questions).toContain('SKIP_LABEL')
    expect(questions).toContain('SKIP_ALL_LABEL')
    // Skip advances without clearing what was already chosen.
    expect(questions).toMatch(/const advance = \(\) => setIndex/)
  })

  it('the summary renders ALL FOUR doors, not a filtered set', () => {
    // Decision #10: "the same guidance energy for the artist who never submits
    // to it." A .filter() here would quietly make the ineligible case a dead
    // end, which is the exact failure the rule exists to prevent.
    expect(summary).toMatch(/ALL_DOORS\.map/)
    expect(summary).not.toMatch(/ALL_DOORS\s*\.\s*filter/)
  })

  it('the summary computes no eligibility of its own', () => {
    expect(summary).toContain('resolveQuestionnaireVerdict')
    expect(summary).not.toMatch(/component === 'full'|hasHumanSource|no_human_take/)
  })

  it('the summary shows the resolver’s own sentence rather than a paraphrase', () => {
    expect(summary).toMatch(/consequence\.note/)
    expect(summary).toMatch(/consequence\.reason/)
  })
})

describe('slice 4 — the promised write actually happens', () => {
  const questions = stripComments(
    fs.readFileSync(path.join(process.cwd(), 'components/onboarding/SubmitSongQuestions.tsx'), 'utf8')
  )
  const worksRoute = stripComments(
    fs.readFileSync(path.join(process.cwd(), 'app/api/works/route.ts'), 'utf8')
  )

  it('the splits promise is fulfilled by promoting onto the sheet, not by creating one', () => {
    // POST /api/works already creates the living-draft sheet, deliberately
    // empty of parties. The promise is about getting the writers ONTO it.
    // Slice 4 promoted only the artist (`members/${ownerMemberId}/promote`);
    // slice 5 promotes the artist and every captured collaborator, so the id
    // is a loop variable now. What must hold either way is that the promise is
    // kept through the promote ROUTE, never by writing a sheet here.
    expect(visible).toMatch(/\/members\/\$\{[A-Za-z]+\}\/promote/)
    expect(visible).not.toMatch(/from\('split_sheets'\)|\/api\/split-sheets/)
  })

  it('only marks the promise fulfilled when the write succeeded', () => {
    // Slice 4 gated on a single `res.ok`. Slice 5 gates on `allOk` across
    // every writer, which is strictly stronger -- a partial promotion would
    // make "even shares" describe a sheet missing someone. The invariant is
    // that setFulfilled is never reached unconditionally.
    expect(visible).toMatch(/if \((res\.ok|allOk)\) setFulfilled/)
    const unconditional = /(?<!if \([a-zA-Z.]+\) )setFulfilled\(prev => \(prev\.includes/
    expect(visible).not.toMatch(unconditional)
  })

  it('fulfilledWrites is now driven by state, not hardcoded empty', () => {
    expect(visible).toMatch(/fulfilledWrites=\{fulfilled\}/)
    expect(visible).not.toMatch(/fulfilledWrites=\{\[\]\}/)
  })

  it('sends no designation — an honest "not stated", never a fabricated role', () => {
    expect(visible).toMatch(/JSON\.stringify\(\{\}\)/)
    expect(visible).not.toMatch(/designation:\s*'/)
  })

  it('the write is attempted at answer time, so the promise can sit beside the answer', () => {
    expect(questions).toMatch(/onAnswer\?\.\(question\.id, next\)/)
    // Non-blocking: the artist is never held up by it, in either direction.
    expect(questions).toMatch(/void onAnswer/)
  })

  it('POST /api/works returns ownerMemberId additively, breaking no existing caller', () => {
    expect(worksRoute).toMatch(/ownerMemberId: ownerMember\?\.id \?\? null/)
    // The work's own fields are still spread at the top level, so every
    // existing `data.id` reader is untouched.
    expect(worksRoute).toMatch(/\{ \.\.\.work, ownerMemberId/)
  })
})

describe('slice 5 — the collaborator path', () => {
  const capture = stripComments(
    fs.readFileSync(path.join(process.cwd(), 'components/onboarding/SubmitSongCollaborators.tsx'), 'utf8')
  )
  const questions = stripComments(
    fs.readFileSync(path.join(process.cwd(), 'components/onboarding/SubmitSongQuestions.tsx'), 'utf8')
  )

  it('records a collaborator from a NAME ALONE — the unreachable case the copy promises', () => {
    // Q2's third answer is "tracking them down is the problem" and the reply is
    // "Add who you remember." The members endpoint's new-collaborator branch
    // requires an email (members/route.ts:41-46), so capture goes through
    // /api/collaborators first, whose gate is `if (!update.name)`.
    expect(visible).toMatch(/'\/api\/collaborators'/)
    expect(visible).toMatch(/JSON\.stringify\(email \? \{ name, email \} : \{ name \}\)/)
    expect(capture).toMatch(/Email \(optional\)/)
    expect(capture).toMatch(/A name is enough/)
  })

  it('adds everyone as membership only — never straight onto the splits', () => {
    // Pitfall 3: being on the work and being on the splits are different facts.
    expect(visible).toMatch(/is_writer: false/)
    expect(visible).toMatch(/tier: 'contribute'/)
    expect(visible).not.toMatch(/is_writer: true/)
  })

  it('offers the capture form only when the caller can actually write', () => {
    // A form that cannot record is the same class of error as copy promising a
    // record that never happens.
    expect(questions).toMatch(/question\.id === 'collaborators' &&\s*\n\s*onAddCollaborator &&/)
    expect(questions).toMatch(/chosen\.includes\('reachable'\) \|\| chosen\.includes\('unreachable'\)/)
  })

  it('promotes the artist AND every captured collaborator when splits are not agreed', () => {
    expect(visible).toMatch(/\[ownerMemberId, \.\.\.collaborators\.map\(c => c\.memberId\)\]/)
  })

  it('promotes sequentially, because each promotion redrafts the same sheet', () => {
    // planWriterPromotion reads the sheet, redrafts every party to an equal
    // share and writes it back. Concurrent promotions would race on those rows.
    expect(visible).toMatch(/for \(const id of ids\)/)
    expect(visible).not.toMatch(/Promise\.all\(ids/)
  })

  it('only claims the sheet is set up if EVERY writer landed on it', () => {
    // A partial promotion would make "even shares" describe a sheet missing
    // someone -- a worse lie than saying nothing.
    expect(visible).toMatch(/let allOk = true/)
    expect(visible).toMatch(/if \(allOk\) setFulfilled/)
  })

  it('returns null on a failed add so the UI can say so instead of pretending', () => {
    expect(visible).toMatch(/if \(!cRes\.ok \|\| !collaboratorId\) return null/)
    expect(visible).toMatch(/if \(!mRes\.ok \|\| !memberId\) return null/)
    expect(capture).toMatch(/Could not add them/)
  })
})
