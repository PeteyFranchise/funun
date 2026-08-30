# My Catalogue — hygiene UI (Phase 37, decided 2026-08-30)

## The four decided moments

**Work page (001 → C desktop / A mobile).** Desktop: two-column — versions list sticky
left, diary ledger right, header spans (score ring, title, contributor chips, splits
status, ONE gradient CTA). Mobile: single-stream diary (A) as default with a
Diary|Versions segmented toggle reaching the version-cards view (B). The diary is
reverse-chron; entry types: version (vN chip), sheet event (§ amber), roster event, AI
entry (blue). Every entry: bold what + date right-aligned + one dim consequence line.

**AI-entry moment (002 → B first time, A after).** The account's FIRST-EVER AI entry
runs conversational pacing (one question per bubble, plain words, "Not sure" routes to
the hum-evidence check). Every later entry uses the two-door form: "It performed
something we wrote" (green ✓ safe path) vs "It created something new" (amber → guided),
then component chips (Vocal/Instrument/Lyrics/Melody/Whole track). DDEX vocabulary
appears ONLY in the receipt block (cold-blue left border) which always states: the
citation line, splits effect, release effect, Crate consequence. A keeps a "walk me
through it again" link reopening B's pacing.

**Nudges (003 → the split).** Hum-first = full-screen deliberate minute, ONCE per song,
before its first AI entry: gradient record button center, owner copy leads — "Save and
protect your idea by just humming or singing right now" — depth behind a read-more
(reuse components/ui/LearnWhy.tsx), skip present but honest ("Continue without — I
understand the risk"). Re-author = inline on the diary entry (recurs, low ceremony):
"owned by no one" chip, Re-author (primary) / Keep as-is, disclosed (secondary), plus
the note-for-note-doesn't-count line.

**Destinations (004 → C hybrid).** Lights always in the work header: Crate / Release /
Registration / Distribution — chips with ✓/✕/—. Click a light → its door expands inside
the header card (max-height transition) with reason + fix buttons. A CLOSED door
arrives PRE-OPENED (bad news explains itself; good news waits for a click). ⓘ beside
The Crate opens a plain-words explainer — Funūn vocabulary is never a mystery inside
someone's diary. DESTINATION-NEUTRAL: the Crate is offered, never assumed; Distribution
door = DDEX-readiness + "Export DDEX metadata" + "Copy disclosure answers" (maps 1:1 to
DistroKid's per-component AI Credits step).

**The composer (005 → C).** Every song page leads with the composer card: "Add to this
song —" + four verb tiles (🎙 Hum it / ✎ Write lyrics / ⬆ Add audio / 💬 Note) + the
reassurance line ("Whatever you add, the song remembers — who, what, when. That's your
proof, kept automatically."). Directly beneath: ONE guiding line — 💡 "Next for this
song: …" with a Do-it button and a dismiss ✕ — gradient-tinted border, rotates through
the song's single most important next step, never stacks, absent when nothing is
needed. The diary follows, clean (nudges live in the line, not on entries). Empty state
= "Start with a hum" hero with Hum-your-idea primary + Start-with-lyrics secondary.
AI questions (002) and hum-first (003) fire INSIDE the add flows, never as separate
chores. Creation is the interface; evidence is the exhaust.

**The lyrics pad (006 → A).** Structure blocks: section cards with uppercase indigo
labels, grip-reorder, one author avatar per block; add-section chip row (Verse,
Pre-Chorus, Chorus, Bridge, Intro, Outro, Hook, Custom…); autosave line in header +
"Add the melody — hum it" button; diary events are section-level ("Ben added Verse 2");
paste auto-splits on blank lines; DEFAULT-PERFORMER RULE (owner-raised): every work has a PRIMARY PERFORMER (defaults to
its creator, editable in the header: "🎤 primary performer: @x — sections inherit unless
tagged"). Blank blocks inherit it — the solo artist is never nagged; per-block 🎤 is for
exceptions only. Two guardrails keep inheritance honest: (1) a default fills the PLAN,
never the RECORD — a credit becomes fact only when a version carries that performance;
the human-take registry requires an actual take, never an inherited badge; (2) an AI
vocal can never hide under the default — the add-audio flow asks regardless, and
declared facts always beat inheritance.

PERFORMER RULE (owner-raised): each block carries TWO badge clusters — ✍ writer
(automatic: whoever typed; moves splits) and 🎤 performer (declared: tap "＋🎤 who sings
this?" and pick a member or name a guest; moves credits, never splits). Multiple 🎤
avatars stack for duets. Authoritative per-recording performance credits live on the
VERSION (feeds DDEX contributor roles and the human-take registry behind the vocal
rule); the pad's 🎤 shows the current plan and seeds each new version's credits.

INSERT-ANYWHERE RULE: the gap between any two blocks reveals a ＋ divider on hover
(tap on mobile) opening a mini chip row that inserts exactly at that position — with
"Chorus ↺ repeat" offered first once a chorus exists. Fallbacks: end-of-song chip row,
then drag into place.

REPEAT RULE (owner-raised): a repeated section (chorus x2 etc.) is a LINKED block, not
a duplicate — displays the source lyrics dimmed with an ↺ badge; editing the source
updates every repeat; attribution stays with the original writer automatically. "＋
Chorus ▾" offers Repeat existing / Write a new one once one exists. "Detach to vary" is
copy-on-write for final-chorus lifts/ad-libs — the detach is a diary event and the new
block takes its own authorship from there. Exports expand repeats in full text.

RENUMBERING RULE (owner-confirmed): section numerals are DERIVED from position among
same-type siblings, never stored — drag a verse above another and the numbers swap
instantly. Authorship binds to BLOCK IDENTITY (and its lines), never the numeral, so
reordering cannot smudge evidence; the diary logs the reorder as its own event and old
entries reference blocks, staying truthful across reshuffles. Custom-named sections
never renumber. "Copy full lyric" exports tagged ([Verse]/[Chorus],
Suno-native) or plain.

## Copy doctrine (use verbatim where possible)
- "Hum every melody you want to own, and the song is entirely yours."
- "Save and protect your idea by just humming or singing right now."
- "Citation is a badge, not a confession." / "owned by no one" for AI-born material.
- Closed Crate door: reason in one line + fix as buttons; the song "stays welcome
  everywhere else."

## What was tried and rejected
- 001-B (versions-cards-only default on desktop) — hides the story; survives only as
  the mobile toggle view.
- 002 single-mode (either doors-only or chat-only) — first-timers need pacing, veterans
  need speed; the split serves both.
- 004-A alone (lights with one-line why) — not enough room for fixes; 004-B alone (full
  panel) — costs a section permanently. Hybrid keeps both virtues.
- Hard "no AI anywhere" Crate rule — unenforceable for DAW-level instrumentation;
  vocals-only is the policed line (for now).

## Theme tokens (match tailwind.config.ts — never invent)
ink #0a0a0f · card #0E0D1E · card2 #1A1838 · lav #C7CBF7 · lavdim #7c80b4 ·
hair rgba(199,203,247,.12) · grad 105deg #818CF8→#D946EF (ONE per screen, on the
primary action) · good #34D399 · warn #FBBF24 · risk #F87171 · ai/cold #60A5FA ·
money #F59E0B · Inter, radius 12 cards / 9 buttons / 999 chips.

## Origin
Sketches 001–006, .planning/sketches/ · doctrine:
.planning/deliberations/the-catalogue-unreleased-works.md · winning sources in
sources/.
