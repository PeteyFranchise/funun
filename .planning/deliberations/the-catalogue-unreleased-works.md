# The Catalogue — Unreleased works as first-class assets

**Status:** Owner vision captured + three core decisions LOCKED (2026-08-30 discussion).
Ready for `/gsd-discuss-phase` when scheduled. Decisions below are settled — do not re-ask.

## The reframe

"Unreleased" stays as a project type — the owner explicitly keeps it — but it graduates
from junk drawer to **publisher-grade catalogue**: the unit is a *work with a living
history*, not a release-in-waiting. Thinking chairs that produced this: a publisher's
catalog IS unreleased works (works, not releases); a producer's vault is 95% unreleased
forever and that's the store, not a failure; an A&R hunts what is NOT out. The industry
side of Funūn (Crate, sync, discovery) runs on unreleased inventory — this phase makes
the artist side match.

## The six directions (all owner-approved 2026-08-30)

1. **Rights-readiness scorecard.** Unreleased works are scored on rights readiness
   (audio, splits, ownership, metadata) — NOT release readiness (artwork/distributor
   gates are noise for a song not going anywhere). Same scoring machinery, different
   checklist per type. Score means "pitch-ready".
2. **Graduation.** "Promote to release": pick work(s) → choose Single/EP/Album → audio,
   sheets, metadata, registrations carry over. Kills the re-typing problem. The chosen
   iteration becomes the release master; full history rides along.
