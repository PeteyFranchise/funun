'use client'

// ─── CatalogBrowserLight ──────────────────────────────────────────────────
// Slice 1 of the buyer-catalogue redesign: a faithful recreation of Claude
// Design's LIGHT buyer catalogue (mockups/buyer-catalogue.html) as the real
// buyer browse surface. White page, deep indigo-violet ink, lavender washes,
// indigo→fuchsia gradient, and the tri-state rights badge (ready / partial /
// contact-required). The buyer side is LIGHT to distinguish it from the dark
// artist side (owner decision, 2026-08-03).
//
// Scope of slice 1: the faithful browse layout (top nav · tab bar · search +
// scope · filter pills · results table). Interactive behaviours — filter
// dropdowns, the sticky audio player, the License request modal, versions
// expand, and the dark-theme toggle — are slice 2. The design's exact CSS is
// ported here scoped under `.fnbl` so it never leaks into the dark app shell.

export type CatalogRights = 'ok' | 'part' | 'req'
export type Dynamics = 'twin' | 'steady' | 'build' | 'fade' | 'peak'

export type CatalogRow = {
  id: string
  title: string
  artist: string
  coverUrl: string | null
  gradient: string // fallback cover when coverUrl is null
  genres: string
  energy: string
  length: string
  versions: number
  rights: CatalogRights
  dynamics: Dynamics
}

const FILTERS = ['Vocals', 'Mood', 'Dynamics', 'Energy', 'Length', 'Instruments', 'Genres', 'Rights'] as const

const RIGHTS_LABEL: Record<CatalogRights, string> = {
  ok: 'Rights ready',
  part: 'Partial rights',
  req: 'Contact required',
}

// Dynamic-shape glyphs (the "energy arc" over the track) — matches the design's
// per-track SVG silhouettes.
function DynGlyph({ shape }: { shape: Dynamics }) {
  const fill = '#DED7FB'
  const paths: Record<Dynamics, JSX.Element> = {
    twin: (
      <>
        <path d="M0 26 22 7l22 19z" fill={fill} />
        <path d="M56 26 78 4l22 22z" fill={fill} />
      </>
    ),
    steady: <rect x="0" y="18" width="100" height="8" rx="3" fill={fill} />,
    build: <path d="M0 26 34 22 68 10 100 0v26z" fill={fill} />,
    fade: (
      <>
        <path d="M0 4 30 6l34 12 36 8v-4L64 14 30 2 0 0z" fill={fill} />
        <rect x="0" y="20" width="100" height="6" rx="3" fill={fill} />
      </>
    ),
    peak: (
      <>
        <path d="M0 26 20 16l18 10z" fill={fill} />
        <path d="M44 26 72 2l28 24z" fill={fill} />
      </>
    ),
  }
  return (
    <svg className="dyn" width="104" height="26" viewBox="0 0 104 26" aria-hidden>
      {paths[shape]}
    </svg>
  )
}

function RightsBadge({ rights }: { rights: CatalogRights }) {
  const icon =
    rights === 'ok' ? (
      <>
        <path d="M12 3 4 7v6c0 5 3.4 7.4 8 8 4.6-.6 8-3 8-8V7z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ) : rights === 'part' ? (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18a9 9 0 0 0 0-18" />
      </>
    ) : (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 8 9 5 9-5" />
      </>
    )
  return (
    <span className={`rights ${rights}`}>
      <svg className="icn" viewBox="0 0 24 24">
        {icon}
      </svg>
      {RIGHTS_LABEL[rights]}
    </span>
  )
}

