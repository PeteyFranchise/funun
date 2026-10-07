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
    // Nothing is wired yet, so the honest value is empty.
    expect(visible).toMatch(/fulfilledWrites=\{\[\]\}/)
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