3. **Crate entry.** A rights-ready unreleased work can be added to The Crate **by invite
   or submission** (owner's words — quality-gated, not automatic).
4. **Pitch life.** Per-work pitch history + holds ("on hold for X") — point the existing
   submissions system at works. Needs a great UI to match (owner emphasis).
5. **Artist playlists.** Artists create shareable playlists of unreleased works for
   collaborators and industry contacts. Reuses the Selects player machinery (exists on
   the AE side); artist-facing variant. Extends the permissioned-A&R-listening idea.
6. **Catalogue at volume.** A list/table view built for 80+ works: sort/filter by
   mood/BPM/rights-status, bulk actions (sound-identity metadata already exists).
   "Everyone has everything they need to administer their own music at their fingertips
   with DDEX standards met along the way through the guided path we create for them."

## The model: work vs recording

The composition (work) and its recordings (versions/iterations) are different things —
writers attach to the WORK; vocalists/performers attach to a VERSION. This is the
industry's composition/master split (ISWC vs ISRC) and what makes the DDEX guided path
possible. A work accumulates iterations over time: new demos, new reference vocals, new
contributors joining (a writer adds a verse in month 2 → splits change).

## LOCKED DECISIONS

### CAT-Q1 — What creates a version: **the diary** (option B)
Any meaningful event lands on ONE timeline per work, automatically: new audio upload
auto-creates a version; a contributor joining or a split change auto-logs itself; sheet
events (drafted/executed/amended) log too. Notes are optional annotation ("Ben wrote
verse 2"). Auto-capture, optional annotation — never depends on discipline. Trade
accepted: noisy timelines you can collapse beat history you can't recover. The diary
doubles as an **authorship evidence trail** (see Q3).

### CAT-Q2 — When the split sheet must execute: **commercial commitment** (option B)
Sheet lifecycle (owner-specified): **living editable draft** through the unreleased
stage → **executed** at the moment of truth → **addendum** for post-execution changes
(e.g., a remix adds a featured artist: addendum to the original sheet, never a rewrite —
append, don't reopen). The moments of truth: (1) graduation to a release project,
(2) entering The Crate, (3) any placement/deal. Discovery is free — sharing playlists /
A&R listening requires nothing, because nothing is being sold; if a listen becomes a
deal, the deal is the door. One-sentence rule: **"Drafts are fine until money or release
is on the table."** Wire to existing enforcement points (Crate rights-ready gate,
release readiness checklist).

### CAT-Q3 — AI contributions: **DDEX-native + authorship hygiene** (option B, extended)
AI contributions are structured, ZERO-SPLIT entries using DDEX's own vocabulary —
component type (vocal / instrument / lyric / melody / full-composition) — attached at
the right level: **version-level** if AI performed something (washes out naturally when
a human re-records), **work-level** if AI wrote something (persists through graduation,
because it should). Composition-level AI triggers an honest warning: AI-generated
melody/lyric elements can't be owned or registered; splits cover the human-authored
portion; fully-AI compositions can't register at all. At graduation, entries auto-fill
DDEX v5.0 disclosure fields (IsAIGenerated, AIComponentType, AITrainingDisclosure).

**NORTH STAR (owner, 2026-08-30, verbatim intent):** "our artists able to cite SUNO or
any other AI tool where necessary, but own the full song as much as possible."
Translation into doctrine: **disclosure is not forfeiture** — citing a tool used as
performer/production assistant costs zero ownership; the hygiene layer exists to keep
artists on that side of the line by construction (maximize the human-authored share),
so citation is a badge, not a confession. The hard edge stays honest: what the tool
WROTE, nobody can own — no workflow launders it.

**The authorship-hygiene layer (owner: "built in"):**
- **Human-first capture nudge**: prompt a human scratch vocal/MIDI/memo BEFORE the first
  AI vocal entry — the diary timestamp is the ownership evidence.
- **Swap vs generate distinction**: "voice conversion of a human take" (timbre only,
  authorship untouched) is a different entry type from "AI-generated performance" (the
  risk case). Same button in some tools; totally different rights posture.
- **Re-author prompt**: when an AI-invented idea sticks, prompt keep-as-is vs re-author
  (human transforms it — intervals, rhythm, extension). Re-performing verbatim does NOT
  re-author; transformation does (degree = counsel territory, noted below).
Differentiator: everyone else treats AI disclosure as an upload-time confession; this
GUIDES retention of ownership while the song is being made.

### The when-in-doubt rule (owner-ratified default citation)

The maximal-ownership citation is **"AI reference vocal — performed a human-written
melody, demo only."** If the AI element never reaches the released master, the release
needs no disclosure at all; the citation lives in the work's history as provenance.

But the label must be TRUE — citing invention as performance is a false record, not
protection. The when-in-doubt rule the UI asks:

> "Can you point to the human version that existed before the AI touched it?"
> - YES (scratch vocal / memo / MIDI in the diary) → cite "AI reference vocal — demo
>   only." Ownership fully preserved; the diary proves it.
> - NO → do not reach for the label. RE-AUTHOR the part first; then the citation
>   becomes true. Doubt is resolved by work, not wording.

The diary is the arbiter — Q1's auto-capture means the timeline either shows the
human-first version or it doesn't; memory is never the evidence.

### Worked example — the Suno hum workflow (canonical safe case, owner-raised)

Human hums the melody + types all lyrics into Suno; Suno renders a sung demo of THEIR
material. Ownership map: lyrics fully human; every hummed section fully human (the hum
IS the evidence — it answers the when-in-doubt question with a recording of the
artist's own voice); Suno's vocal = performance, demo-only, no ownership impact.

The two edges to surface in UI:
1. **Suno composes whatever the hum didn't cover.** Verse melodies for typed-but-unhummed
   lyrics, chords, the whole arrangement — AI-authored even though the words are human.
   Rule: you own every section you hummed; hum it all, or re-author the sections Suno
   invented before release singers copy them.
2. **Embellishment drift.** Small interpretive phrasing = performance; a meaningfully
   changed melodic line the artist KEEPS is AI-born — the re-author prompt fires here.

Workflow commandment: **the hum lands in the diary BEFORE Suno** — a hum living only in
Suno's interface is evidence the artist doesn't hold. Endgame done right: human
re-record from the human melody/lyrics + fresh human arrangement → released master needs
NO AI disclosure; the Suno demo stays in history cited "AI reference vocal +
AI-generated arrangement — demo only"; artist owns the entire song.

## Research grounding (2026-08-30, current)

- **PROs** (ASCAP/BMI/SOCAN, aligned Oct 2025): partially-AI works registrable when a
  human contributes essential creative elements; fully-AI works not registrable.
  https://www.ascap.com/press/2025/10/10-28-ai-registration-policies
- **USCO**: human authorship required; AI-only elements uncopyrightable by anyone;
  "sufficient human expression" is case-by-case.
- **DDEX v5.0** AI disclosure: IsAIGenerated / AIComponentType / AITrainingDisclosure,
  declared at release + track + composition levels. Spotify AI Credits (Apr 2026,
  DistroKid first), Apple Transparency Tags (Mar 2026) ride it.
  https://undetectr.com/blog/ddex-ai-disclosure-standard-explained
- **Key ownership mechanics**: performance ≠ authorship — re-singing an AI-invented
  melody does not launder it; AI performing a human-written melody leaves ownership
  fully intact (the released master then needs no AI disclosure at all).

## Open items for discuss/plan

- Counsel note: "how transformed is transformed enough" for re-authoring AI ideas.
- Whether phase splits into a pair (work/version model + sheet lifecycle first; pitch
  life + playlists + volume UI second) — precedent: Phase 31 → 31.1/31.2.
- Data model: works vs current vault_projects/tracks (likely versions table under a
  work; graduation creates the release project linked to the work).
- Version storage costs (many audio files per work) — bucket policy.
- Playlist sharing tokens: reuse the Selects share model.
