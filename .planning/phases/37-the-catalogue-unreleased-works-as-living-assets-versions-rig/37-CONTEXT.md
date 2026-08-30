# Phase 37: My Catalogue — Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

**37.1 "The Songwriter" — the production-testable writing room, shipped soon (owner
priority).** An artist at funun.studio can: start a song (two-door create flow), hum it
in (real mic capture), upload audio (with the full AI-entry flow), write structured
lyrics (the full pad design), invite collaborators (shared diary, contribute/administer),
and watch the diary record everything — mounted in its real home: the Sound Vault's new
two-shelf structure.

**Deferred to 37.2+:** the destinations doors (sketch 004), Crate submission, DDEX
export, artist playlists, the volume/catalogue list view at scale, graduation to a
release, and the labels system (unless trivially cheap — Claude discretion).

**CANONICAL SOURCES — the planner and researcher MUST read these; this file does not
duplicate them:**
- `.planning/deliberations/the-catalogue-unreleased-works.md` — the doctrine: locked
  decisions CAT-Q1 (diary), CAT-Q1a (equal splits, people-not-numbers nudges, cadence),
  CAT-Q2 (execution at the doors), CAT-Q3 (DDEX-native AI entries + authorship hygiene),
  the Crate vocal rule + BGV clause, worked examples, producer FAQ, ten scope items,
  IA + naming decisions.
- `.claude/skills/sketch-findings-funun/` — SIX decided sketches with every UI rule
  (layouts, badges, repeats, renumbering, insert-anywhere, default performer +
  Instrumental state, rename rule, export copy) and winning-variant HTML sources.

</domain>

<decisions>
## Implementation Decisions

### Slice decisions (owner, 2026-08-30 discussion)

- **S-01 — Audio: hum capture AND file uploads in 37.1.** Owner chose the fuller slice
  over hum-only. Consequence: sketch 002's AI-entry flow ships in 37.1 — both modes
  (conversational for the account's first-ever AI entry, two-door form after), the
  receipt block, component tagging, and the hum-first nudge (003's deliberate minute)
  plus the inline re-author prompt.
- **S-02 — Collaborators in 37.1.** The shared diary ships day one: membership via the
  existing collaborator invite/claim/connect machinery, contribute vs administer tiers
  (money/release doors stay with the owner), attribution on every entry, ✍/🎤 badges,
  and the once-per-contributor splits nudge (equal-split default, people never numbers,
  settable cadence).
- **S-03 — Real home immediately.** The Sound Vault becomes two shelves: My Catalogue
  (new) + Releases (the existing project list, untouched). The new-project flow becomes
  the two doors: 🎵 Start a song · 🚀 Start a release. The `unreleased` type retires
  from the create flow; the (at most one) existing prod project is unaffected unless
  typed `unreleased`, in which case it surfaces on the catalogue shelf.
- **S-04 — "Copy full lyric" ships in 37.1** (it is part of the decided pad design and
  client-side cheap): tagged and plain flavors, tool-agnostic copy ("ready to paste
  into any tool or document").

### Claude's Discretion

- The works/versions/blocks/diary data model (the researcher's main assignment) —
  including whether works are new tables or extend `vault_projects`. New tables are the
  expected answer; the doctrine's work/recording split and block identity rules
  constrain the shape.
- Hum capture implementation (MediaRecorder; browser/iOS quirks; reuse of
  `lib/storage` buckets + signed-URL patterns; format/size limits).
- Whether the labels system squeezes into 37.1 or waits.
- Mobile behavior follows the decided rules (001: single-stream + Versions toggle) but
  polish depth in 37.1 is discretionary.

### Non-negotiables carried from the doctrine (do not re-decide)

- Diary auto-capture with attribution; identity-fixed/presentation-derived everywhere
  (titles, block numerals, handles).
- Splits: living draft → executes at the doors; EQUAL default; system never proposes
  percentages; nudge cadence once-per-contributor, settable.
- AI entries: zero-split, DDEX component vocabulary, version-level vs work-level,
  receipts in plain words, no tool names in UI copy.
- Vocal doctrine: primary-performer inheritance, Instrumental third state, the
  human-take registry (a default never fabricates a record).

</decisions>

<canonical_refs>
## Canonical References

- `.planning/deliberations/the-catalogue-unreleased-works.md` — doctrine (see above).
- `.claude/skills/sketch-findings-funun/SKILL.md` + `references/catalogue-hygiene-ui.md`
  + `sources/` — every UI decision with winning HTML.
- `docs/architecture/ACCOUNT-TYPES.md` — User Accounts only; structural exclusions.
- `lib/storage/index.ts` — the audio bucket/signed-URL machinery to reuse.
- Existing collaborator machinery: `lib/collaborators/invite.ts`, quick-invite route,
  claim flow — S-02 reuses, never rebuilds.
- Migration doctrine exemplars: 128–134 (zero-policy RLS + REVOKE, text-lock tests,
  human-gated push, `NOTIFY pgrst` last).

</canonical_refs>

<code_context>
## Existing Code Insights

- Audio upload machinery exists (`lib/storage`) — hum capture is a new *source* feeding
  existing storage patterns. MediaRecorder appears nowhere in the codebase yet.
- The artist layout already loads the profile row (Phase 36 gate) — the catalogue
  shelf's header identity rides existing queries.
- `readLyrics`/`TrackLyrics` exist in the release pipeline (`lib/metadata/schema.ts`) —
  the pad's block model meets them at graduation (37.2), not in 37.1.
- Only ~4 user accounts and ≤1 vault project exist in prod — migration burden is nil;
  design for the future, migrate almost nothing.

</code_context>

<specifics>
## Specific Ideas

- The composer (005-C) is the page's spine: verbs first, ONE guiding line, diary below.
- Empty state IS the pitch: "Start with a hum — thirty seconds of melody makes it real,
  and provably yours."
- Owner's testing intent: he and Thomas (and Eric, once signed up) write real songs in
  production as the UAT — same organic-beta pattern as Phase 31.

</specifics>

<deferred>
## Deferred Ideas

- 37.2+: destinations doors + Crate submission + DDEX export + playlists + volume view
  + graduation + (probably) labels — all designed, all waiting.
- Sketch 007: the collaborator's vantage (shared-with-me list, sheet-nudge moment).
- The "still unsure? ask" community-FAQ feed path (living FAQ → help → Playbook).

</deferred>

---

*Phase: 37 — My Catalogue · Context gathered 2026-08-30*