export function CatalogBrowserLight({
  rows,
  total,
  isPublic = false,
}: {
  rows: CatalogRow[]
  total: number
  isPublic?: boolean
}) {
  return (
    <div className="fnbl">
      <style>{CSS}</style>

      {/* top nav */}
      <header className="top">
        <div className="l">
          <button className="navlink" type="button">
            <svg className="icn" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            Browse
          </button>
          {isPublic && (
            <button className="navlink" type="button">
              <svg className="icn" viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
              </svg>
              Login
            </button>
          )}
        </div>
        <div>
          <div className="brandmark gtext">FUNŪN</div>
          <span className="brandsub">THE ARTS</span>
        </div>
        <div className="r">
          <button className="cart" type="button" aria-label="License queue">
            <svg className="icn" viewBox="0 0 24 24">
              <path d="M6 6h15l-1.6 9H7.4z" />
              <circle cx="9" cy="20" r="1.6" />
              <circle cx="18" cy="20" r="1.6" />
              <path d="M6 6 5 2H2" />
            </svg>
            <span className="b">0</span>
          </button>
          <button className="burger" type="button" aria-label="Menu">
            <i />
            <i />
            <i />
          </button>
        </div>
      </header>

      <div className="wrap">
        {/* tabs */}
        <div className="tabs" role="tablist">
          <button className="tab on" role="tab" type="button">
            Browse &amp;<br />
            Search
          </button>
          <button className="tab" role="tab" type="button">
            Similarity<br />
            Search
          </button>
          <button className="tab" role="tab" type="button">
            Funūn<br />
            Playlists
          </button>
          <button className="tab dim" role="tab" type="button">
            My<br />
            Playlists
          </button>
          <button className="tab dim" role="tab" type="button">
            My<br />
            Favorites
          </button>
        </div>

        {/* search */}
        <div className="searchrow">
          <div className="searchbox">
            <svg className="icn" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input type="text" placeholder="Search by song, artist or lyrics" aria-label="Search the catalogue" />
          </div>
          <div className="alldd">
            <button className="allbtn" type="button">
              <span>All</span>
              <svg className="icn" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>

        {/* filter pills */}
        <div className="filters">
          {FILTERS.map(f => (
            <div className="fdd" key={f}>
              <button className="fbtn" type="button">
                {f}
                <svg className="icn" viewBox="0 0 24 24">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
          ))}
          <div className="fdd">
            <button className="fbtn" type="button">
              Sort by
              <svg className="icn" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>

        {/* results meta */}
        <div className="rmeta">
          <span className="n">{total.toLocaleString()} tracks</span>
          <span className="s">Sorted by Best match</span>
        </div>

        {/* table */}
        {rows.length === 0 ? (
          <div className="empty show">
            <div className="ei">
              <svg className="icn" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3M8 11h6" />
              </svg>
            </div>
            <h3>No tracks match those filters</h3>
            <p>
              Nothing in the catalogue fits every filter you have applied. Try removing one, or widen the mood and
              energy range.
            </p>
          </div>
        ) : (
          <div className="cols" style={{ marginTop: 22 }}>
            <div className="thead">
              <div>Song / Artist</div>
              <div>Versions</div>
              <div>Genres</div>
              <div>Dynamics</div>
              <div>Energy</div>
              <div>Length</div>
              <div />
              <div />
            </div>

            {rows.map(row => (
              <div className="trow" key={row.id}>
                <div className="song">
                  <div
                    className="art"
                    style={
                      row.coverUrl
                        ? { backgroundImage: `url('${row.coverUrl}')` }
                        : { background: row.gradient }
                    }
                  >
                    <button className="pb" type="button" aria-label={`Play ${row.title}`}>
                      <svg viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <div>
                    <div className="sname">{row.title}</div>
                    <div className="sby">
                      by <b>{row.artist}</b>
                    </div>
                    <RightsBadge rights={row.rights} />
                  </div>
                </div>
                <div>
                  <button className="vers" type="button">
                    + {row.versions}
                  </button>
                </div>
                <div className="gen">{row.genres}</div>
                <div>
                  <DynGlyph shape={row.dynamics} />
                </div>
                <div className="energy">{row.energy}</div>
                <div className="len">{row.length}</div>
                <div>
                  <button className="kebab" type="button" aria-label={`More options for ${row.title}`}>
                    <svg className="icn" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="1.4" />
                      <circle cx="12" cy="12" r="1.4" />
                      <circle cx="12" cy="19" r="1.4" />
                    </svg>
                  </button>
                </div>
                <div>
                  <button className="lic" type="button">
                    License
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {rows.length > 0 && rows.length < total && (
          <button className="loadmore" type="button">
            Load more tracks
          </button>
        )}
      </div>
    </div>
  )
}

// Claude Design's light catalogue CSS, scoped under `.fnbl` so it never touches
// the dark app shell. Ported verbatim from mockups/buyer-catalogue.html.
const CSS = `
.fnbl{--page:#FFFFFF;--ink:#241A4D;--ink-2:#5F5885;--ink-3:#8B85AB;--wash:#F1EDFE;--wash-2:#E7E1FC;--line:#DED7FB;--line-2:#CFC5F7;--indigo:#6D5AE0;--fuchsia:#B22BC9;--grad:linear-gradient(105deg,#6D5AE0 0%,#B22BC9 100%);--ok-fg:#0B7A57;--ok-bg:#E4F6EF;--ok-line:#B6E4D3;--part-fg:#8A5B04;--part-bg:#FDF3E0;--part-line:#F0DCB2;--req-fg:#A62742;--req-bg:#FDEBEF;--req-line:#F5C9D3;background:var(--page);color:var(--ink);font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh;padding-bottom:60px;}
.fnbl *{box-sizing:border-box;}
.fnbl .icn{stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
.fnbl .wrap{max-width:1380px;margin:0 auto;padding:0 32px;}
.fnbl .gtext{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;}
.fnbl button{font-family:inherit;cursor:pointer;}
.fnbl .top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:26px 40px;}
.fnbl .top .l{display:flex;align-items:center;gap:34px;}
.fnbl .top .r{display:flex;align-items:center;gap:26px;justify-content:flex-end;}
.fnbl .navlink{display:inline-flex;align-items:center;gap:11px;background:none;border:none;padding:0;color:var(--indigo);font-size:15.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;}
.fnbl .navlink svg{width:25px;height:25px;stroke-width:1.9;}
.fnbl .navlink:hover{color:var(--fuchsia);}
.fnbl .brandmark{font-size:34px;font-weight:900;letter-spacing:.01em;line-height:1;}
.fnbl .brandsub{display:block;text-align:center;font-size:9.5px;letter-spacing:.4em;font-weight:700;color:var(--ink-3);margin-top:5px;}
.fnbl .cart{position:relative;background:none;border:none;padding:0;color:var(--indigo);}
.fnbl .cart svg{width:28px;height:28px;stroke-width:1.9;}
.fnbl .cart .b{position:absolute;top:-5px;right:-8px;min-width:19px;height:19px;border-radius:999px;background:var(--grad);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 5px;}
.fnbl .burger{display:flex;gap:4px;background:none;border:none;padding:2px 0;align-items:center;}
.fnbl .burger i{width:3px;height:26px;border-radius:2px;background:var(--indigo);display:block;}
.fnbl .burger:hover i{background:var(--fuchsia);}
.fnbl .tabs{display:flex;align-items:stretch;background:var(--wash);border-radius:999px;padding:5px;margin:34px auto 0;max-width:1320px;}
.fnbl .tab{flex:1;border:none;background:none;border-radius:999px;padding:17px 14px;font-size:14.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--indigo);line-height:1.25;text-align:center;}
.fnbl .tab:hover{background:var(--wash-2);}
.fnbl .tab.on{background:var(--grad);color:#fff;box-shadow:0 10px 24px -10px rgba(109,90,224,.5);}
.fnbl .tab.dim{color:#A9A2C9;}
.fnbl .searchrow{display:flex;margin-top:38px;border-radius:999px;position:relative;}
.fnbl .searchbox{flex:1;display:flex;align-items:center;gap:16px;background:var(--wash);border-radius:999px 0 0 999px;padding:0 10px 0 34px;min-width:0;}
.fnbl .searchbox svg{width:30px;height:30px;color:var(--indigo);flex:none;stroke-width:2.1;}
.fnbl .searchbox input{flex:1;min-width:0;background:none;border:none;outline:none;font:500 24px 'Inter',system-ui,sans-serif;color:var(--ink);padding:26px 0;}
.fnbl .searchbox input::placeholder{color:var(--ink-3);}
.fnbl .searchrow:focus-within .searchbox{background:var(--wash-2);}
.fnbl .alldd{position:relative;flex:none;}
.fnbl .allbtn{height:100%;display:flex;align-items:center;gap:16px;background:var(--grad);border:none;border-radius:0 999px 999px 0;padding:0 34px 0 40px;color:#fff;font-size:26px;font-weight:800;}
.fnbl .allbtn svg{width:22px;height:22px;stroke:#fff;stroke-width:3;}
.fnbl .filters{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:36px;}
.fnbl .fdd{position:relative;}
.fnbl .fbtn{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1.5px solid var(--line-2);border-radius:999px;padding:15px 17px;font-size:14px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--indigo);white-space:nowrap;}
.fnbl .fbtn:hover{border-color:var(--indigo);background:var(--wash);}
.fnbl .fbtn svg{width:13px;height:13px;stroke-width:3;opacity:.8;}
.fnbl .rmeta{display:flex;align-items:baseline;gap:14px;margin-top:40px;}
.fnbl .rmeta .n{font-size:21px;font-weight:800;}
.fnbl .rmeta .s{font-size:15px;color:var(--ink-2);font-weight:500;}
.fnbl .cols{--grid:minmax(340px,1.2fr) 104px minmax(190px,240px) 120px 122px 66px 40px 108px;}
.fnbl .thead,.fnbl .trow{display:grid;grid-template-columns:var(--grid);gap:20px;align-items:center;}
.fnbl .thead{padding:0 6px 16px;font-size:15px;font-weight:800;color:var(--ink);}
.fnbl .trow{padding:16px 6px;border-top:1px solid var(--line);}
.fnbl .trow:hover{background:#FBFAFF;}
.fnbl .song{display:flex;align-items:center;gap:18px;min-width:0;}
.fnbl .song>div:last-child{min-width:0;}
.fnbl .art{width:66px;height:66px;border-radius:6px;flex:none;position:relative;background-size:cover;background-position:center;border:1px solid var(--line);overflow:hidden;}
.fnbl .art .pb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(36,26,77,.52);border:none;padding:0;opacity:0;transition:opacity .16s;}
.fnbl .art:hover .pb{opacity:1;}
.fnbl .art .pb svg{width:24px;height:24px;fill:#fff;stroke:none;}
.fnbl .sname{font-size:19px;font-weight:600;color:var(--indigo);line-height:1.25;}
.fnbl .sby{font-size:16px;color:var(--ink-2);margin-top:4px;white-space:nowrap;}
.fnbl .sby b{font-weight:600;color:var(--ink-2);}
.fnbl .vers{display:inline-flex;align-items:center;gap:6px;border:1.5px solid var(--line-2);border-radius:999px;padding:8px 17px;font-size:16px;font-weight:600;color:var(--indigo);background:#fff;white-space:nowrap;}
.fnbl .vers:hover{border-color:var(--indigo);background:var(--wash);}
.fnbl .gen{font-size:16px;color:var(--indigo);line-height:1.45;}
.fnbl .dyn{display:block;}
.fnbl .energy{font-size:16px;color:var(--indigo);}
.fnbl .len{font-size:16px;color:var(--indigo);font-variant-numeric:tabular-nums;}
.fnbl .kebab{width:34px;height:34px;border-radius:8px;border:none;background:none;color:var(--ink-3);display:flex;align-items:center;justify-content:center;margin:0 auto;}
.fnbl .kebab:hover{background:var(--wash);color:var(--indigo);}
.fnbl .kebab svg{width:20px;height:20px;}
.fnbl .lic{border:none;border-radius:8px;background:var(--wash);color:var(--indigo);font-size:15px;font-weight:700;padding:14px 10px;width:100%;}
.fnbl .lic:hover{background:var(--grad);color:#fff;box-shadow:0 10px 24px -12px rgba(109,90,224,.6);}
.fnbl .rights{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;padding:4px 9px;border-radius:6px;margin-top:9px;letter-spacing:.02em;white-space:nowrap;}
.fnbl .rights svg{width:12px;height:12px;stroke-width:2.4;flex:none;}
.fnbl .rights.ok{color:var(--ok-fg);background:var(--ok-bg);border:1px solid var(--ok-line);}
.fnbl .rights.part{color:var(--part-fg);background:var(--part-bg);border:1px solid var(--part-line);}
.fnbl .rights.req{color:var(--req-fg);background:var(--req-bg);border:1px solid var(--req-line);}
.fnbl .loadmore{display:block;margin:44px auto 0;border:1.5px solid var(--line-2);background:#fff;border-radius:999px;padding:16px 42px;font-size:14.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--indigo);white-space:nowrap;}
.fnbl .loadmore:hover{border-color:var(--indigo);background:var(--wash);}
.fnbl .empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:86px 20px 60px;}
.fnbl .empty .ei{width:70px;height:70px;border-radius:18px;background:var(--wash);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--indigo);margin-bottom:22px;}
.fnbl .empty .ei svg{width:31px;height:31px;stroke-width:1.7;}
.fnbl .empty h3{font-size:24px;font-weight:800;margin:0;}
.fnbl .empty p{font-size:16px;color:var(--ink-2);margin:11px 0 0;line-height:1.55;max-width:48ch;}
@media (max-width:900px){
  .fnbl .cols{--grid:1fr auto;}
  .fnbl .thead{display:none;}
  .fnbl .trow>div:nth-child(n+3){display:none;}
}
`
