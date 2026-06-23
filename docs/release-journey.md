# Funūn — The Artist Release Journey (build map + roadmap)

> Last updated: 2026-06-23 · Owner: Pete · Living document
>
> **What this is.** The canonical map of every step an independent artist takes to
> release a song / EP / album, and how Funūn supports each one. It serves three jobs:
> 1. **Build guide** — what's built, what's next, which room each task lives in.
> 2. **Readiness model** — which tasks feed the **Release Readiness** score (→ "ready
>    to upload to a distributor") vs. a softer **Launch Readiness** (promo) score.
> 3. **Future UX** — this list becomes an **interactive per-project "Release Roadmap"**
>    that walks the artist through the process and, where integrations exist, *does the
>    task for them*.
>
> Keep it current: update **Status** as we build, add tasks as they come up. Related:
> `docs/STATUS.md` (overall build state), `docs/build-ideas.md` (feature backlog).

---

## Vision — Funūn as the artist operating system

Funūn isn't just a guided checklist — it's the **operating system for an artist's
career**, and the **Sound Vault is the hub**: the single source of truth for every
asset and fact about a release —

- **Masters** (WAV) and **shareable MP3s** (for industry/press + Playback)
- **Artwork** (digital + physical specs) · **lyrics** · **track listing** · **credits** · **metadata**
- **Rights & legal** (split sheets, contracts, declarations)
- **Identifiers** (ISRC · UPC · ISWC)

**Enter once, push everywhere.** Because the canonical record lives in Funūn, direct
API integrations will let the artist push it **seamlessly to every recipient** — no
re-keying the same metadata into ten different portals:

| Funūn holds the truth → | …and pushes it to |
|---|---|
| Work + writer / split data | **PROs** · **publishing admins** (Songtrust) · **The MLC** |
| Recording + neighbouring-rights data | **SoundExchange** · RDx |
| Release package (audio, art, metadata, lyrics) | **Distributors** → **DSPs** |
| Promo assets (EPK, captions, video) | **Social media** · press · **pre-save** |
| Performance / earnings data (inbound) | back **into** Funūn (Songstats · DSR · SoundCloud) |

That's the long game: **keep everyone organized and guide them toward success**, then
quietly do more and more of the work for them as integrations come online.

Two pillars sit alongside the release journey:
- **The data hub** (above) — Sound Vault as system of record + outbound integrations.
- **The social & industry layer** — artists and industry professionals connect inside
  Funūn, building toward live **Industry Round Table** panels with real pros (see
  *Social layer & industry community* below).

---

## Legend

**Status:** ✅ built · 🟡 partial / guidance-only · ⬜ planned · 💡 idea
**Readiness:** 🎯 hard gate (must be done to ship — feeds Release Readiness) · ✨ soft (promo — feeds Launch Readiness) · — none
**Automation tier** (where Funūn is today → target):
- 📖 **Guide** — educate, checklist, deep-link out
- 🧩 **Assist** — generate / pre-fill / draft / validate (AI tools, templates)
- 🤖 **Automate** — Funūn performs the task via a partner API

The north-star arc for most tasks is **📖 → 🧩 → 🤖**.

---

## Two readiness scores (proposed model)

Today `lib/vault/readiness.ts` mixes **ship-gates** (audio, artwork, ISRC, splits,
copyright, work-for-hire, metadata) with **promo items** (EPK, captions, TikTok
strategy) in one score. Proposal — split them:

- **Release Readiness 🎯** — *can this actually ship?* Hard gates only. 100% = "ready
  to upload to your distributor." This is the number that should gate submission.
- **Launch Readiness ✨** — *how well-promoted will it be?* Soft, additive, never
  blocks shipping. EPK, pre-save, Spotify pitch, Canvas, social assets, press, email
  list, etc. live here.

This keeps the ship-gate honest while still rewarding promo prep. (See **Build plan →
Readiness scoring** for the migration.)

---

## Journey phases (overview)

| Phase | What happens | Pre/Post | Primary room(s) |
|---|---|---|---|
| **1 · Foundation** | Account, artist profile, choose distributor, set release date | Pre | Profile · Sound Vault |
| **2 · Assets** | Masters (WAV) + MP3, artwork, lyrics, track listing, credits/metadata | Pre | Sound Vault · Metadata Studio |
| **3 · Rights & registration** | Split sheets, contracts, copyright, PRO, publishing admin, SoundExchange, sync | Pre | Contract Locker · Rights Coach |
| **4 · Distribution prep** | Identifiers, time-synced lyrics, video/Content ID, get upload-ready | Pre | Sound Vault · Metadata Studio |
| **5 · Pre-release marketing** | EPK, pre-save, Spotify pitch/Canvas, social assets, press, channel seeding | Pre | Tools · *Launchpad (new)* |
| **6 · Release week** | Submit, announce, activate pre-save → live | Launch | *Launchpad* |
| **7 · Post-release growth** | DSP optimization, paid, CRM, partnerships, benchmarking | Post | *Launchpad* · Antenna · Benchmarks |

---

# PRE-RELEASE TASKS

> These get a project to **100% Release Readiness** (🎯) and seed **Launch Readiness** (✨).

## 2 · Assets & files

| Task | Status | Room | Rdy | Integration / approach | Tier |
|---|---|---|---|---|---|
| Upload **master WAV** | 🟡 | Sound Vault | 🎯 | Audio upload exists; add a dedicated master-WAV slot + format/quality check | 🧩 |
| Upload **MP3** (industry share + Playback screen) | 🟡 | Sound Vault / Playback | 🎯 | Add MP3 rendition; eventually **auto-transcode** WAV→MP3 | 🧩→🤖 |
| Upload **lyrics** to the lyrics tool | ✅ | Metadata Studio | ✨ | Built (stored in `tracks.metadata`, ID3 USLT + sidecar) | ✅ |
| **Lyrics .txt** export (copy/paste for collabs/media) | ⬜ | Metadata Studio | ✨ | One-click `.txt` from stored lyrics — quick win | 🧩 |
| Upload **artwork** (cover / single) | ✅ | Sound Vault | 🎯 | Built (`visual_asset`) | ✅ |
| **Artwork spec check** (3000×3000, sharp/striking) | 🟡 | Sound Vault upload | 🎯 | `lib/metadata/validate.ts` exists — confirm it enforces 3000² + flags low-res | 🧩 |
| **Artwork budget guidance** (what to spend) | ⬜ | Coach / *Cost Advisor* | ✨ | Cost-range guidance per task (artwork, video, ads…) | 📖 |
| **Physical specs** (vinyl / CD / tape art + sizing) | ⬜ | Sound Vault (physical add-on) | ✨ | Guidance + manufacturer partner | 📖 |
| **Track listing + credits + metadata** correct | ✅ | Metadata Studio | 🎯 | Built (composers/splits = 100%); DistroAdvisor reviews | ✅ |

## 3 · Rights, legal & registration

| Task | Status | Room | Rdy | Integration / approach | Tier |
|---|---|---|---|---|---|
| **Split sheets** — disperse for e-sign / upload signed | 🟡 | Contract Locker | 🎯 | Signed-status tracked (`split_sheet` docs); add **e-sign dispersal** (native or Dropbox Sign / DocuSign) | 🧩→🤖 |
| **Contracts/agreements** — e-sign / upload signed (producer declarations, distro, work-for-hire) | 🟡 | Contract Locker | 🎯 | `hire_right` tracked + AI verification; add e-sign flow | 🧩→🤖 |
| **Copyright** the work (registration) | 🟡 | Rights Coach / Locker | 🎯 | Presence of `copyright_registration` doc feeds score; add **guided filing** + deep-link to copyright.gov eCO | 📖→🧩 |
| Register with a **PRO** | 🟡 | Rights Coach (RoyaltyAudit) | 🎯 | ISWC proxy feeds score; RoyaltyAudit guides; link to ASCAP/BMI/etc. | 📖 |
| Register with **publishing admin** (Songtrust) | ⬜ | Rights Coach / Earnings | ✨ | Outreach drafted (task #8); pursue **Songtrust integration** (API/CWR) | 📖→🤖 |
| Register with **SoundExchange** | ⬜ | Rights Coach | ✨ | RDR-N data exists; guided signup + (later) integration | 📖 |
| Submit to **TV/Film sync** agents/agencies | ⬜ | Antenna / PitchPlug | ✨ | Sync opportunities supply + outreach | 📖→🧩 |

## 4 · Distribution prep  (goal: **upload-ready for a distributor**)

| Task | Status | Room | Rdy | Integration / approach | Tier |
|---|---|---|---|---|---|
| **Choose your distributor** | 🟡 | Sound Vault (new step) | 🎯 | DistroAdvisor guides; add a **chooser + "distributor selected" gate**; affiliate links (DistroKid/TuneCore/CD Baby) | 📖→🧩 |
| **ISRC / UPC** codes | ✅ | Metadata Studio | 🎯 | Built (BYO or assign) | ✅ |
| **Time-synced lyrics** (LRC) for DSP playback | ⬜ | Metadata Studio / Playback | ✨ | Lyrics stored; add **LRC sync editor**; push to distributor portals later | 🧩→🤖 |
| **Music video** upload to distributors/DSPs that support | ⬜ | Sound Vault (video) | ✨ | Video asset slot + distributor delivery | 📖 |
| **YouTube Content ID** decide & set up | 🟡 | Sound Vault / Rights | ✨ | `lib/tools/contentid.ts` exists — extend to a decision + where-to-store flow | 🧩 |

---

# PRE-RELEASE MARKETING  (feeds Launch Readiness ✨)

## 5a · Press & assets

| Task | Status | Room | Rdy | Integration / approach | Tier |
|---|---|---|---|---|---|
| **EPK / press kit** | ✅ | Tools (EPK.fyi) | ✨ | Built — AI EPK generator (`epkfyi`) | ✅ |
| **Press materials** prep (bio, one-sheet, photos) | 🟡 | Tools · Sound Vault one-sheet | ✨ | EPK + one-sheet built; add photo/asset checklist | 🧩 |
| **Social banners & posts** | 🟡 | Tools / *Launchpad* | ✨ | DropReady writes captions; add **banner/image generation** | 🧩 |
| **Short-form video** content | 🟡 | Tools / *Launchpad* | ✨ | SoundBait gives hooks/plan; add asset templates | 🧩 |
| **Hire a publicist** OR DIY | ⬜ | *Launchpad* / Antenna | ✨ | Publicist marketplace + DIY tools | 📖 |

## 5b · DSP pitch & campaigns

| Task | Status | Room | Rdy | Integration / approach | Tier |
|---|---|---|---|---|---|
| **Pre-save campaign** (Hypeddit / DistroKid HyperFollow / Topfan / native) | ⬜ | *Launchpad* | ✨ | DistroAdvisor gives strategy; build **native pre-save** or integrate | 📖→🤖 |
| **Spotify editorial pitch** | ⬜ | PitchPlug / *Launchpad* | ✨ | S4A has no pitch API → **draft the pitch** for the artist to paste (assist) | 📖→🧩 |
| **Spotify Canvas** | ⬜ | *Launchpad* | ✨ | Guidance + (later) a Canvas asset maker | 📖 |
| **Spotify Marquee** ad (learn/consider) | ⬜ | *Launchpad* | ✨ | Education + readiness checklist | 📖 |
| **Spotify Showcase** ad (learn/consider) | ⬜ | *Launchpad* | ✨ | Education + checklist | 📖 |
| Pitch to **Amazon** playlists | ⬜ | PitchPlug / *Launchpad* | ✨ | Guide (Amazon Music for Artists) | 📖 |
| **Facebook ads** + **retargeting** (learn/consider) | ⬜ | *Launchpad* | ✨ | Education + setup checklist | 📖 |

## 5c · Channel seeding & outreach

| Task | Status | Room | Rdy | Integration / approach | Tier |
|---|---|---|---|---|---|
| **SoundCloud** upload + monitor data | ⬜ | *Launchpad* / Earnings | ✨ | SoundCloud API (upload + stats) | 📖→🤖 |
| **YouTube** videos + lyric videos + thumbnail | ⬜ | *Launchpad* | ✨ | YouTube integration + native lyric-video/thumbnail tools | 📖 |
| **Email list** build + first email | ⬜ | *Launchpad* (CRM) | ✨ | Native list or Mailchimp/ConvertKit | 📖→🤖 |
| **Radio promotion** (DIY + outsource) | ⬜ | Antenna | ✨ | Radio opportunity supply + promo partner | 📖 |
| **Merch** create & order | ⬜ | *Launchpad* / *Merch* | ✨ | Print-on-demand partner | 📖→🤖 |
| **Podcasts** — find relevant + pitch to appear | ⬜ | Antenna / PitchPlug | ✨ | Podcast opportunity supply + outreach | 📖→🧩 |
| **Facebook / Reddit groups** — find + join | ⬜ | Antenna / Coach | ✨ | Curated community finder | 📖 |

---

# POST-LAUNCH TASKS  (growth — feeds Launch Readiness ✨, post-release)

## DSP optimization

| Task | Status | Room | Integration / approach | Tier |
|---|---|---|---|---|
| Make a **personal Spotify playlist** | ⬜ | *Launchpad* | Guide | 📖 |
| Set up **Spotify Artist Pick** | ⬜ | *Launchpad* | Guide (S4A) | 📖 |
| Submit to **Spotify Discovery Mode** | ⬜ | *Launchpad* | Guide (S4A) | 📖 |
| **Pin song** to TikTok Artist profile | ⬜ | *Launchpad* | Guide | 📖 |

## Paid promotion

| Task | Status | Room | Integration / approach | Tier |
|---|---|---|---|---|
| **Spotify ads** (Marquee/Showcase, post) | ⬜ | *Launchpad* | Guide | 📖 |
| **FB / IG / TikTok ads** (release or playlist push) | ⬜ | *Launchpad* | Guide + setup | 📖 |
| **SoundCloud Promote** | ⬜ | *Launchpad* | Guide | 📖 |
| **TikTok ads** | ⬜ | *Launchpad* | Guide | 📖 |
| **Playlist promotional campaign** | ⬜ | *Launchpad* / Antenna | Playlist-promo partner | 📖 |

## Audience & CRM

| Task | Status | Room | Integration / approach | Tier |
|---|---|---|---|---|
| **SMS broadcast** | ⬜ | *Launchpad* (CRM) | Twilio / SMS partner | 📖→🤖 |
| **Email** friends + personal network | ⬜ | *Launchpad* (CRM) | Native / Mailchimp | 📖 |
| **Bandsintown** | ⬜ | *Launchpad* | Bandsintown API | 📖→🤖 |
| **Social cadence calendar** *(prior working name — recover it)* + post regularly | ⬜ | *Launchpad* | Native scheduler/calendar | 🧩 |

## Partnerships & data

| Task | Status | Room | Integration / approach | Tier |
|---|---|---|---|---|
| **Influencer marketing / clippers** | ⬜ | Antenna / *Launchpad* | Creator/clipper marketplace | 📖 |
| **Promotional partners** | ⬜ | Antenna | Partner marketplace | 📖 |
| **Songstats + Funūn Benchmarking** | 🟡 | Benchmarks | Benchmarks built; **Songstats** = the deferred data source | 📖→🤖 |
| **Playlist campaign / pitch** | ⬜ | PitchPlug / Antenna | Playlist partner | 📖 |

---

# SOCIAL LAYER & INDUSTRY COMMUNITY

A parallel pillar to the release journey: Funūn is also where artists and industry
professionals **connect**. This compounds everything above — discovery, mentorship,
credibility, and promotion all get easier inside a real network, and it's a moat tools
alone can't copy.

| Capability | Status | Room | Notes |
|---|---|---|---|
| Public profile + Now Playing | ✅ | Profile | `/profile`, `/u/[handle]`, `/r/[projectId]` |
| Follow · Wall · Endorsements | ✅ | Profile | Social graph + credibility signals |
| Release comments (threaded) | ✅ | Profile | Feedback on releases |
| Activity feed | ✅ | Profile | Auto-emits on release / placement / readiness milestones |
| 1:1 DMs (artist ↔ industry) | ✅ | DMs | Realtime + polling fallback |
| Artist ↔ industry matching | ✅ | Antenna · PitchPlug | Opportunities + pitching |
| Presence + unread badges | ⬜ | DMs | On the social backlog |
| **Industry Round Table** — live panels / talks with real pros (e.g. **Peter Zora**) | 💡 | 🆕 Round Table | Scheduled live discussions, replays, Q&A. The differentiator: *real industry access*, not just tools |

**Why it matters:** tools guide an artist; a network with **real industry access**
keeps them. The Round Table makes Funūn a destination, feeds the Antenna with genuine
opportunities, and puts a face on the expertise behind the benchmarking framework.

---

# BUILD PLAN & SEQUENCING

## Room map

| Room | Owns (journey tasks) |
|---|---|
| **Sound Vault** (+ per-project) | Assets, masters, artwork, metadata, distributor choice, video, Content ID, **Release Roadmap** |
| **Metadata Studio** | Lyrics, .txt export, LRC sync, track listing, credits, ISRC/UPC |
| **Contract Locker** | Split sheets, contracts, e-sign, copyright docs |
| **Rights Coach** | Copyright/PRO/SoundExchange/publishing-admin guidance + registration |
| **Antenna** | Sync agents, radio, podcasts, playlist/promo/influencer opportunities |
| **PitchPlug** | Editorial / curator / industry pitches |
| **Benchmarks** | Songstats data + benchmarking |
| **Earnings** | DSR + royalty data (SoundCloud/streaming stats feed here) |
| **Tools** | AI assistants: EPK.fyi, DropReady, SoundBait, DistroAdvisor, RoyaltyAudit |
| **🆕 Launchpad** | Marketing campaign hub: pre-save, DSP pitch/Canvas, ads education, social assets + calendar, CRM (email/SMS), post-launch growth |
| **🆕 Release Roadmap** (per-project view) | The interactive version of *this document* — a live checklist that drives the readiness scores |
| **Profile / Social** (+ 🆕 Round Table) | Artist↔industry network: profiles, follow, wall, endorsements, comments, activity, DMs; future live Round Table panels |

## Integration strategy (four buckets)

These integrations are how the **system of record** (Sound Vault) pushes the artist's
canonical data outward — *enter once, push everywhere* (see **Vision**). Four buckets:

1. **Native build (no partner):** lyrics `.txt`, LRC sync, artwork-spec validation,
   distributor chooser, pre-save (option), social calendar, e-sign (option), cost
   advisor. *Fastest — fully in our control.*
2. **API integration (partner has an API):** Songstats, SoundCloud, Bandsintown,
   YouTube, Mailchimp/ConvertKit, Twilio (SMS), Dropbox Sign/DocuSign, Hypeddit /
   DistroKid HyperFollow, distributor APIs.
3. **Guide-and-link (no API — manual on the platform):** Spotify-for-Artists (pitch,
   Canvas, Marquee, Showcase, Discovery Mode, Artist Pick), Amazon Music, copyright.gov,
   PRO registration, FB/TikTok Ads Manager. *We add max value by drafting + checklisting.*
4. **Partner / BD deal needed:** publishing admin (Songtrust), merch print partner,
   playlist promo, radio promo, publicist & influencer/clipper marketplaces.

## Rollout waves

- **Wave 1 — Tighten Release Readiness** *(native, quick, all 🎯).* Master-WAV + MP3
  slots (+ auto-transcode), artwork 3000² validation, lyrics `.txt`, LRC sync editor,
  **distributor-selected gate**. Outcome: 100% truly means "upload-ready."
- **Wave 2 — Rights & registration rails.** Native/integrated **e-sign** for split
  sheets & contracts; **guided filing** for copyright / PRO / SoundExchange with status
  tracking; pursue **Songtrust** integration.
- **Wave 3 — Launchpad room (new).** Pre-save (native first), Spotify pitch/Canvas
  education + draft-the-pitch, banner/thumbnail generation (extend DropReady/SoundBait),
  email/SMS CRM, the **social calendar**, and the post-launch growth checklist.
- **Wave 4 — Deep integrations.** Songstats (Benchmarks data source — highest leverage),
  SoundCloud, Bandsintown, YouTube, distributor + pre-save APIs, merch/print, ad platforms.
- **Wave 5 — Interactive journey + automation.** Ship the per-project **Release Roadmap**
  UI driven by this doc; add "do it for me" automation wherever a Wave-2/4 integration
  exists.

## Readiness scoring — migration

1. Re-tag current `READINESS_ITEMS` as **hard 🎯** (audio, artwork, metadata, ISRC,
   splits, copyright, work-for-hire, PRO-proxy) vs **soft ✨** (epk, caption_copy,
   tiktok_strategy).
2. Compute **two** scores; gate "submit" on the hard score only.
3. Add new hard gates from Wave 1 (master WAV, MP3, artwork-spec pass, distributor
   selected). Add soft items as Launchpad features ship.

## Open decisions (need Pete)

- **Distribution positioning** — is Funūn a distributor, or the *prep + rights +
  discovery* layer that hands an upload-ready release to the artist's distributor?
  (Drives Wave 1 + Wave 4 scope. See `docs/STATUS.md`.)
- **Pre-save & e-sign & social calendar** — build native or integrate first?
- **Which partners to court first** — Songstats (data) and Songtrust (publishing) look
  like the highest-leverage BD conversations.
- **Recover the social-calendar name** (the better one we used before).
- **Industry Round Table** — format (live vs. recorded), cadence, and first panelists
  (you + which guests).

---

## Maintenance

- Update **Status** here as features land; mirror big milestones into `docs/STATUS.md`.
- New tasks → add to the right phase table with Status/Room/Readiness/Integration/Tier.
- When a task reaches 🤖, note the integration + where the "do it for me" action lives.
- This doc is the **spec** for the future Release Roadmap UI — keep task keys stable so
  they can map to readiness item keys.
