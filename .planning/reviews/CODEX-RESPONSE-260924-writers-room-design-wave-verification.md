# Writer's Room Design-Wave Verification

## VERIFIED CLAIMS

`page.tsx` queries `ideas.promoted_work_id` but never renders it — FALSE — `app/(artist)/vault/works/[workId]/page.tsx:398-408,868-879` — the query is combined into `originIdeas`, then rendered as “Started as an idea” with titles and a “View origin” link.

`CANDIDATE_MIME_TYPES` contains only lossy codecs — PARTLY — `lib/catalogue/hum-capture.ts:27-40` — Opus and explicit AAC are lossy and no lossless candidate exists, but bare `audio/mp4` is a container MIME that does not itself specify a codec.

`clipTimelineWindow()` returns exactly `{timelineStartMs, sourceOffsetMs, playableDurationMs}` and accepts `timingOffsetMs` — PARTLY — `lib/catalogue/record-over-beat.ts:18-30` — it accepts the offset and returns those fields, but also returns `timelineEndMs`; “exactly” is wrong.

`HumCaptureButton.tsx` calls `getUserMedia({ audio: true })` with no processing constraints — TRUE — `components/catalogue/HumCaptureButton.tsx:118-124` — the microphone request supplies only `audio: true`.

`encodeWav()` writes 16-bit PCM with `bytesPerSample = 2` — TRUE — `lib/catalogue/record-over-beat.ts:88-120` — the header declares 16 bits and samples are written with `setInt16`.

`level-match.ts` exports `rmsFromChannels()` and `levelMatchedVolumes()` — TRUE — `lib/catalogue/level-match.ts:3-26` — both named exports exist; the latter attenuates the louder source without modifying files.

`lib/storage/index.ts` accepts WAV/FLAC and sets `MAX_AUDIO_SIZE` to 250 MB — TRUE — `lib/storage/index.ts:3-10,20-24` — the legacy `release-audio` helper has those values, although it is not the Writer’s Room upload path.

`take-transport.ts` defines 2-second pre-roll, `[0.5,0.75,1,1.5]`, and an active-player registry — TRUE — `lib/catalogue/take-transport.ts:72-82,99-123` — all three are present and 2× is deliberately omitted.

`VersionSource` is exactly `hum | upload | recording`, with numerals derived and never stored — TRUE — `lib/catalogue/versions.ts:7-15,35-76`; `supabase/migrations/162_writer_room_record_over_beat.sql:7-10` — TypeScript and the database agree, and numbering comes from `created_at`/`id`.

`deriveBlockNumerals()` counts linked repeats — TRUE — `lib/catalogue/blocks.ts:99-124` — it counts every non-custom row by `block_type` without excluding `repeat_of_block_id`.

`work_versions` lacks `is_favorite`; collaborators have it; ideas have `IdeaRating` — TRUE — `supabase/migrations/135_works_core.sql:159-171`; `supabase/migrations/026_collaborator_identity_reconciliation.sql:41-45`; `lib/ideas/schema.ts:8-25` — only the latter two models carry those concepts.

Lyric blocks have no duration or bar-length field — TRUE — `supabase/migrations/135_works_core.sql:208-224`; `lib/catalogue/blocks.ts:46-55` — the stored and TypeScript shapes contain position/text/authorship/repeat data but no duration.

Song Passport `bpm` is recording-version and `delivery_safe` — TRUE — `lib/song-passport/schema.ts:144-158` — BPM and musical key are recording-version fields; BPM is delivery-safe.

The deals catalogue filters on `bpmMin`/`bpmMax` — TRUE — `lib/deals/catalog.ts:251-324,327-360` — inclusive BPM predicates are applied to released `tracks`, not directly to Passport rows.

AI tagging constrains vocabulary as an injection defense, while idea moods are capped free text — TRUE — `lib/tagging/ai-tag.ts:1-9,75-119`; `lib/ideas/schema.ts:3-6,66-78` — AI values are allowlisted; idea moods allow up to 12 case-deduped strings of 40 characters.

`writer-room-layout.ts` models a personal full/half-width canvas and the shipped room is not tab-based — TRUE — `lib/catalogue/writer-room-layout.ts:3-25,80-95`; `components/catalogue/WorkPage.test.tsx:385-393` — lyric/module layout is personal presentation and the shipped test explicitly rejects a Diary/Versions tab control.

