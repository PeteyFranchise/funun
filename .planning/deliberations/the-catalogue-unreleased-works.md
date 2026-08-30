# My Catalogue — Unreleased works as first-class assets

**NAMING (owner, 2026-08-30):** the artist-facing surface is **"My Catalogue"** — the
writer/artist's perspective, matching the possessive voice of the artist side (Your
Sound Vault, Your Profile) and making the doctrine literal: this is YOURS, evidenced.
"The Catalogue" survives only as internal/phase shorthand.

**PRIORITY (owner, 2026-08-30, end of session): "I want to be able to test this
songwriter tool soon in production."** Phase 37 jumps the queue ahead of 34/35, and
planning must bias toward a thin vertical slice — 37.1 "The Songwriter": Start a song →
composer (Hum-it-in with real mic capture + the lyrics pad as designed) → the diary.
Everything else (destinations, Crate submission, DDEX export, playlists, collaborator
sharing, volume view) defers to 37.2+. Ship the writing room first; the owner tests it
live.

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

## Owner-added scope (2026-08-30, during sketch review)

**7. "Hum it in" — native voice-memo capture into the diary.** Owner: yes, artists can
hum voicenotes directly into the diary to sketch and memorialize ideas. Why it punches
above its weight: (a) EVIDENCE-GRADE — an in-app capture is platform-timestamped at the
moment of creation, the strongest form the authorship trail can take (an uploaded file
merely claims its date); (b) FRICTIONLESS HABIT — every hygiene nudge (hum-first, the
one-pass BGV fix) ends in a record button that is right there, one tap; (c) HOW WRITERS
WORK — "voice memos, except these count": memorialized, timestamped, already a work;
(d) WHERE SONGS BEGIN — "hum a new idea" CREATES a work with v1 = the hum; the catalogue
starts from thirty seconds of melody and Funūn becomes the first app opened, not the
last. Browser mic capture (MediaRecorder) + existing audio storage machinery.

**8. "Type it in" — the lyrics pad (owner-added 2026-08-30).** Typed, stored, editable
lyrics on the WORK, auto-versioned into the diary with every edit timestamped. The
symmetry that makes it essential: the ownable core of a song is melody + lyrics — the
hum evidences the melody, the lyric pad evidences the words; together they cover the
entire copyrightable song. Export bundle (hum + lyrics) to any AI tool closes worked
example 1's loop: human core captured here first, demos come back as iterations. Meets
the existing release-pipeline lyrics machinery (lib/metadata readLyrics/TrackLyrics) at
graduation.

**9. The shared diary — collaborator access and contribution (owner-confirmed
2026-08-30).** A collaborator added to a work (via the existing invite/claim/connect
machinery) can access the diary and CONTRIBUTE: play versions, add their own iterations
(uploads and Hum-it-in takes), edit the lyrics pad (tracked), annotate. Every entry is
attributed and timestamped — which compounds the evidence value: the diary answers
who-did-what-when, the question that starts split disputes. Two permission tiers:
CONTRIBUTE (any member) vs ADMINISTER (owner or elevated: graduate, Crate submission,
sheet-execution requests, membership changes — the Q2 money/release doors stay with the
owner by default). Kept crisp: being ON THE WORK and being ON THE SPLITS are different
facts — membership grants access, the sheet grants ownership, the diary records both.
Aligns with the Phase 21 shared-projects access model; this is its works-level
expression.

**10. Destination-neutral doors (owner, 2026-08-30).** The catalogue serves artists and
teams whose endpoint is NOT The Crate — keeping DDEX metadata handy for their distributor
(DistroKid/TuneCore/etc.) or direct DSP delivery. So "Distribution — DDEX-ready" is a
FIRST-CLASS door beside Crate/Release/Registration: readout = delivery-metadata
completeness (identifiers, credits, AI-disclosure fields), nudges for gaps, and an
EXPORT that hands over the answers (DDEX metadata bundle + copy-ready disclosure
answers for distributor upload flows). Copy principle across the phase: **The Crate is
offered, never assumed** — same guidance energy for the artist who never submits to it.

