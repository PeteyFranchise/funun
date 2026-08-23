// ─── ADMIN_CONSOLE_CSS ──────────────────────────────────────────────────
// The single-sourced `.fncon` base token block + shared base rules,
// mirroring components/buyer/fnbl-theme.ts's structure exactly: DARK is
// the base token set (the plum-console palette this repo already renders
// today via bg-ink/text-white/text-lav/text-lavdim/border-white-10 --
// lifted verbatim into custom properties), plus a `[data-theme="light"]`
// override that re-declares the SAME custom-property names with the
// verified Funūn brand light palette (ported from components/buyer's own
// FNBL_CSS light tokens for cross-console visual consistency). The
// attribute selector outranks plain `.fncon` by specificity, so the light
// override always wins once `data-theme="light"` is set, regardless of
// where in the cascade ADMIN_CONSOLE_CSS is injected.
//
// app/(admin)/layout.tsx injects this ONCE for the whole Team Console;
// component-specific classes stay scoped to the components that render
// them (StaffAdmin, MyCompanies, the layout's own sidebar) so this module
// stays tokens + shared base rules only, matching FNBL_CSS's convention.
//
// Role hues (--r-lead / --r-ae / --r-bd / --r-anr / --r-legal / --r-it /
// --r-tms) are the per-staff-role accent colors for the Team Members surface
// (StaffAdmin's role pills, filter chips, and role-select cards). Defined in
// BOTH token blocks — dark base + the light override — so a role reads legibly
// against either ground; components mix them at low alpha via color-mix().
export const ADMIN_CONSOLE_CSS = `
.fncon{--ground:#0a0a0f;--panel:#0E0D1E;--panel-2:#1A1838;--ink:#FFFFFF;--ink-2:#C7CBF7;--ink-3:#7c80b4;--border:rgba(199,203,247,.12);--border-2:rgba(199,203,247,.22);--indigo:#818CF8;--fuchsia:#D946EF;--grad:linear-gradient(105deg,#818CF8 0%,#D946EF 100%);--green-fg:#34D399;--green-bg:rgba(52,211,153,.11);--green-line:rgba(52,211,153,.3);--amber-fg:#F4C77B;--amber-bg:rgba(245,158,11,.11);--amber-line:rgba(245,158,11,.3);--rose-fg:#F9A8C0;--rose-bg:rgba(244,63,94,.1);--rose-line:rgba(244,63,94,.3);--r-lead:#818CF8;--r-ae:#34D399;--r-bd:#F59E0B;--r-anr:#D946EF;--r-legal:#FB7185;--r-it:#38BDF8;--r-tms:#FB923C;--r-accounting:#FACC15;--r-marketing:#C084FC;background:var(--ground);color:var(--ink);min-height:100vh;}
.fncon *{box-sizing:border-box;}
.fncon .icn{stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
.fncon .gtext{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;}
.fncon .fncon-cta{background:var(--grad);color:#fff;}
.fncon[data-theme="light"]{--ground:#FFFFFF;--panel:#F1EDFE;--panel-2:#E7E1FC;--ink:#241A4D;--ink-2:#5F5885;--ink-3:#8B85AB;--border:#DED7FB;--border-2:#CFC5F7;--indigo:#6D5AE0;--fuchsia:#B22BC9;--grad:linear-gradient(105deg,#6D5AE0 0%,#B22BC9 100%);--green-fg:#0B7A57;--green-bg:#E4F6EF;--green-line:#B6E4D3;--amber-fg:#8A5B04;--amber-bg:#FDF3E0;--amber-line:#F0DCB2;--rose-fg:#A62742;--rose-bg:#FDEBEF;--rose-line:#F5C9D3;--r-lead:#6D5AE0;--r-ae:#0B7A57;--r-bd:#8A5B04;--r-anr:#B22BC9;--r-legal:#A62742;--r-it:#0284C7;--r-tms:#C2410C;--r-accounting:#A16207;--r-marketing:#7E22CE;}
`