`@dnd-kit/sortable` is already installed — TRUE — `package.json:20-24` — version `^10.0.0` is a production dependency.

`take-spans.ts` defines range comments, not arrangement regions — TRUE — `lib/catalogue/take-spans.ts:1-4` — its header explicitly calls spans creative-context range comments that do not move between takes.

## MISSED OVERLAPS

Audio content hashing — already implemented at `lib/metadata/delivery-safe.ts:72-89`, `app/api/works/[workId]/passport/artifacts/route.ts:72-79,195-212`, and `supabase/migrations/155_song_passport_artifacts_custody.sql:7-25` — selected master bytes and generated artifacts receive SHA-256 values stored in an append-only Passport artifact ledger; this happens during export, not at every take upload.

Metadata-delivery hashing — already implemented at `app/api/vault/[projectId]/tracks/[trackId]/metadata/sidecar/route.ts:143-172` and `supabase/migrations/142_metadata_delivery_exports.sql:1-27` — source audio and derived sidecars/tagged copies are independently hashed with immutable manifests and receipts.

Expiring/revocable share links — already implemented at `app/api/ideas/[ideaId]/share-links/route.ts:8-46` and `supabase/migrations/169_ideas_inbox.sql:48-60,312-352` — Ideas mint hashed 1–30-day tokens, support revocation, enforce expiry, and allow only one authenticated claimant; this is an invitation/membership flow, not anonymous take playback.

Audio-header inspection — partially implemented at `lib/watermark/stream-preview.ts:104-152` — a private RIFF/WAVE parser extracts sample rate, bit depth and channels, but it only supports watermark rendering and is not used to validate uploads.

Section ordering — already implemented at `app/api/works/[workId]/blocks/reorder/route.ts:6-16,55-91` and `supabase/migrations/138_work_diary_events.sql:453-590` — the shipped route uses a transactional, complete-set reorder RPC with concurrency validation and one Diary event.

Working BPM/key precedent — already implemented at `supabase/migrations/168_producer_handoff_workspace.sql:1-26` and `app/api/works/[workId]/recording-sessions/[sessionId]/handoffs/complete/route.ts:117-176` — producer handoffs already store bounded BPM and normalized musical key, although this is handoff context rather than song-level truth or detection.

No implementation found — `lib/catalogue/take-export-audition.ts:59-64,97-120` — there is no LUFS/dBTP analyzer, tempo/key detector, or take-favourite implementation; the cited Audition file only renders Adobe Audition marker CSV.

## PLAN CHALLENGES

Phase 44 — lyric blocks cannot safely become all arrangement sections — `supabase/migrations/135_works_core.sql:175-224` and `app/api/works/[workId]/blocks/route.ts:159-190` — empty intro/outro blocks are technically possible, but every newly created block is attributed to the caller and `author_user_id` is explicitly a fact that moves splits; using an empty lyric row for an instrumental break would create authorship evidence for structure rather than lyrics. Replace the model with one canonical `work_sections` order, with optional lyric content/authorship attached only to lyrical sections; put bar length and arrangement facts on the section, not on `lyric_blocks`.

Phase 44 — linked repeats and personal-layout reconciliation are insufficient — `lib/catalogue/blocks.ts:139-180`; `lib/catalogue/writer-room-layout.ts:3-8,90-138`; `supabase/migrations/176_writer_room_personal_layouts.sql:1-20,50-54` — repeat resolution currently inherits only text and author, while room layout is private per-user presentation that deliberately cannot alter evidence. Arrangement needs shared, authoritative persistence, FK-backed section/take references, concurrency handling and explicit “inherit unless overridden” rules; do not reuse `reconcileWriterRoomLayout()` as the arrangement reconciler.

Phase 44 — reordering changes meaning under the proposed model — `supabase/migrations/138_work_diary_events.sql:475-483` — the current RPC permits a null actor because it treats position as presentation that moves no authorship or money. If reordering sections changes rendered audio, position becomes a creative/provenance fact; record the authenticated actor and an immutable arrangement revision.

