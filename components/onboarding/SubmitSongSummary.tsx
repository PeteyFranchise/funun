'use client'

// ─── The closing screen ───────────────────────────────────────────────────
//
// Not a score. Three plain statements: where the song lives, the Crate
// verdict, and every door still open.
//
// DECISION #10 (owner 2026-08-30): Crate / Release / Registration /
// Distribution are first-class, with "the same guidance energy for the artist
// who never submits to it." So ALL FOUR doors render in every verdict --
// especially the ineligible one, which is the case this rule exists for.
// Someone who arrived for sync and turns out ineligible must land somewhere
// useful, not in a dead end.
//
// The verdict itself comes from resolveQuestionnaireVerdict, which defers to
// lib/catalogue/ai-entries.ts. No eligibility is computed here.

import Link from 'next/link'
import { ALL_DOORS, CRATE_VERDICT, DOORS } from '@/lib/onboarding/submit-song-copy'
import { resolveQuestionnaireVerdict, type Answers } from '@/lib/onboarding/submit-song-verdict'

type Props = {
  workId: string
  hasVocals: boolean
  answers: Answers
}

export function SubmitSongSummary({ workId, hasVocals, answers }: Props) {
  const verdict = resolveQuestionnaireVerdict(answers, hasVocals)

  const crate =
    verdict.kind === 'clear'
      ? CRATE_VERDICT.eligible
      : verdict.kind === 'resolved'
        ? verdict.consequence.eligible
          ? CRATE_VERDICT.eligible
          : CRATE_VERDICT.not_eligible
        : CRATE_VERDICT.not_yet

  // The resolver's own sentence, shown verbatim when it has one. Its wording
  // is the product's considered answer; paraphrasing it here would create the
  // second source of truth this module exists to avoid.
  const detail =
    verdict.kind === 'resolved'
      ? verdict.consequence.eligible
        ? verdict.consequence.note
        : verdict.consequence.reason
      : null

  const fix =
    verdict.kind === 'resolved' && !verdict.consequence.eligible
      ? verdict.consequence.fix
      : undefined

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-[12px] border border-hair bg-card px-[26px] py-[26px]">
        <p className="text-[10px] uppercase tracking-[.16em] text-lavdim">Where it lives</p>
        <h2 className="mt-[6px] text-[18px] font-bold leading-snug text-white">
          It&rsquo;s in your Sound Vault, and it&rsquo;s private.
        </h2>
        <Link
          href={`/vault/works/${workId}`}
          className="mt-3 inline-block text-[13px] text-white underline underline-offset-4"
        >
          Open your song →
        </Link>
      </div>

      <div className="rounded-[12px] border border-hair bg-card px-[26px] py-[26px]">
        <p className="text-[10px] uppercase tracking-[.16em] text-lavdim">Sync</p>
        <h2 className="mt-[6px] text-[18px] font-bold leading-snug text-white">{crate.heading}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-lavdim">{crate.body}</p>
        {detail && <p className="mt-3 text-[13px] leading-relaxed text-lavdim">{detail}</p>}
        {fix && (
          <p className="mt-2 rounded-lg border border-hair bg-card2 px-3.5 py-3 text-[13px] leading-relaxed text-lavdim">
            {fix}
          </p>
        )}
      </div>

      <div className="rounded-[12px] border border-hair bg-card px-[26px] py-[26px]">
        <p className="text-[10px] uppercase tracking-[.16em] text-lavdim">Everything this song can do</p>
        <div className="mt-4 flex flex-col gap-2">
          {ALL_DOORS.map(d => (
            <Link
              key={d}
              href={DOORS[d].href}
              className="rounded-lg border border-hair bg-card2 px-3.5 py-3 transition hover:border-white/25"
            >
              <b className="block text-[14px] text-white">{DOORS[d].title}</b>
              <span className="mt-0.5 block text-[13px] text-lavdim">{DOORS[d].body}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
