// ─── Shared auth surface field/CTA classes ─────────────────────────────
// Single source of truth for /signin, /signup, /forgot-password and
// /update-password so the four pages cannot drift from each other or from
// the owner-approved bench (private/bench/signin.html, signup.html).
//
// `[font-weight:650]` on AUTH_CTA uses Tailwind's arbitrary-property syntax
// rather than `font-[650]` — the latter is ambiguous and Tailwind can
// mis-infer it as a font-family utility instead of font-weight.
//
// AUTH_CTA is `inline-flex` with centering (not `flex`) so the same
// constant styles both a real `<button>` and the existing-account state's
// `<Link>`-as-button, which needs to center its text without stretching to
// a block element inside its wrapper.

export const AUTH_H1 = 'text-[21px] font-bold leading-[1.2] tracking-[-.022em] text-white'

export const AUTH_SUB = 'mt-[5px] text-[13px] leading-[1.55] text-lavdim'

export const AUTH_LABEL = 'mb-1.5 block text-[11.5px] font-semibold text-lav'

export const AUTH_INPUT =
  'h-[42px] w-full rounded-[11px] border border-hair bg-white/[0.04] px-[13px] text-[13.5px] text-white outline-none transition placeholder:text-[#5b5f8c] focus:border-[rgba(129,140,248,.6)] focus:shadow-[0_0_0_3px_rgba(129,140,248,.16)]'

export const AUTH_TEXTAREA =
  'min-h-[86px] w-full resize-none rounded-[11px] border border-hair bg-white/[0.04] px-[13px] py-[11px] text-[13.5px] leading-[1.5] text-white outline-none transition placeholder:text-[#5b5f8c] focus:border-[rgba(129,140,248,.6)] focus:shadow-[0_0_0_3px_rgba(129,140,248,.16)]'

export const AUTH_CTA =
  'inline-flex h-[44px] w-full items-center justify-center rounded-[12px] bg-grad text-[14px] [font-weight:650] text-white shadow-cta transition hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100'

export const AUTH_HINT = 'mt-1.5 block text-[11px] leading-[1.5] text-lavdim'

export const AUTH_HINT_OK = 'mt-1.5 block text-[11px] leading-[1.5] text-emerald-400'

export const AUTH_HINT_BAD = 'mt-1.5 block text-[11px] leading-[1.5] text-rose-500'

export const AUTH_ERROR_PANEL =
  'rounded-[11px] border border-rose-500/30 bg-rose-500/10 p-3 text-[12.5px] leading-[1.5] text-rose-200'

export const AUTH_FOOT = 'mt-4 text-center text-[12px] text-lavdim'

export const AUTH_FOOT_LINK = 'font-semibold text-white hover:underline'

export const AUTH_INLINE_LINK = 'text-[12px] font-semibold text-white hover:underline'