Phase 44 — derived assembly credits require a new relation — `supabase/migrations/135_works_core.sql:134-170`; `types/catalogue.ts:72-87`; `lib/song-passport/schema.ts:109,144-158` — current credits are mutable JSON on each version, and Passport performer/producer/engineer facts may also come from manual or contract sources. Add immutable assembly-to-source edges and credit lineage, such as `work_assemblies`, `work_assembly_sections`, `work_assembly_layers(source_version_id, role, gain, timing)`, and `work_version_credit_sources`; materialize output performers server-side from those edges rather than accepting them from a client.

Phase 44 — credits can currently be asserted without proof of the claimed performance — `app/api/works/[workId]/versions/complete/route.ts:80-123` and `app/api/works/[workId]/blocks/[blockId]/route.ts:25-33,251-267` — every uploaded version automatically receives the work’s primary performer regardless of what is audible, while lyric-block singer lists are manually declared plans. The assembly feature therefore cannot treat `performers` JSON alone as evidence that a contributing take contains that person.

Phase 42 — removing `ComposerCard` currently removes live workflow entry points — `components/catalogue/WorkPage.tsx:796-849,1567-1593`; `components/catalogue/WorkPage.test.tsx:160-177,385-393`; `.planning/phases/37-the-catalogue-unreleased-works-as-living-assets-versions-rig/37-10-PLAN.md:17-34` — populated works currently obtain Hum, Write lyrics, Add audio and Note callbacks through the card, and tests enforce composer-first ordering; the shipped room has no replacement tabs. Build and test every destination action first, update the ratified Phase 37 contract, then remove the populated-state card as the last step.

Phase 43 — song defaults do not conflict with version-level DDEX facts if inheritance is explicit and snapshotted — `lib/song-passport/schema.ts:5-23,100-109,144-158`; `supabase/migrations/151_song_passport_foundation.sql:45-71,114-143` — use `work_musical_defaults(work_id PK, bpm NUMERIC(6,3), meter_numerator SMALLINT, meter_denominator SMALLINT, musical_key TEXT, downbeat_offset_ms INTEGER, updated_by, updated_at, revision)` plus `work_version_musical_overrides(work_version_id PK, nullable override columns, confirmed_by, confirmed_at)`, where NULL means inherit. Resolve effective room values with `COALESCE`, but freeze BPM/key into the version-targeted Passport value when confirmed/designated so later song-default edits cannot rewrite an older master’s delivery facts; metre needs a new Passport field only after its delivery mapping is decided.

Phase 43 — the buyer-filter statement skips a required mapping — `lib/deals/catalog.ts:327-360`; `supabase/migrations/001_initial_schema.sql:125-126` — buyers filter `tracks.bpm` and `tracks.key_signature`, not Song Passport rows. Graduation/delivery must explicitly copy confirmed version BPM/key into the selected release track, with conflict handling rather than silent overwrite.

Gate 0 — the token count is approximately right but the literal count is not — `tailwind.config.ts:12-24`; `app/globals.css:8-25` — the current `app/`, `components/`, and `lib/` source has 1,753 exact uses of the five named utilities, not 1,751; it has 40 matching lavender `rgba(...)` occurrences across 16 files. Two are canonical variables in `app/globals.css`, leaving 38 hand-fixes across 15 files: `components/vault/PlaybackView.tsx:249,385`; `components/vault/PublicPlaybackView.tsx:254`; `components/vault/VaultProjectCard.tsx:116`; `components/buyer/fnbl-theme.ts:22`; `components/antenna/OpportunityCard.tsx:36`; `components/admin/HealthRulesForm.tsx:137,301,305,338,350`; `components/admin/console-theme.ts:25`; `components/playbook/Rail2.tsx:174-391`; `components/profile/ProfileView.tsx:101`; `components/coach/RightsCoach.tsx:98`; `components/playbook/AccessEditorMatrix.tsx:113`; `components/selects-player/theme.ts:22,76,81,163`; `components/benchmarks/BenchmarkView.tsx:201`; `app/(artist)/earnings/page.tsx:158`; `app/(artist)/vault/[projectId]/readiness/page.tsx:199,216`.

Phase 45 — the plan cites the wrong upload path — `lib/catalogue/audio-mime.ts:9-21`; `lib/catalogue/version-upload-client.ts:55-71,95-125`; `components/vault/StemsUpload.tsx:85-133` — Writer’s Room takes are capped at 50 MB and use signed one-shot uploads; the 250 MB resumable TUS implementation is used by stems, while `lib/storage/index.ts` targets a separate legacy `release-audio` bucket. A five-minute 24-bit/48 kHz stereo keeper exceeds the Writer’s Room limit, so the lossless path needs its own cap, resumable uploader and completion verification.

