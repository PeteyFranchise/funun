// ─── SELP_CSS — the standalone, always-dark Selects player theme (31-13) ───
// The player is neither inside `.fncon` (Team Console) nor the logged-in
// buyer portal's `.fnbl` shell — a share-link recipient may not be logged
// in at all — so it gets its own minimal theme, built from the SAME raw hex
// values `.fnbl[data-theme="dark"]` already declares (components/buyer/
// fnbl-theme.ts) plus the layout/interaction system of the locked build
// reference `.planning/design/phase-31-shareable-music-player.html`, which
// this file is lifted from almost verbatim — every top-level selector is
// scoped under `.selp` (this player's root wrapper class) so nothing here
// leaks onto/collides with any other route (mirrors ADMIN_CONSOLE_CSS /
// FNBL_CSS's own `<style>{...}</style>`-in-a-scoped-wrapper convention).
//
// `.look-1`/`.look-2` (the "Glow Up View" toggle) are modifier classes
// applied directly on the SAME `.selp` root element by SelectsPlayer.tsx —
// never on `document.body` (unlike the static mockup, which had the whole
// page to itself) — so this theme is safe to mount alongside any other
// page shell.
export const SELP_CSS = `
.selp{
  --ground:#08070d; --panel:#0E0D1E; --panel2:#151330; --panel3:#1c1940;
  --ink:#ffffff; --lav:#C7CBF7; --lavdim:#8b8fbf; --lavdim2:#6a6d99;
  --border:rgba(199,203,247,.12); --border2:rgba(199,203,247,.22);
  --indigo:#818CF8; --fuchsia:#D946EF; --grad:linear-gradient(105deg,#818CF8 0%,#D946EF 100%);
  --green:#34D399; --green-bg:rgba(52,211,153,.14);
  --rose:#F9A8C0; --rose-bg:rgba(244,63,94,.14);
  --amber:#F4C77B; --r:14px; --r2:20px;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,sans-serif;
  margin:0;color:var(--ink);font-family:var(--sans);min-height:100vh;-webkit-font-smoothing:antialiased;
  padding-bottom:104px;background:var(--ground);position:relative;overflow-x:hidden;
}
.selp *{box-sizing:border-box;}
.selp #ambient{position:fixed;inset:0;z-index:-1;opacity:.9;transition:background .6s;filter:blur(80px) saturate(1.25);-webkit-mask-image:linear-gradient(to bottom,#000 0%,#000 26%,transparent 74%);mask-image:linear-gradient(to bottom,#000 0%,#000 26%,transparent 74%);
  background:radial-gradient(60% 55% at 30% 20%,#7c3aed,transparent 60%),radial-gradient(55% 55% at 80% 15%,#D946EF,transparent 60%),#08070d;}
.selp .icn{stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
.selp.look-2 #ambient{display:none;}
.selp.look-1 #ambient{filter:blur(94px) saturate(1.35);-webkit-mask-image:none;mask-image:none;opacity:.62;}
.selp.look-1 .appbar{-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);}
.selp.look-1 .mini{-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);background:rgba(28,25,64,.72);}
.selp button{font-family:inherit;cursor:pointer;color:inherit;background:none;border:0;}

.selp .appbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:14px 24px;
  background:linear-gradient(180deg,rgba(8,7,13,.88),rgba(8,7,13,.12));}
.selp .rnd{width:38px;height:38px;border-radius:50%;background:rgba(10,9,16,.5);border:1px solid rgba(255,255,255,.14);
  display:flex;align-items:center;justify-content:center;color:#fff;flex:none;}
.selp .rnd:hover{background:rgba(30,27,60,.7);}
.selp .rnd svg{width:18px;height:18px;}
.selp .brandmini{display:flex;align-items:center;gap:8px;font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.7);}
.selp .brandmini .phon{text-transform:none;letter-spacing:normal;font-size:11px;font-weight:400;color:var(--lavdim2);margin-left:-3px;}
.selp .brandmini .mk{width:20px;height:20px;border-radius:6px;background:var(--grad);}
.selp .spacer{flex:1;}
.selp .acct{border-style:dashed;border-color:var(--border2);color:var(--lav);}
.selp .acct .guestic{width:18px;height:18px;} .selp .acct .proav{display:none;}
.selp .acct.pro{background:var(--grad);border:1px solid transparent;}
.selp .acct.pro .guestic{display:none;}
.selp .acct.pro .proav{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:11px;font-weight:800;color:#12102b;}
.selp .cartbtn{position:relative;}
.selp .cartbtn .badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:999px;background:var(--grad);
  color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;
  opacity:0;transform:scale(.6);transition:.18s;box-shadow:0 4px 12px -2px rgba(217,70,239,.7);}
.selp .cartbtn.has .badge{opacity:1;transform:scale(1);}

.selp .col{max-width:1280px;margin:0 auto;padding:0 24px;}

.selp .hero{padding-top:8px;max-width:600px;margin:0 auto;}
.selp .glowbar{display:flex;justify-content:center;padding:12px 0 2px;}
.selp .glowbtn{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:999px;border:1px solid var(--border2);background:rgba(255,255,255,.04);color:var(--lav);font-size:13px;font-weight:600;transition:transform .13s ease,background .15s ease,color .15s ease,box-shadow .3s ease;}
.selp .glowbtn:hover{background:var(--panel2);color:#fff;}
.selp .glowbtn:active{transform:scale(.95);}
.selp .glowbtn svg{width:16px;height:16px;}
.selp .glowbtn.on{background:var(--grad);border-color:transparent;color:#fff;box-shadow:0 12px 32px -12px rgba(217,70,239,.65);}
.selp .cover{width:min(300px,64vw);aspect-ratio:1/1;border-radius:var(--r2);margin:6px auto 0;position:relative;overflow:hidden;
  border:1px solid var(--border);box-shadow:0 30px 80px -28px rgba(0,0,0,.85);transition:background .5s,box-shadow .55s ease;background-size:cover;background-position:center;}
.selp .cover::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.16), inset 0 0 0 1px rgba(255,255,255,.05);}
.selp .cover .previewpill{position:absolute;top:12px;right:12px;display:inline-flex;align-items:center;gap:6px;padding:5px 10px;
  border-radius:999px;background:rgba(10,9,16,.6);backdrop-filter:blur(8px);border:1px solid rgba(199,203,247,.28);
  font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#fff;}
.selp .cover .previewpill .d{width:6px;height:6px;border-radius:50%;background:var(--amber);}
.selp .herotext{text-align:center;margin-top:20px;}
.selp .chip-funun{display:inline-flex;align-items:center;gap:7px;padding:6px 13px;border-radius:999px;background:rgba(10,9,16,.5);
  border:1px solid rgba(199,203,247,.22);font-size:12.5px;font-weight:700;letter-spacing:.04em;color:#fff;}
.selp .chip-funun .logo{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900;letter-spacing:.06em;}
.selp .chip-funun .sep{opacity:.4;} .selp .chip-funun .sub{font-weight:600;color:var(--lav);}
.selp .title{font-size:34px;font-weight:900;letter-spacing:-.035em;line-height:1.05;margin:14px 0 0;}
.selp .byline{margin-top:8px;font-size:15px;color:var(--lav);display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:center;}
.selp .byline .vf{width:16px;height:16px;color:var(--indigo);}
.selp .byline .ml{color:var(--lavdim);}
.selp .updated{margin-top:5px;font-size:12.5px;color:var(--lavdim2);}
.selp .note{margin:14px auto 0;max-width:520px;font-size:14px;line-height:1.55;color:var(--lav);}

.selp .herorow{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:20px;}
.selp .hc{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid var(--border2);
  display:flex;align-items:center;justify-content:center;color:#fff;flex:none;}
.selp .hc:hover{background:rgba(255,255,255,.12);}
.selp .hc svg{width:19px;height:19px;}
.selp .hc.locked{color:var(--lavdim);}
.selp .playpill{display:inline-flex;align-items:center;justify-content:center;gap:9px;background:#fff;color:#0a0812;border:0;
  border-radius:999px;padding:13px 34px;font-weight:700;font-size:15.5px;min-width:150px;box-shadow:0 14px 34px -16px rgba(255,255,255,.5);}
.selp .playpill:hover{transform:translateY(-1px);} .selp .playpill svg{width:17px;height:17px;fill:#0a0812;}

.selp .bizrow{display:flex;gap:10px;margin-top:16px;}
.selp .gbtn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;border-radius:12px;
  font-size:14px;font-weight:600;border:1px solid var(--border2);background:rgba(255,255,255,.03);color:#fff;}
.selp .gbtn:hover{background:var(--panel2);} .selp .gbtn svg{width:16px;height:16px;}
.selp .gbtn.primary{background:var(--grad);border:0;box-shadow:0 14px 34px -16px rgba(217,70,239,.6);}

.selp .listhead{display:flex;align-items:center;gap:10px;padding:24px 4px 6px;}
.selp .listhead .l{font-size:12px;letter-spacing:.15em;text-transform:uppercase;font-weight:700;color:var(--lavdim);}
.selp .listhead .cnt{font-size:12px;color:var(--lavdim2);}
.selp .listhead .wm{margin-left:auto;font-size:11.5px;color:var(--lavdim);display:inline-flex;align-items:center;gap:6px;}
.selp .listhead .wm .d{width:6px;height:6px;border-radius:50%;background:var(--amber);}

.selp .trk{display:grid;grid-template-columns:46px 1fr auto;gap:12px;align-items:center;padding:7px 6px;border-radius:11px;
  transition:background .12s;cursor:pointer;}
.selp .trk:hover{background:rgba(255,255,255,.05);}
.selp .trk.on{background:rgba(129,140,248,.1);}
.selp .art{width:46px;height:46px;border-radius:9px;border:0;padding:0;position:relative;overflow:hidden;flex:none;background-size:cover;background-position:center;}
.selp .art .eq{position:absolute;inset:0;display:none;align-items:flex-end;justify-content:center;gap:2px;background:rgba(8,7,13,.42);}
.selp .trk.on .art .eq{display:flex;} .selp .art .eq i{width:3px;background:#fff;border-radius:2px;animation:selp-eq .9s ease-in-out infinite;font-style:normal;}
.selp .art .eq i:nth-child(1){height:7px;animation-delay:-.2s} .selp .art .eq i:nth-child(2){height:14px;animation-delay:-.5s} .selp .art .eq i:nth-child(3){height:9px;}
@keyframes selp-eq{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
.selp .info{min-width:0;} .selp .info .t{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.selp .trk.on .info .t{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;}
.selp .info .sub{display:flex;align-items:center;gap:7px;margin-top:1px;min-width:0;}
.selp .info .artist{font-size:12.5px;color:var(--lavdim);white-space:nowrap;flex:none;}
.selp .info .dot{color:var(--lavdim2);font-size:12px;flex:none;}
.selp .desc{font-size:12.5px;color:var(--lavdim2);overflow:hidden;white-space:nowrap;-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent);}
.selp .desc span{display:inline-block;padding-right:40px;}
.selp .trk.on .desc span,.selp .trk:hover .desc span{animation:selp-marq 11s linear infinite;}
@keyframes selp-marq{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.selp .ctrls{display:flex;align-items:center;gap:2px;flex:none;}
.selp .cbtn{width:34px;height:34px;border-radius:50%;background:none;border:0;color:var(--lavdim);display:flex;align-items:center;justify-content:center;}
.selp .cbtn:hover{color:#fff;background:rgba(255,255,255,.07);} .selp .cbtn svg{width:17px;height:17px;}
.selp .cbtn.love.on{color:var(--rose);} .selp .cbtn.love.on svg{fill:var(--rose);}
.selp .cbtn.pass.on{color:var(--lav);} .selp .cbtn.pass.on svg{fill:currentColor;}
.selp .cbtn.dl svg{width:19px;height:19px;} .selp .cbtn.dl.locked{color:var(--lavdim2);}
.selp .cbtn.mm{color:var(--lavdim);}

.selp .art .who{position:absolute;right:2px;bottom:2px;width:17px;height:17px;border-radius:50%;z-index:3;
  display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;letter-spacing:.02em;color:#fff;
  border:1.5px solid rgba(8,7,13,.72);box-shadow:0 1px 4px rgba(0,0,0,.55);}
.selp .art .who.client{background:linear-gradient(150deg,#34D399,#0e7490);}
.selp .art .who.ae{background:var(--grad);}
.selp .sheet .sh .shby{font-size:11.5px;color:var(--lavdim);margin-top:4px;}
.selp .sheet .sh .shby b{color:var(--lav);font-weight:600;}

.selp .footer{max-width:720px;margin:22px auto 0;padding:0 20px;text-align:center;color:var(--lavdim2);font-size:12px;line-height:1.7;}
.selp .footer .d{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--amber);vertical-align:middle;margin:0 8px;}

.selp .miniwrap{position:fixed;left:0;right:0;bottom:0;z-index:30;padding:12px 16px;
  background:linear-gradient(180deg,transparent,var(--ground) 40%);}
.selp .mini{max-width:700px;margin:0 auto;display:flex;align-items:center;gap:12px;background:rgba(24,21,52,.95);
  border:1px solid var(--border2);border-radius:16px;padding:9px 12px;box-shadow:0 18px 44px -18px rgba(0,0,0,.7);position:relative;}
.selp .mini .mth{width:44px;height:44px;border-radius:10px;overflow:hidden;position:relative;flex:none;background-size:cover;background-position:center;}
.selp .mini .mtx{min-width:0;flex:1;} .selp .mini .mtt{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.selp .mini .mta{font-size:12px;color:var(--lav);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;display:flex;align-items:center;gap:7px;}
.selp .mini .mprev{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;border:1px solid var(--border2);
  font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--amber);}
.selp .mini .mplay{width:44px;height:44px;border-radius:50%;background:var(--grad);border:0;display:flex;align-items:center;justify-content:center;flex:none;
  box-shadow:0 10px 26px -10px rgba(217,70,239,.7);} .selp .mini .mplay svg{width:19px;height:19px;fill:#fff;}
.selp .mnext{width:40px;height:40px;border-radius:50%;background:none;border:0;color:var(--lav);display:flex;align-items:center;justify-content:center;flex:none;}
.selp .mnext:hover{color:#fff;} .selp .mnext svg{width:20px;height:20px;fill:currentColor;}
.selp .mini .mscrub{position:absolute;left:12px;right:12px;bottom:3px;height:2px;border-radius:2px;background:rgba(199,203,247,.14);}
.selp .mini .mfill{position:absolute;left:0;top:0;bottom:0;width:34%;border-radius:2px;background:var(--grad);}

.selp .sheetbg{position:fixed;inset:0;background:rgba(4,3,10,.6);backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:.2s;z-index:45;}
.selp .sheetbg.on{opacity:1;pointer-events:auto;}
.selp .sheet{position:fixed;left:50%;bottom:0;transform:translate(-50%,102%);width:min(460px,100%);z-index:55;
  background:var(--panel);border:1px solid var(--border2);border-bottom:0;border-radius:22px 22px 0 0;padding:10px 16px 22px;
  transition:transform .26s cubic-bezier(.4,0,.2,1);}
.selp .sheet.on{transform:translate(-50%,0);}
.selp .sheet .grip{width:38px;height:4px;border-radius:2px;background:var(--border2);margin:2px auto 14px;}
.selp .sheet .sh{display:flex;align-items:center;gap:12px;padding:0 4px 14px;border-bottom:1px solid var(--border);}
.selp .sheet .sh .th{width:46px;height:46px;border-radius:10px;overflow:hidden;position:relative;flex:none;background-size:cover;background-position:center;}
.selp .sheet .sh .nm{font-size:15px;font-weight:700;} .selp .sheet .sh .ar{font-size:12.5px;color:var(--lavdim);margin-top:2px;}
.selp .sheet .trio{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px 0;border-bottom:1px solid var(--border);}
.selp .sheet .trio button{display:flex;flex-direction:column;align-items:center;gap:7px;padding:12px 6px;border-radius:12px;background:var(--panel2);border:1px solid var(--border);font-size:12px;color:#fff;}
.selp .sheet .trio button:hover{background:var(--panel3);} .selp .sheet .trio button.on{color:var(--rose);border-color:rgba(249,168,192,.4);}
.selp .sheet .trio svg{width:20px;height:20px;}
.selp .sheet .note{margin:14px 4px 4px;font-size:12.5px;line-height:1.5;color:var(--lav);border-left:2px solid var(--border2);padding-left:11px;text-align:left;max-width:none;}
.selp .sheet .rows{padding:8px 0 0;}
.selp .sheet .srow{display:flex;align-items:center;gap:13px;width:100%;padding:13px 6px;border:0;background:none;font-size:14.5px;color:#fff;text-align:left;border-radius:10px;}
.selp .sheet .srow:hover{background:var(--panel2);} .selp .sheet .srow svg{width:20px;height:20px;color:var(--lav);flex:none;}
.selp .sheet .srow.primary svg{color:var(--indigo);} .selp .sheet .srow .sub{font-size:11.5px;color:var(--lavdim);margin-top:1px;}
.selp .sheet .srow .rt{margin-left:auto;font-size:12px;color:var(--lavdim);}

.selp .modal{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(4,3,10,.68);backdrop-filter:blur(4px);}
.selp .modal.on{display:flex;}
.selp .mcard{width:min(420px,100%);background:#0a0912;border:1px solid var(--border2);border-radius:var(--r2);padding:26px;text-align:center;box-shadow:0 40px 90px -30px rgba(0,0,0,.85);}
.selp .mcard .ic{width:54px;height:54px;border-radius:16px;background:var(--panel2);display:flex;align-items:center;justify-content:center;color:var(--amber);margin:0 auto 16px;}
.selp .mcard .ic svg{width:25px;height:25px;} .selp .mcard h3{margin:0 0 8px;font-size:19px;font-weight:700;} .selp .mcard p{margin:0 0 20px;font-size:14px;line-height:1.55;color:var(--lav);}
.selp .mcard .make{width:100%;padding:14px;border-radius:13px;border:0;background:var(--grad);color:#fff;font-size:14.5px;font-weight:600;margin-bottom:10px;}
.selp .mcard .login{width:100%;padding:13px;border-radius:13px;border:1px solid var(--border2);background:transparent;color:#fff;font-size:14px;font-weight:600;margin-bottom:12px;}
.selp .mcard .login:hover{background:var(--panel2);}
.selp .mcard .later{background:none;border:0;color:var(--lavdim);font-size:13px;}
.selp .mcard .fine{margin-top:14px;font-size:11.5px;color:var(--lavdim);line-height:1.5;}

.selp .toast{position:fixed;left:50%;bottom:92px;transform:translate(-50%,16px);z-index:70;background:var(--panel3);border:1px solid var(--border2);
  border-radius:999px;padding:11px 20px;font-size:13.5px;display:flex;align-items:center;gap:9px;opacity:0;pointer-events:none;transition:.22s;box-shadow:0 20px 50px -20px rgba(0,0,0,.7);}
.selp .toast.on{opacity:1;transform:translate(-50%,0);} .selp .toast .d{width:7px;height:7px;border-radius:50%;background:var(--green);} .selp .toast b{font-weight:600;}

.selp .suggest{background:var(--panel);border:1px solid var(--border);border-radius:var(--r2);margin-top:20px;padding:4px 6px 8px;}
.selp .sgh{display:flex;align-items:flex-start;gap:12px;padding:16px 14px 12px;}
.selp .sgt{font-size:17px;font-weight:700;letter-spacing:-.01em;}
.selp .sgs{font-size:12.5px;color:var(--lavdim);margin-top:2px;}
.selp .sgref{margin-left:auto;width:34px;height:34px;border-radius:50%;background:none;border:0;color:var(--lav);display:flex;align-items:center;justify-content:center;flex:none;}
.selp .sgref:hover{color:#fff;background:var(--panel2);} .selp .sgref svg{width:17px;height:17px;}
.selp .srow2{display:grid;grid-template-columns:46px 1fr auto;gap:12px;align-items:center;padding:9px 14px;cursor:pointer;transition:background .12s ease;}
.selp .srow2:hover{background:rgba(255,255,255,.05);}
.selp .srow2+.srow2{border-top:1px solid var(--border);}
.selp .srow2 .sth{width:46px;height:46px;border-radius:9px;overflow:hidden;position:relative;border:1px solid var(--border);flex:none;background-size:cover;background-position:center;}
.selp .srow2 .sinfo{min-width:0;}
.selp .srow2 .stt{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.selp .srow2 .sta{font-size:12.5px;color:var(--lavdim);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.selp .sgadd{width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border2);background:none;color:var(--lav);display:flex;align-items:center;justify-content:center;flex:none;}
.selp .sgadd:hover{border-color:var(--indigo);color:var(--indigo);background:rgba(129,140,248,.12);}
.selp .sgadd svg{width:16px;height:16px;}
.selp .sgadd.added{background:var(--green-bg);border-color:transparent;color:var(--green);}

.selp .vibe{display:flex;align-items:center;gap:14px;width:100%;margin-top:14px;padding:15px 16px;border-radius:var(--r2);text-align:left;
  border:1.5px dashed var(--border2);background:rgba(129,140,248,.05);color:#fff;transition:background .16s ease,border-color .16s ease;}
.selp .vibe:hover{background:rgba(129,140,248,.1);border-color:var(--indigo);}
.selp .vibe .vic{width:42px;height:42px;border-radius:12px;background:rgba(129,140,248,.16);color:var(--indigo);display:flex;align-items:center;justify-content:center;flex:none;}
.selp .vibe .vic svg{width:21px;height:21px;}
.selp .vibe .vtx{min-width:0;flex:1;}
.selp .vibe .vt{display:block;font-size:15.5px;font-weight:700;line-height:1.3;}
.selp .vibe .vs{display:block;font-size:12.5px;color:var(--lavdim);margin-top:4px;line-height:1.5;}
.selp .vibe .varr{width:20px;height:20px;color:var(--lavdim);flex:none;}
.selp .vibe:hover .varr{color:var(--indigo);}

.selp .playpill,.selp .hc,.selp .rnd,.selp .mplay,.selp .mnext,.selp .cbtn,.selp .gbtn,.selp .trk{transition:transform .14s cubic-bezier(.2,.8,.2,1), background .16s ease, color .16s ease, border-color .16s ease, box-shadow .3s ease;}
.selp .playpill:active,.selp .gbtn:active,.selp .trk:active{transform:scale(.965);}
.selp .cbtn:active,.selp .rnd:active,.selp .hc:active,.selp .mplay:active,.selp .mnext:active{transform:scale(.88);}
.selp::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:-1;background:radial-gradient(135% 95% at 50% -12%, transparent 52%, rgba(0,0,0,.42));}

.selp .abtitle{position:absolute;left:64px;right:152px;top:50%;transform:translateY(-50%) translateY(4px);white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;text-align:center;font-size:15px;font-weight:700;opacity:0;pointer-events:none;transition:opacity .25s ease, transform .25s ease;}
.selp .appbar{transition:background .25s ease, border-color .25s ease;border-bottom:1px solid transparent;}
.selp .appbar.solid{background:rgba(8,7,13,.9);border-bottom-color:var(--border);}
.selp .appbar.solid .abtitle{opacity:1;transform:translateY(-50%);}
.selp .brandmini{transition:opacity .22s ease;} .selp .appbar.solid .brandmini{opacity:0;pointer-events:none;}

/* removed tray */
.selp .removed{margin-top:12px;}
.selp .rmvhead{display:flex;align-items:center;gap:9px;width:100%;padding:11px 12px;border-radius:12px;border:1px solid var(--border);
  background:rgba(255,255,255,.02);color:var(--lavdim);font-size:13px;}
.selp .rmvhead:hover{background:rgba(255,255,255,.045);color:var(--lav);}
.selp .rmvhead .chev{width:16px;height:16px;transition:transform .2s ease;flex:none;}
.selp .rmvhead[aria-expanded="true"] .chev{transform:rotate(90deg);}
.selp .rmvhead .rl{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;}
.selp .rmvhead .rc{min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:var(--panel3);color:var(--lav);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;}
.selp .rmvhead .rhint{margin-left:auto;font-size:11px;color:var(--lavdim2);}
.selp .rmvbody{display:none;padding:5px 2px 2px;}
.selp .rmvbody.open{display:block;}
.selp .rmvrow{display:grid;grid-template-columns:38px 1fr auto;gap:11px;align-items:center;padding:9px 8px;border-radius:10px;}
.selp .rmvrow:hover{background:rgba(255,255,255,.03);}
.selp .rmvrow .rth{width:38px;height:38px;border-radius:8px;position:relative;overflow:hidden;flex:none;filter:grayscale(.5) opacity(.78);background-size:cover;background-position:center;}
.selp .rmvrow .rinfo{min-width:0;}
.selp .rmvrow .rt2{font-size:14px;font-weight:600;color:var(--lav);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.selp .rmvrow .rsub{font-size:11.5px;color:var(--lavdim2);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.selp .restore{padding:7px 14px;border-radius:999px;border:1px solid var(--border2);background:none;color:var(--lav);font-size:12.5px;font-weight:600;flex:none;}
.selp .restore:hover{border-color:var(--indigo);color:#fff;background:rgba(129,140,248,.12);}

@media (prefers-reduced-motion:reduce){.selp *{transition:none !important;} .selp .art .eq i{animation:none;} .selp .desc span{animation:none !important;}}

@media (max-width:600px){
  .selp .title{font-size:30px;} .selp .cover{width:72vw;}
  .selp .col{padding:0 24px;} .selp .appbar{padding:14px 24px;} .selp .miniwrap{padding:12px 24px;} .selp .footer{padding:0 24px;}
  .selp .mini{border-radius:16px;}
  .selp .listhead .wm{display:none;}
}

@media (min-width:900px){
  .selp{overflow:hidden;padding-bottom:0;}
  .selp .appbar{position:fixed;left:0;right:0;top:0;}
  .selp .col{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:0;align-items:stretch;height:100vh;max-width:1500px;padding:64px 0 0;box-sizing:border-box;}
  .selp .leftcol{position:relative;min-height:0;padding-bottom:92px;overflow:hidden;}
  .selp .glowbar{position:fixed;top:11px;left:50%;transform:translateX(-50%);right:auto;z-index:25;pointer-events:none;padding:0;width:auto;}
  .selp .glowbar .glowbtn{pointer-events:auto;background:rgba(10,9,16,.5);backdrop-filter:blur(8px);}
  .selp .hero{max-width:none;margin:0;}
  .selp .cover{width:calc(100% - 76px);max-width:440px;margin:16px auto 0;}
  .selp .herotext{text-align:center;padding:0 32px;margin-top:22px;}
  .selp .title{font-size:31px;}
  .selp .note{max-width:520px;margin:12px auto 0;}
  .selp .herorow{justify-content:center;padding:0 34px;margin-top:20px;gap:26px;}
  .selp .bizrow{padding:0 34px;margin-top:16px;}
  .selp .listcol{min-width:0;min-height:0;overflow-y:auto;padding:8px 30px 104px 26px;}
  .selp .listcol::-webkit-scrollbar{width:9px;}
  .selp .listcol::-webkit-scrollbar-thumb{background:var(--border2);border-radius:8px;border:2px solid transparent;background-clip:padding-box;}
  .selp .listhead{padding-top:0;}
}
`
