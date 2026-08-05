// ─── FNBL_CSS ──────────────────────────────────────────────────────────
// The single-sourced `.fnbl` base token block + shared base rules, lifted
// verbatim from CatalogBrowserLight's original CSS constant, plus a
// `[data-theme="dark"]` override that re-declares the SAME custom-property
// names with Claude Design's dark buyer-portal palette (ported from
// mockups/buyer-catalogue (dark v1).html + app.css, falling back to
// tailwind.config.ts's artist dark tokens for anything the mockup does not
// specify). The attribute selector outranks plain `.fnbl` by specificity,
// so the dark override always wins once `data-theme="dark"` is set,
// regardless of where in the cascade FNBL_CSS is injected.
//
// app/(buyer-portal)/layout.tsx injects this ONCE for the whole buyer
// portal; component-specific classes (`.top`, `.tabs`, `.trow`, `.mini`,
// `.modal`, …) are NOT here — they stay scoped to the components that
// render them (CatalogBrowserLight, BuyerTopNav) so this module stays
// tokens + shared base rules only.
export const FNBL_CSS = `
.fnbl{--page:#FFFFFF;--ink:#241A4D;--ink-2:#5F5885;--ink-3:#8B85AB;--wash:#F1EDFE;--wash-2:#E7E1FC;--line:#DED7FB;--line-2:#CFC5F7;--indigo:#6D5AE0;--fuchsia:#B22BC9;--grad:linear-gradient(105deg,#6D5AE0 0%,#B22BC9 100%);--ok-fg:#0B7A57;--ok-bg:#E4F6EF;--ok-line:#B6E4D3;--part-fg:#8A5B04;--part-bg:#FDF3E0;--part-line:#F0DCB2;--req-fg:#A62742;--req-bg:#FDEBEF;--req-line:#F5C9D3;background:var(--page);color:var(--ink);font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh;padding-bottom:120px;}
.fnbl *{box-sizing:border-box;}
.fnbl .icn{stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
.fnbl .gtext{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;}
.fnbl[data-theme="dark"]{--page:#0a0a0f;--ink:#C7CBF7;--ink-2:#7c80b4;--ink-3:rgba(199,203,247,.55);--wash:#1A1838;--wash-2:rgba(199,203,247,.10);--line:rgba(199,203,247,.12);--line-2:rgba(199,203,247,.22);--indigo:#818CF8;--fuchsia:#D946EF;--grad:linear-gradient(105deg,#818CF8 0%,#D946EF 100%);--ok-fg:#34D399;--ok-bg:rgba(52,211,153,.11);--ok-line:rgba(52,211,153,.3);--part-fg:#F4C77B;--part-bg:rgba(245,158,11,.11);--part-line:rgba(245,158,11,.3);--req-fg:#F9A8C0;--req-bg:rgba(244,63,94,.1);--req-line:rgba(244,63,94,.3);}
`
