# Handoff: Funūn — Artist Platform Screens

## Overview
Funūn is a platform that helps independent music artists get release-ready, get paid, and get
discovered. This bundle contains the **high-fidelity UI designs** for the core authenticated app
screens, including the hero **Sound Vault** dashboard and the **Artist Profile** player. They share
one dark, premium visual system (indigo→fuchsia gradient accent on near-black).

## About the Design Files
The files in this bundle are **design references created in HTML/CSS** — static prototypes that show
the intended look, layout, and content. They are **not production code to ship directly**. The task
is to **recreate these designs in the target codebase's environment** (React, Vue, SwiftUI, etc.)
using its established component patterns, routing, and state management. If no environment exists
yet, pick the most appropriate framework for the project and implement the screens there.

Each HTML file is self-contained and links the shared stylesheet `app.css` (design tokens + the
common left-nav / top-bar shell). Icons are inline SVG in the [Lucide](https://lucide.dev) style
(1.7–2px stroke, rounded caps) — swap in your icon library's equivalents.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and component styling. Recreate the UI
pixel-faithfully using your codebase's libraries. Exact values are in **Design Tokens** below.

> All screens are authored on a fixed **1440×900** desktop canvas (the Artist Profile is a portrait
> **820×952** "now playing" view). Treat these as the desktop/large breakpoint and make them
> responsive per your app's conventions.

---

## Design Tokens

### Color
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0a0a0f` | Page background (near-black, indigo undertone) |
| `--card` | `#0E0D1E` | Card / panel surface |
| `--card-2` | `#1A1838` | Raised surface (nav active, chips, icon tiles) |
| `--white` | `#FFFFFF` | Primary text |
| `--lav` | `#C7CBF7` | Secondary text (soft lavender-grey) |
| `--lav-dim` | `#7c80b4` | Tertiary / muted text, inactive nav |
| `--indigo` | `#818CF8` | Gradient start, info accent |
| `--fuchsia` | `#D946EF` | Gradient end |
| `--emerald` | `#34D399` | Success / "ready / passed" |
| `--amber` / `--amber-2` | `#F59E0B` / `#F4C77B` | Money / highlights / earnings |
| `--rose` | `#F43F5E` | Attention / "needs work" |
| `--border` | `rgba(199,203,247,.12)` | Hairline borders |
| `--border-strong` | `rgba(199,203,247,.22)` | Emphasis borders |

**Signature gradient** `--grad`: `linear-gradient(105deg,#818CF8 0%,#D946EF 100%)` — used on the
logo, primary buttons, progress fills, active-nav indicator, and key numbers (via background-clip
text, helper class `.gtext`).
**Money gradient** `--grad-money`: `linear-gradient(105deg,#F4C77B 0%,#F59E0B 100%)` (helper `.mtext`).

### Typography
- **Family:** Inter (Google Fonts), weights 400–900. Fallback `system-ui, sans-serif`.
- **Numbers:** use `font-variant-numeric: tabular-nums` for scores, durations, times.
- Scale in use (px): nav item 15.5 · topbar H1 27 · card titles 18–19 · body 14–16 · chips 12.5 ·
  eyebrows/labels 11–13 (uppercase, letter-spacing .14–.20em). Artist Profile uses a large
  900-weight 58px track title.

### Spacing / Radius / Shadow
- 4px base rhythm; common gaps 8/12/14/20px; section padding 26–36px.
- Radii: inputs/buttons/chips `10px`, cards `18px`, nav items `11px`, pills/status `999px`, large
  artwork `18–28px`.
- Shadows only on floating/primary elements (buttons, play control), tinted dark:
  e.g. button `0 12px 30px -10px rgba(217,70,239,.5)`.

---

## Shared shell (`app.css`)
Every desktop screen is `body { display:flex }` → **`.nav`** (252px left rail) + **`.main`** (fills rest).

- **`.nav`** — vertical gradient rail. Contains: `.brand` (logo "FUNŪN" in `.gtext` + tag
  "THE ARTS"), a `.nav-group` label ("WORKSPACE"), `.nav-item`s, a `.nav-spacer`, and `.nav-user`
  (avatar + name + plan). Active item: `.nav-item.active` (raised bg + 3px gradient bar on the left
  via `::before`, icon stroked with the gradient via `url(#ng)` — an inline `<linearGradient id="ng">`
  is defined in each file's SVG defs).
  Nav order: **Sound Vault · Contract Locker · Antenna · PitchPlug · Rights Coach · Earnings**.
- **`.main` > `.topbar`** — page H1 + `.sub` subtitle on the left; right-aligned `.search` and/or
  `.btn` (primary, gradient) / `.btn.ghost`.
- **`.main` > `.body`** — scroll/content region (padding 30×36).
- **`.chip`** — status pill with `.ok / .warn / .bad / .info` variants (emerald/amber/rose/indigo,
  each at 12% bg + 28% border) and a leading `.d` dot.
- **`.card`** — `--card` bg, 1px `--border`, 18px radius.

---

## Screens

### 1. Sound Vault — `sound-vault.html`  *(hero screen)*
- **Purpose:** an artist's home base — a grid of release "projects," each with a Release Readiness score.
- **Layout:** shell + `.body` containing a `.tabs` row (All / Live / Scheduled / Drafts, each with a
  count) and a **3-column `.grid`** (24px gap) of release cards.
- **Release card (`.rcard`):** rounded 18px, hairline border.
  - **`.cover`** (182px tall): full-bleed album-art image (`background: url(...) center/cover`).
    Overlaid: a `.gloss` scrim (top + bottom darkening for legibility — top
    `rgba(0,0,0,.45)→0` over first 24%, bottom `0→rgba(0,0,0,.58)`), a top-left status `.chip`, and a
    bottom-right circular **readiness ring** (`.ring`, 66px) built from a `conic-gradient` colored by
    score band: emerald ≥ ~85, amber mid, rose low; the inner disc shows the number.
  - **`.meta`:** title, "Artist · type", a `.row` of facts (track count · date), and a `.rlabel`
    footer ("Release readiness" + a colored status word).
- **Header:** H1 "Your Sound Vault", `.search` ("Search releases"), primary `.btn` **"New project"**.
- **Sample data (keep or replace):** Midnight Ride (EP, 92, Live) · Moonlight (Single, 68, Scheduled)
  · Paper (Single, 40, Draft) · Golden Hour (EP, 88, Live) · Static Heart (Single, 74, In review) ·
  Lantern (Single, 55, Draft).

### 2. Artist Profile — `artist-profile.html`  *(portrait 820×952)*
- **Purpose:** a Spotify / Apple-Music-style "now playing" + artist profile view for a release.
- **Layout (vertical):**
  - **App bar** (absolute, top): back chevron · "NOW PLAYING" · overflow menu, all on frosted round buttons.
  - **`.art`** (560px): full-bleed cover image with a `.scrim` fading into the page; bottom-left
    `.meta` block = a frosted "FUNŪN · Artist profile" pill, an eyebrow ("SINGLE"), a large 58px/900
    title, then artist row (avatar + name + verified check + "· N monthly listeners").
  - **`.player`:** a `.scrub` progress bar (gradient `.f` fill at 38% with a white knob) + `.times`
    (current / total), then `.controls` — shuffle, skip-prev, large gradient **play** circle (78px,
    shadowed), skip-next, repeat.
  - **`.next`:** "More from Maya Reyes" list (`.trk` rows: 48px art thumb + title + "type · year" +
    duration; active row title uses `.gtext` and a small equalizer glyph).
- Uses the same color/type tokens as `app.css` (the file inlines its own layout CSS and also links
  `app.css` for tokens + fonts).

### 3. Playback / Release detail — `playback.html`
- **Purpose:** open one release; listen to masters/stems beside credits & metadata.
- **Layout:** shell + a 3-column detail grid: **left** tracklist + files; **center** big square
  artwork, now-playing title, Master/Stems toggle, a **waveform** (bars; played portion in gradient),
  transport controls; **right** credits & splits (avatars + role + %, "100% resolved" chip) and a
  metadata table (ISRC, ISWC, BPM, Key, Language). A persistent **mini-player** bar sits at the bottom.

### 4. Release Readiness — `release-readiness.html`
- **Purpose:** the 0–100 readiness score for a release and the checklist of gates to raise it.
- **Layout:** 2-column body. **Left:** big 300px circular score ring (gradient arc), a progress label
  ("7 of 10 complete") with bar, and an "AI Rights Coach" callout card. **Right:** a vertical list of
  **gate rows** (`.gate.ok/.warn/.bad`) — icon tile + title + sub + status word or a **"Fix it →"**
  button (gradient for blocking gates). Gates: splits resolved, samples cleared, master uploaded,
  cover/assets, metadata complete, registrations filed, distribution agreement.

### 5. Antenna — `antenna.html`
- **Purpose:** ranked opportunity matches (sync / playlist / brand / library).
- **Layout:** body = list + right filter panel. Each **`.opp`** row: a circular **match-% ring**
  (gradient) + type eyebrow + title + genre/mood `.tg` tags + deadline meta + a gradient
  **"Pitch with PitchPlug"** button. A top banner nudges raising readiness. Filter panel: checkboxes
  (with counts), a "minimum match" slider, sound/mood tag chips.

### 6. Contract Locker — `contract-locker.html`
- **Purpose:** the documents store (split sheets, clearances, agreements) — referenced by the nav.

### 7. User Profile — `user-profile.html`  *(full-page public profile, no app shell)*
- **Purpose:** a LinkedIn / ProductHunt-style public profile where members (artist, producer,
  songwriter, music supervisor, A&R, exec, or a custom title) connect, follow, message, endorse, and
  leave messages. Designed as the **public view**; an amber dashed annotation marks where **owner
  controls** swap in (Follow/Message → Edit profile · Share · View analytics).
- **Self-contained full-bleed page** (its own `<style>`; links `app.css` only for tokens + fonts +
  helpers). Sticky frosted top bar (logo · Discover/Opportunities/Network · search · messages/bell ·
  viewer avatar). Fills the full viewport width; two-column body collapses to one column ≤1080px.
- **Header:** banner, large avatar with online dot, name + verified check + pronouns, **role badges**
  (lead role highlighted), location · tenure · an emerald **open-to** status, and **Follow / Message /
  ⋯** actions.
- **Main column:** About + skill/genre tags · a **Featured / "Launching today"** spotlight release ·
  **Releases** auto-fill grid (cover, readiness ring, play, plays + comment counts) · **threaded
  comments** on a release · **Activity** feed (placements, releases, readiness milestones with
  reactions/comments) · **Endorsements** (recommendation cards) · **Wall** (a "leave a message"
  composer + public posts).
- **Sidebar:** Stats (followers, monthly listeners, placements, avg. readiness) · **Open to** chips ·
  **Roles** (chips + "Add role" + note that members pick from a list or enter a custom title) ·
  **Worked with** collaborators.
- **Floating DM widget** (bottom-right): 1:1 direct-message panel (header with presence, message
  bubbles, composer) — represents private messaging.
- **Owner vs public:** public view shows Follow/Message/Connect + the wall composer addresses the
  viewer; for the owner, swap the primary actions to Edit profile / Share / View analytics, make
  banner/avatar/cover editable, and show "Add role" inline (already stubbed).

---

## Interactions & Behavior (intended)
- **Nav:** single active route at a time (gradient bar + raised tile). Standard hover = slight bg lift.
- **Buttons / press:** primary `.btn` is the gradient CTA; `.btn.ghost` is the secondary. Brief
  press-scale (~0.97) + slight darken on press; never lighten on hover.
- **Readiness rings & match rings:** value-driven `conic-gradient` arcs; the numeric value sits in a
  centered inner disc. Animate the arc sweep on load if desired (≤480ms ease-out).
- **Player:** play/pause toggles the center control; scrubber + mini-player reflect playback position
  (persist position in app state). Master/Stems is a segmented toggle.
- **Motion:** slow, considered — durations ~160–480ms, gentle ease-out; cross-fades over slides; no
  bounce/overshoot. Respect `prefers-reduced-motion`.

## State Management (suggested)
- Auth'd user (name, avatar initials, plan tier).
- Releases collection: `{ id, title, artist, type, status, readinessScore, gates[], coverArt,
  tracks[], credits[], metadata }`.
- Per-release readiness: gate pass/fail/in-progress + computed score.
- Player: `{ currentRelease, currentTrack, isPlaying, positionMs, source: 'master'|'stems' }`.
- Antenna matches: `{ id, type, title, tags[], matchPct, deadline }` + active filters.
- Profile: `{ user, roles[] (from a fixed list + custom), openTo[], stats, followers, following,
  endorsements[], wallPosts[], activity[] }`; connections (follow/connect), 1:1 message threads, and
  per-release comment threads.

## Assets
- **Album art** (`art/`): `midnight-ride.png`, `moonlight.png`, `paper.png`, `golden-hour.png`,
  `static-heart.png`, `lantern.png` — supplied artwork (used as release covers and in the profile).
  Replace with real release artwork per artist.
- **Artist avatars** (`art/maya.png`, `art/jonah.png`): photos used for **Maya Reyes** (nav user,
  artist profile row, songwriter-credit chip) and **Jonah Cole** (songwriter-credit chip on the
  playback screen). Render in a circle (`border-radius:50%`, `object-fit:cover`). Other collaborators
  (e.g. Dara Amin) use initials avatars — fall back to initials when no photo exists for a person.
- **Fonts:** Inter via Google Fonts (`@import` at the top of `app.css`).
- **Icons:** inline SVG, Lucide-style. Replace with your icon system.
- **Logo:** the wordmark is typographic — "FUNŪN" (note the macron **ū**, U+016B / uppercase Ū U+016A)
  set in Inter 900 with the indigo→fuchsia gradient; tagline "THE ARTS".

## Files
- `app.css` — design tokens + shared nav/top-bar/chip/card shell. **Start here.**
- `sound-vault.html` — Sound Vault dashboard (hero).
- `artist-profile.html` — Artist Profile / now-playing player (portrait).
- `playback.html` — release detail + playback engine.
- `release-readiness.html` — readiness score + gate checklist.
- `antenna.html` — opportunity matches + filters.
- `contract-locker.html` — documents store.
- `user-profile.html` — full-page public profile (networking / messaging / wall).
- `art/` — album-art + avatar images used across the screens.
- `screens-reference.pdf` — rendered preview of every screen, one per page (visual reference only).

Open any HTML file directly in a browser to preview. The app screens (Sound Vault, Playback,
Readiness, Antenna, Contract Locker) and the user profile fill the full viewport; the Artist Profile
now-playing view is a fixed portrait canvas.