Pro-audio note — the claimed loudness groundwork is misidentified — `lib/catalogue/take-export-audition.ts:59-64,97-120` — this module formats marker files and performs no audio analysis. LUFS, true-peak, clipping, DC-offset and silence analysis are net-new work, not a continuation of this file.

## RISKS

HIGH — instrumental arrangement sections could fabricate authorship/split evidence — `supabase/migrations/135_works_core.sql:200-220` and `app/api/works/[workId]/blocks/route.ts:176-190` — structural sections must not receive a writer merely because someone inserted them.

HIGH — an assembly could launder AI audio into the human-take rule — `app/api/works/[workId]/ai-entries/route.ts:104-157` and `supabase/migrations/135_works_core.sql:258-267` — current validation accepts any same-work version with no direct AI entry; an assembly containing an AI source could therefore qualify unless the route excludes `source='assembly'` or recursively verifies immutable source ancestry.

HIGH — adding `assembly` in only one layer will break or misclassify uploads — `lib/catalogue/versions.ts:15,90-94`; `types/catalogue.ts:70-82`; `app/api/works/[workId]/versions/upload-intent/route.ts:11-13,49-50`; `app/api/works/[workId]/versions/complete/route.ts:16-18`; `supabase/migrations/162_writer_room_record_over_beat.sql:7-10` — the database check, two TypeScript unions, route allowlists and presentation map are all exhaustive.

HIGH — derived credits can become unsupported delivery facts — `app/api/works/[workId]/versions/complete/route.ts:90-123`; `lib/song-passport/schema.ts:145-158` — assembly credits must retain source-version lineage and confirmation state rather than copying mutable names into a flat JSON array.

HIGH — take links expose unreleased material if a bearer URL maps directly to Storage — `app/api/ideas/[ideaId]/share-links/route.ts:8-46`; `supabase/migrations/169_ideas_inbox.sql:312-339` — scope every link to one version and permission, store only a token hash, enforce expiry/revocation on every request, issue a short-lived signed playback URL only after validation, separate streaming from download, and keep an audit trail.

HIGH — “never alter stored bytes” needs an original-versus-derived distinction — `lib/catalogue/record-over-beat.ts:88-120,123-137`; `components/catalogue/RecordOverBeatStudio.tsx:637-679`; `supabase/migrations/162_writer_room_record_over_beat.sql:1-5,124-127` — rendering resamples/quantizes audio but correctly saves a new rough version while retaining raw clips; Phase 44 must preserve that pattern, hash every source/output, and never overwrite an input object.

MEDIUM — reusing the legacy release helper would overwrite evidence — `lib/storage/index.ts:27-38` — it writes a stable path with `upsert: true` and returns a public URL; studio capture must stay on unique private version paths with `upsert: false`.

MEDIUM — mutable song defaults could silently rewrite delivery truth — `supabase/migrations/151_song_passport_foundation.sql:45-71,195-209` — confirmed version facts and snapshots must remain historical even after a writer changes the room’s BPM, metre or key.

MEDIUM — browser constraints do not prove keeper quality — `.planning/todos/pending/2026-09-24-studio-quality-vocal-capture.md:61-78` — device constraints may be ignored, AudioWorklet capture and 24-bit encoding are new code, and the resulting file needs recorded actual settings plus a content hash before it can be represented as delivery-grade.

MEDIUM — open hashtag trending could disclose private-room subject matter — `.planning/todos/pending/2026-09-24-hashtag-filing-and-recognition.md:59-65` — aggregation must be restricted to public or explicit opt-in surfaces and must not derive trends from private Writer’s Rooms.

## VERDICT

This wave is not safe to plan against unchanged. The origin-line premise, Phase 44’s section/reconciliation model, assembly credit and human-source lineage, Phase 43’s delivery mapping, Phase 45’s upload assumptions, loudness scope, and Gate 0 literal inventory must be corrected first.

The source reviewed is identical to `main`; at review time the checkout had moved externally to `writers-room-design-wave-2026-09-24`, whose only delta from `main` is the six requested planning documents.