**Sketch verdicts so far:** 001 DECIDED → desktop C (two-column); mobile A single-stream
diary as default with a Diary|Versions toggle reaching B's cards.
002 DECIDED → conversational (B) for the account's FIRST-EVER AI entry, then the
two-door form (A) forever after; A keeps a "walk me through it again" link that reopens
B's pacing; DDEX vocabulary only ever in the receipt.
006 DECIDED → A: the lyrics pad is STRUCTURE BLOCKS — draggable section cards
(Verse/Pre-Chorus/Chorus/Bridge/Intro/Outro/Hook/Custom chips), ONE AUTHOR BADGE PER
BLOCK (attribution as a property of the text: section-level diary events, splits nudge
knows who to add, disputes answered by the block itself), paste-a-full-lyric auto-splits
on blank lines, hum button in the header (melody one tap from words). EXPORT: "Copy full
lyric" in two flavors — TAGGED with [Verse]/[Chorus] section brackets (Suno's native
input format — the blocks serialize 1:1) and PLAIN; pairs with the exported hum as
worked-example-1's complete kit, evidence already banked.
005 DECIDED → C: the composer room (one bar, four verbs — Hum it / Write lyrics / Add
audio / Note — AI questions and evidence folding inline into the add flow) with ONE
guiding line between composer and diary: the song's single next-best step, rotating
(splits nudge → hum-to-claim → DDEX gap → Crate-qualifies), dismissible, never a stack,
absent when nothing is needed. Creation leads; the song gets one sentence. Empty state:
"Start with a hum."
004 DECIDED → C, the hybrid: lights always visible, any light opens its door, closed
doors arrive pre-opened; four destination-neutral doors (Crate/Release/Registration/
Distribution); an ⓘ beside The Crate opens a plain-words explainer ("Funūn's sync
licensing catalogue… rights-ready… one stop… you get paid") — Funūn vocabulary must
never be a mystery inside someone's diary.
003 DECIDED → SPLIT: the deliberate full-screen minute (B) for hum-first, once per song;
inline (A) for the recurring re-author prompt. Copy friendlier with a read-more
expandable (reuse components/ui/LearnWhy.tsx — action visible, why folds). Owner's lead
line verbatim: "Save and protect your idea by just humming or singing right now."
Framing owner added: the voicenote is a PORTABLE ASSET — access it anytime, export it to
Suno or any AI tool, knowing the idea is yours; Funūn is the first stop before the tool. 004 → redrawn to the vocal-line Crate rule; pending
final call.

## Information architecture + naming (owner-decided 2026-08-30)

**WHERE IT LIVES: inside the Sound Vault, as the first shelf.** One roof, two shelves:
My Catalogue (works — hums, drafts, versions, the diary) and Releases (singles, EPs,
albums in flight). Rationale: the vault is already the promise ("Start building your
Sound Vault"); one home avoids "where's my song?"; graduation becomes a doorway inside
one room, not emigration between nav items; the rail stays tight; and it leaves the
works-first long-term architecture open without committing to the migration. The vault
may land on whichever shelf was used last, so catalogue-heavy producers effectively get
the catalogue as home.

**THE CREATE FLOW: two doors replace the five types.** "What are you starting?" →
🎵 Start a song (→ My Catalogue) · 🚀 Start a release (Single/Snippet/EP/Album). The
"Unreleased" PROJECT TYPE retires from the create flow — the junk-drawer checkbox that
started this entire design is replaced by the thing it was always trying to be.
(Existing type='unreleased' projects migrate into the catalogue shelf.)

**NAMING: "Song" as the face, "work" as the backbone.** The button says Start a song;
split sheets, registration, and doctrine copy keep "work" where precision matters —
same warm-front/correct-backbone pattern as My Catalogue itself.

**LABELS: the artist's own vocabulary.** Free, artist-applied labels on works AND
versions, over time as they see fit — suggested set: demo, beat, track, idea,
instrumental, concept — plus custom. The words debated for the type name become tags
instead of taxonomy. Labels power the volume view's filters (scope 6) alongside
mood/BPM/rights-status.

## LOCKED DECISIONS

### CAT-Q1 — What creates a version: **the diary** (option B)
Any meaningful event lands on ONE timeline per work, automatically: new audio upload
auto-creates a version; a contributor joining or a split change auto-logs itself; sheet
events (drafted/executed/amended) log too. Notes are optional annotation ("Ben wrote
verse 2"). Auto-capture, optional annotation — never depends on discipline. Trade
accepted: noisy timelines you can collapse beat history you can't recover. The diary
doubles as an **authorship evidence trail** (see Q3).

### CAT-Q1a — SPLITS DEFAULT (owner, 2026-08-30, locked)
**Splits default to EQUAL shares — 50/50 for two writers, even N-way for more — unless
the writers decide otherwise.** Adding a writer to a work redrafts the living sheet to
equal shares automatically. **The system NEVER proposes contribution-based percentages**
— no "Ben wrote a verse, suggest 60/40". Nudges name PEOPLE ("Ben isn't on the sheet
yet — add him?"), never NUMBERS. The diary is evidence the writers MAY consult when
deciding their own split; it is never an input the product converts into percentages.
Deciding that is theirs, not ours.

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

**OWNER CORRECTION (2026-08-30): in this scenario the SONG is fully human-owned, full
stop.** The composition's ownable core is melody + lyrics — both human here. Suno's
chords/demo arrangement/production are NOT a counter-claim: generic progressions and
demo production are ownable by no one (human or AI) and die with the demo; the
human-made release arrangement belongs to the humans who make it. Do not present the
demo's AI dressing as diminishing the artist's ownership.

The ONE narrow edge to surface in UI:
1. **A section whose MELODY was never hummed.** Melody is the ownable core, so if lyrics
   were typed for a verse but its melody was never hummed, Suno invents that melodic
   line — and that one strand is unownable by anyone, forever, no matter who sings it
   later. The artist's hook and lyrics remain fully theirs regardless. One-line rule:
   **"Hum every melody you want to own, and the song is entirely yours."**
2. **Embellishment drift** (minor): interpretive phrasing = performance; a meaningfully
   changed melodic line the artist KEEPS is AI-born — the re-author prompt fires here.

Workflow commandment: **the hum lands in the diary BEFORE Suno** — a hum living only in
Suno's interface is evidence the artist doesn't hold. Endgame done right: human
re-record from the human melody/lyrics + fresh human arrangement → released master needs
NO AI disclosure; the Suno demo stays in history cited "AI reference vocal +
AI-generated arrangement — demo only"; artist owns the entire song.

### Worked example 2 — the genre-flip remix (owner-raised) + THE CRATE RULE

Artist uploads their finished acoustic song; Suno re-renders it as (e.g.) K-pop. The
risk flips layers versus the demo case:

- **The SONG stays 100% the artist's, untouched.** Melody + lyrics are the composition;
  a genre flip changes the clothing, not the authorship. Anyone copying the K-pop track
  still infringes the human composition.
- **The K-pop MASTER is the weak layer.** The audio Suno produced is an AI-generated
  recording — uploading source + prompting is not sufficient human authorship of the
  RECORDING (USCO). Fully-owned song inside a largely unownable master. Releasable, but
  DDEX-disclosed and platform-labeled.
- **Familiar edge rides along:** genre flips often add new toplines/post-chorus hooks.
  A kept Suno-invented hook = unowned melodic strand (same rule as the unhummed verse;
  re-author prompt fires).

**THE CRATE RULE (locked, refined by owner 2026-08-30):** sync is TWO licenses —
composition + master — and the Crate's promise is one-stop rights-ready. The rule has
exactly two disqualifiers and one disclosure tier:

1. **Wholly AI-generated masters: NOT eligible.** Nobody owns the recording, so nobody
   can one-stop license it. (Ownership grounds — unchanged.)
2. **AI VOCALS on the candidate master: NOT eligible — the one hard "no AI," FOR NOW
   (owner, 2026-08-30: "for now, no AI vocals for THE CRATE" — a current stance,
   revisitable as the market and buyer sentiment move, not eternal doctrine).** Owner's
   line: vocals are where voice-likeness risk, buyer sensitivity, and reputation live,
   and it is a line Funūn can actually police. Fix shown in UI: swap to a human vocal /
   submit a human-vocal version.
**THE BGV CLAUSE (owner-adopted 2026-08-30) — the vocal rule follows performance, not
register.** One test for every voice on a Crate master, lead or background:

> **"Can you point to the human take it came from?"**
> YES → production. Harmonies, doubles, stacks, and voice-converted layers built FROM
> human takes are eligible + disclosed — and the diary holds the source take, so a
> buyer's AI-vocal scanner flag is answered with a receipt, not an argument.
> NO → an AI voice. Generated voices singing parts no human performed are the hard no —
> "background" does not launder them, and a real human lead on the track does not
> either.

**The one-pass fix (written into the UI, per owner):** when a work has a real singer and
someone adds a generated-vocal entry, the nudge reads: "Your singer's already here —
track rough passes of these parts and the AI can build from them instead. That keeps the
Crate door open." One rough guide take per harmony line — thirty seconds a part, doesn't
need to be pretty — converts generation into production: every voice then traces to a
human performance, the stacks are AI-polished takes of HER parts, and the track is
Crate-eligible with a clean disclosure. Same habit as the hum rule: hum the harmony
parts first.

3. **AI instrumentation / MIDI / beats inside a human-produced master: ELIGIBLE,
   disclosed.** Owner's reasoning verbatim in spirit: "so many tools now help with AI
   generation for instrumentation, MIDI, and beats — that is a hard ask and much harder
   to police since so much of that lives in the DAW of the producer." Disclosure travels
   to the buyer; re-authoring stays RECOMMENDED for ownership of the AI-born bars, never
   required for entry.

This RESOLVES the middle-tier open question from the producer-FAQ thread: the human
master with an AI guitar solo is **eligible + disclosed** (was: flagged/open). Residuals
carried consciously under disclosure: AI-born segments remain unowned, and AI segments
can echo training-data licks (indemnity posture to revisit with counsel at Crate-terms
time).

**The workarounds (surface these in UI, in order):**
1. **Canonical — sketchpad, not record.** The AI genre-flip enters the catalogue as an
   iteration: "AI re-arrangement — exploration demo." Human producers/singers then build
   the real version FROM the artist's song. Both layers fully owned; zero disclosure on
   the release; Crate-clean. Cheap way to hear your song in another world, then make it
   for real.
2. **Hybrid rebuild.** Replace the AI layers with human ones — human vocal takes, human
   instruments, human mix/production — until the released master is a human production
   that merely referenced the AI sketch. Master-level re-authoring; the more replaced,
   the stronger the claim (degree = counsel territory, same as compositional
   re-authoring).
3. **Release the raw AI master anyway** — allowed, disclosed, labeled — but as a wholly
   AI-generated master it is NOT Crate-eligible (rule 1). Important nuance to show the
   artist: **the WORK remains fully Crate-eligible through any human-made master of it**
   — only that recording is excluded, never the song.

### THE DUAL MANDATE — what the hygiene UI is FOR (owner, 2026-08-30, locked)

Workarounds 1 (sketchpad-not-record) and 2 (hybrid rebuild) are not documentation —
they are **guided flows built into the UI**, teaching creators how to navigate AI use
so that:

1. **Artists keep 100% of their songs for humans, even when AI is a sketch tool.**
   The UI's job is that the safe path is the obvious path: hum-first nudges, the
   sketchpad framing on any AI iteration, the re-author prompt when AI ideas stick,
   and the "hum every melody you want to own" rule surfaced where it matters.
2. **Funūn's reputation with clients stays intact.** Everything a buyer licenses from
   The Crate is one-stop clean because the catalogue GUIDED it clean upstream — the
   Crate rule (no AI-generated masters) enforced not as a rejection at the gate but as
   a path artists were walked around long before they arrived.

Design consequence: every AI-related moment in the catalogue UI answers BOTH questions
— "what does this mean for MY ownership?" and "what does this mean for where this song
can go?" (Crate eligibility shown as a live consequence, not a surprise). Plan a
UI-demo/mockup pass (gsd-sketch) for these flows at discuss/plan time.

### The producer FAQ (owner-driven Q&A, 2026-08-30 — use as UI/help copy source)

**LIVING SECTION (owner, 2026-08-30):** FAQs get added as they arise from the community.
Design consequence for the phase: the hygiene UI needs a "still unsure? ask" path that
feeds real artist questions back to the team, and answered ones graduate into this FAQ →
artist-facing help → eventually a Playbook article (Phase 35 adoption model).

**Q: AI adds an 8-bar guitar solo to my otherwise fully-human song. What do I own?**
Everything except those 8 bars — and nobody owns those. Ownership attaches element by
element, not as a percentage. Song registers as partially-AI (allowed since Oct 2025);
the AI portion is disclaimed; splits are untouched (AI takes nothing).

**Q: A session guitarist would be work-for-hire — credited, paid, zero publishing. Why
is AI different?**
Not in the money — in the mechanism. WFH TRANSFERS a copyright the human player CREATED.
AI creates no copyright, so there is nothing to transfer; no payment or ToS can conjure
one (Thaler, affirmed 2025). The difference is a hole in the fence, not the wallet.
Re-authoring closes it: hand the AI solo to a guitarist as a sketch, they make it
theirs, standard WFH applies, fence complete.

**Q: So the writers/producers still collect ALL the money?**
Yes — completely. Royalties flow to the registered owners of the work and master, never
bar-by-bar. Uncopyrightable solo = nobody ELSE can claim money, never that money leaks.
Never claim the AI bars as human-written to "fence" them — false registration risk.
Collect 100% of what's yours; claim nothing that's nobody's.

**Q: Can anyone freely sample the AI solo, like a royalty-free Splice sample?**
Freer than Splice in principle — Splice is owned-but-licensed; the AI notes are owned by
NOBODY. Replaying/interpolating those bars is clearly free. The gray zone: lifting the
EXACT AUDIO from the released track — the notes are free but they sit inside a
human-owned master (mix/production authorship); no court has drawn that line, which
practically deters samplers. And the practical shield: disclosure is component-level
("contains an AI instrument part"), never timestamped — Funūn's records never paint a
target on the exact bars.

**Open question raised by this thread — the Crate middle tier:** a human-produced master
CONTAINING an AI segment (vs. a wholly AI-generated master). Instinct: FLAG, don't ban —
buyer sees the disclosure; UI shows the fix ("re-author the solo → fully eligible").
Extra reason the flag matters: AI segments can echo copyrighted licks from training data,
and one-stop licensing means Funūn vouches for cleanliness (indemnity exposure). Decide
at discuss-phase.

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
- **DistroKid's upload flow — VERIFIED 2026-08-30:** DistroKid has an "AI Credits"
  step at upload asking for AI contributions BY COMPONENT (vocals / lyrics /
  instrumental performance / composition / audio), feeding Spotify's AI Credits via
  DDEX; credits can be added or updated post-upload. This maps 1:1 onto My Catalogue's
  component-level AI entries — the diary IS the answers to the distributor's form.
  https://jackrighteous.com/en-us/blogs/ai-music-distribution-guide/distrokid-upload-form-ai-music-paper-trail
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
