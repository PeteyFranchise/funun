# Funūn — build status & next steps

> Last updated: 2026-06-25 · Active branch: `main` · Latest: **Wave 1 complete** (PRs #3–#5 merged); Benchmarking + Antenna (PR #2) and redesign (PR #1) also merged
> Repo: https://github.com/PeteyFranchise/funun

A running handoff of where the build stands and what's next. Resume by opening a
Claude session **rooted in this repo** (see "Continue / resume" at the bottom).

> **👥 This repo will be shared with collaborators.** Write code and docs for
> onboarding: match existing patterns, comment the non-obvious *why*, keep these
> docs + `.env.example` current, never commit secrets, and keep commits and PRs
> small, clear, and scoped. Assume a new contributor reads this file first.

---

## TL;DR
The **Funūn redesign** (PR #1) and **Breakthrough Benchmarking** — its own room at
`/benchmarks` **plus a live connection to Antenna** (the "grow → unlock → pitch" loop)
— are both **merged into `main`** (PR #2, merge commit `2c8fe34`). The benchmarking
**data source is deferred** (manual entry today; wire a
real source next). DDEX **ERN 3.5.1 + RDR-N (MLC 1.31) now XSD-validate**. All Supabase
Management tokens are **deleted**. The ArtistOS → Funūn rename is **fully done**.

---

## Most recent work — Breakthrough Benchmarking + Antenna connection (PR #2)

**The room** (`/benchmarks`)
- `lib/benchmarks/engine.ts` — source-agnostic `BenchmarkInput` → `evaluateBenchmarks`.
  Derives career **stage** from monthly listeners, applies seeded **stage targets**
  ("Pete's framework") with **genre factors**, returns per-metric value/target/status
  (ahead / close / behind) + the 3 actions that move each number.
- `components/benchmarks/BenchmarkView.tsx` — manual metric entry → live comparison.
- `app/(artist)/benchmarks/page.tsx` — prefills genre + listeners; demo scenario.

**The connection (Benchmarks ↔ Antenna — "the unlock loop")**
- `lib/benchmarks/opportunity-map.ts` — pure gate engine. Maps each `OpportunityType`
  to its gating metric (saves→editorial playlist, engagement→brand, growth→label/press)
  or a listener threshold (sync / festival / venue), and reads a `BenchmarkResult` into
  **qualifies / almost / locked** + a one-line reason.
- `/benchmarks` shows a **"What this unlocks in Antenna"** card + **Save & sync**, which
  persists metrics to `artist_profiles.sound_identity.benchmarks` (JSONB — **no migration**).
- `/antenna` shows a **qualify/almost/locked badge** per opportunity with the gap + a
  **"Fix in Benchmarks"** deep-link (`components/antenna/OpportunityCard.tsx`,
  `AntennaBrowser.tsx`, `app/(artist)/antenna/page.tsx`).
  `app/api/benchmarks/route.ts` is the persistence endpoint.
- Verified: `tsc --noEmit` clean, `next build` green, and both routes server-render the
  correct gates in demo mode (brand → Qualifies, editorial → Locked, sync → Locked).
- Docs: `docs/breakthrough-benchmarking.md` (spec), `docs/build-ideas.md` (backlog,
  seeded with this card), `docs/spotify-api-guidelines.md` (Spotify API rules for the
  future data source).

---

## Next up ▢ (priority order)

> **Feature roadmap:** the full artist release-journey map — every pre/post-release
> task, its build status, which room it lives in, integration approach, and rollout
> waves — lives in **`docs/release-journey.md`**. That's the planning doc for what we
> build next at the feature level.

1. **Wave 1 ✅ complete** (`docs/release-journey.md`): artwork → 3000² standard + real
   dimension **verification**, lyrics `.txt` export, **distributor-selected gate**
   (migrations 016–017), and **master-WAV + shareable-MP3 slots**. All merged to `main`
   (PRs #3–#5). **Next build wave → Wave 2: rights & registration rails** — e-sign for
   split sheets/contracts, guided copyright/PRO/SoundExchange filing, Songtrust.
2. **Wire a real Benchmarking data source** (today it's manual entry). In order of
   speed: **artist CSV upload (fastest MVP)** → paid data partner (Chartmetric /
   Soundcharts / Songstats) → Spotify Web API OAuth (partial). Follow
   `docs/spotify-api-guidelines.md` — Spotify's ToS forbids training ML on their data,
   so the moat must be built from artists' own exported/authorized metrics.
3. **Start the aggregated dataset** (anonymised thresholds crossed) to move from seeded
   targets to real cohort benchmarks — the network-effect moat (sharpens at 500+ users).
4. **"Add to my plan"** action from the Antenna "see the moves" drill-down — mocked, not
   built yet.
5. Deepen Pete's framework: per-genre action libraries, threshold-specific playbooks.

### Lower-priority code follow-ups
- ERN: `TechnicalDetails` / `SoundRecordingEdition`, real DPIDs (PIE).
- RDR-N: collection-mandate party + territory + partner routing (RDx / aggregator).
- DSR: harden parser vs specific profiles; map ISRC→titles in the Earnings breakdown.
- DMs: presence indicator + unread badges.
- PIE / MEAD standards — not started.
- Decide the final brand **name** (working name "Funūn").

### Before launch (to-do)
- [ ] **Dropbox Sign account + API app** with embedded signing (free test mode to
      build/verify; Standard API plan ~$300/mo for production). Required before e-sign
      goes live — see `docs/e-sign-integration.md`. *(Account creation is on Pete —
      Claude can't sign up or enter credentials.)*
- [ ] **Collaborator profiles — capture once, reuse everywhere.** Persist per-collaborator
      data so they don't re-enter it each release, and auto-fill it into split sheets,
      contracts, and registration packages:
  - email + **mobile phone** — SMS signature confirmation, plus opt-in marketing to
    invite them to sign up for Funūn
  - legal name + performing name, role(s)
  - **PRO** affiliation + **IPI/CAE #**, publisher (+ publisher IPI), MLC / SoundExchange IDs
  - mailing address / country (registration + payouts)
  - Storage: a per-artist `collaborators` table (needs a migration) + auto-fill UI.
- [ ] **Revoke the temp Supabase Management token** if still active (was used for migrations 016–017).
- [ ] **Domain — `funun.studio`** (purchased via Squarespace, 2026-06-26). Point DNS at the
      app host (e.g. Vercel), stand up branded email (hello@ / support@ / privacy@funun.studio),
      and use HTTPS `funun.studio` URLs for OAuth + e-sign redirect URIs. Effectively locks the
      brand to **Funūn**.

### Parked ideas (revisit later)
- **SpotPitch iterations** (Spotify pitch tool — v1 shipped in PR #10): personalize from real
  Benchmarking metrics, playlist targeting, angle variants, tags from the master audio, timing
  nudges, multi-DSP pitches, and a "what earns adds" performance loop. Full card in
  `docs/build-ideas.md`.

---

## Done ✅ (earlier; in `main` via PR #1 unless noted)
- **App shell & design system** — Funūn dark theme; 252px gradient left-nav, now
  **seven** rooms: Sound Vault · Contract Locker · Antenna · **Benchmarks** · PitchPlug ·
  Rights Coach · Earnings.  *(Benchmarks added in PR #2.)*
- **Screens** — Sound Vault dashboard · Playback / release detail · Release Readiness ·
  Antenna (filters + match rings).
- **Rooms** — Contract Locker (PDF upload + AI verification; needs `ANTHROPIC_API_KEY`)
  · Rights Coach (eligibility engine) · Earnings (real DSR import + partner preview).
- **Profiles + social layer (live)** — `/profile`, `/u/[handle]`, `/r/[projectId]`;
  Follow · Wall · Endorsements · Release Comments · Activity feed · 1:1 DMs.
- **Rights & DDEX** — eligibility engine (Tier 1/2); CWR lane; **ERN 3.5.1 export now
  XSD-validates**; **RDR-N (MLC 1.31) export now XSD-validates** (`?format=ddex` /
  `?format=rdr`); DSR ingest + persisted aggregates.
- **Songtrust outreach email — drafted** (task #8); it's yours to send.
- **ArtistOS → Funūn rename — complete**: GitHub repo (`PeteyFranchise/funun`), all
  in-code references (~41), and the local folder (now `~/Desktop/funun`).
- **Supabase Management tokens — all deleted** by you (housekeeping done).
- Migrations **010–017** applied to live DB (project ref `wgfjakfiyeewzfuxkgyo`). 016–017
  are Wave 1's distributor gate (column + readiness-scoring trigger); the Benchmarking
  connection added none (rides the `sound_identity` JSONB).

---

## Continue / resume (this or another machine)
Open a Claude Code session **rooted in this repo** so commands, git, and the in-app
preview all target funun:
```
funun          # alias for: cd ~/Desktop/funun && claude
# …or long form:
cd ~/Desktop/funun && claude
```
Then run / verify:
```
git status                                    # confirm branch (expect: main)
npm install                                   # if needed
NEXT_PUBLIC_VAULT_DEMO=true npm run dev        # demo mode, no auth
node_modules/.bin/tsc --noEmit && npm run build
```
- The in-app **browser preview works** from a funun-rooted session — it was only blocked
  when running from the old `lexclock` session root.
- `.env.local` is gitignored — set secrets per machine (`ANTHROPIC_API_KEY`, optional
  `DDEX_DPID`).
- This machine is **macOS 12** — computer-use screenshots / teach mode don't work here;
  guide via text/terminal.
