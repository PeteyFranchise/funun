# Features Research

**Domain:** Post-release music marketing tools for independent artists
**Researched:** 2026-06-30
**Confidence:** MEDIUM (multi-source web research, cross-checked across industry guides and platform comparisons)

---

## Launchpad Checklist

### Table Stakes

Every post-release checklist tool in this space (DistroKid's post-release guidance, Groover's release planner, Artistrack) covers these actions. Artists expect them. Missing any makes the feature feel incomplete.

| Item | Why Expected | Complexity to Build | Notes |
|------|--------------|---------------------|-------|
| Pitch to playlist curators | Top post-release action artists take; entire tool category exists around it | Low (links to Pitch room) | Core link between Launchpad and PITCH pillar |
| Claim Spotify for Artists editorial pitch | Artists must do this pre-release; Launchpad should confirm it was done | Low (external link + checkbox) | Editorial pitch window closes at release; checklist prompts artist to confirm done |
| Upload Spotify Canvas (looping visual) | Increases save rates, high artist awareness of this feature | Low (external link to Spotify for Artists) | Canvas must be uploaded post-release; 3-8 sec looping video |
| Upload Spotify Clips | Post-release only (can't upload before song is live) | Low (external link) | Short vertical video linked to track on Spotify for Artists |
| Pin release to Spotify artist page | Zero effort, high visibility impact | Low (external link + checkbox) | Artists forget this; reminder earns goodwill |
| Post on social media (release day) | Universal expectation | Low (links to Social Campaign) | Bridge to SOCIAL pillar |
| Send email newsletter to mailing list | Expected for any artist with a list | Low (external link + checkbox) | If no list, tip should explain how to start one |
| File copyright registration | 3-month window from release date; statutory damages depend on it | Low (links to existing Rights Coach) | Wave 2 Rights Coach already covers this; Launchpad links out |
| Confirm PRO registration (ASCAP/BMI etc.) | Expected; Wave 2 already guides this | Low (links to existing Rights Coach) | Same — bridge to Wave 2 work |
| Confirm SoundExchange registration | Expected; Wave 2 already guides this | Low (links to existing Rights Coach) | Same — bridge to Wave 2 work |
| Add release to artist-curated playlists | Artists often forget to add own tracks to their Spotify listener playlists | Low (external link + tip) | Easy win; curated playlists drive early stream counts |

### Differentiators

These distinguish Funūn's Launchpad from a generic checklist blog post.

| Item | Value Proposition | Complexity | Notes |
|------|-------------------|------------|-------|
| Per-item contextual tips (DB-backed, AI-drafted) | Current, specific guidance instead of evergreen copy | Medium (tip model + admin approval flow) | Wave 3 LAUNCH-03 requirement; monthly AI draft → admin approval cycle |
| Tips personalized by genre | Hip-hop release tips differ from ambient tips; e.g. TikTok vs YouTube Shorts priority changes by genre | Medium (genre-aware tip variants) | Requires artist genre from `artist_profiles`; can start with tags on tips |
| Items link to in-Funūn tools, not just external links | Artist stays in Funūn; reduces friction | Low (routing to Pitch room, Social Planner) | This is the core architecture decision already made |
| Completion tracking persisted per project | Artist can leave and return without losing progress | Low (DB: `launchpad_items` completion table) | Critical for multi-session use; no tracking = no stickiness |
| Checklist aware of release state (live vs scheduled) | Some items only unlock after release is live | Low (conditional rendering by `release_date`) | E.g. Spotify Canvas upload is post-release only; gate by date |
| Milestone moments ("You've completed 5 of 12 actions") | Motivational framing drives completion | Low (UI progress bar) | Mirrors the existing vault readiness score UX pattern |
| Item status from connected tools (auto-checked when pitch sent) | Pitch sent → "Pitch curators" item auto-checks | Medium (event hooks between pillars) | Requires event/state sharing across Launchpad, Pitch, Social modules |
| "Why this matters" expandable rationale per item | Converts skeptics who don't know why Canvas matters | Low (expandable tip content) | Subset of the tip system |

### Anti-features (what to avoid)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Putting all tools in a flat list without sequencing | Artists don't know what order to do things | Sequence items by week (Release Week, Week 2, Week 3-4) |
| Requiring completion of every item to "finish" | Some items don't apply (no YouTube channel, no email list) | Mark items optional vs recommended; allow skip with reason |
| Gating progression on paid third-party accounts | SubmitHub requires credits; artist shouldn't feel blocked | Show items as available regardless; external tools are suggestions |
| Weekly tip content that goes stale and is never updated | Tips from 2023 about Spotify algorithm are actively harmful | The DB-backed + monthly AI review + admin approval cycle solves this |
| Launchpad as a junk drawer of every possible action | Artists feel overwhelmed and do nothing | Curated 10-14 items max per release; quality over completeness |
| Duplicating rights guidance already in Wave 2 | Creates drift and contradictions | Bridge to Rights Coach with deep-links, not re-implementation |
| Tracking checklist state in localStorage | State lost on device switch | Persist per-project completion in Supabase (`launchpad_completions` table) |

### Suggested Checklist Items (post-release)

Ordered by recommended sequence. 12 items total — lean enough to feel achievable.

**Release Week (Days 1-7)**

1. Pin release to your Spotify artist profile — links to Spotify for Artists
2. Pitch your track to the Spotify editorial team — tip explains they only accept pre-release; if done, confirm; if not, explain the window is closed and what to do next time
3. Upload Spotify Canvas (looping visual) — post-release only; links to Spotify for Artists upload
4. Announce on social media — bridges to Social Campaign Planner
5. Send to your email list — external link; tip on starting a list if none exists
6. Add to your own curated Spotify playlists — links to Spotify for Artists

**Week 2 (Days 8-14)**

7. Pitch playlist curators — bridges to Playlist Pitching room (PITCH pillar)
8. Upload Spotify Clips (short vertical video) — post-release only; links to Spotify for Artists
9. Pitch music blogs and press — external action; tip includes email template anatomy

**Weeks 3-4**

10. Confirm copyright registration filed — bridges to Rights Coach (Wave 2)
11. Confirm PRO registration up to date — bridges to Rights Coach (Wave 2)
12. Confirm SoundExchange registration — bridges to Rights Coach (Wave 2)

**Tip system architecture:** Each item has a `tip_id` FK to a `launchpad_tips` table. Tips have `genre_tags` (nullable), `platform_tags` (nullable), `body_md` (markdown), `drafted_at`, `approved_at`, `approved_by`. Monthly cron drafts new tips via Anthropic SDK; admin approves before publish.

---

## Playlist Curator Pitching

### Table Stakes

Features artists expect based on SubmitHub/Groover/PlaylistPush patterns. Absence makes the tool feel underpowered.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Searchable curator directory with genre filter | Core navigation; SubmitHub and Groover both offer this | Medium (curator table + filter UI) | Genre tags on curators; multi-select filter |
| Platform filter (Spotify, Apple Music, YouTube, etc.) | Different artists target different platforms | Low (tag filter) | Add to curator profile; multi-select |
| Curator profile card showing genre focus + playlist examples | Artists need to assess fit before pitching | Low (card UI with curator data) | Includes playlist name, follower range, platform, response rate |
| Response rate visible per curator | Primary signal of whether a curator is active | Low (computed from pitch history) | Curators with 0% response rate over 90 days should be flagged |
| Pitch email to one or more curators in a single flow | Core action; batch-select + send is table stakes | Medium (multi-select + Resend API) | Track player link auto-included in all pitch emails |
| Pitch history per project (curator, sent date, status) | Artists need to know who they've pitched and when | Low (pitches table with FK to project) | Status: sent, responded (positive), responded (pass), bounced |
| No duplicate pitch protection | Embarrassing to pitch same curator twice from same project | Low (query before send) | Alert: "You pitched [Curator] on [date] — pitch again?" |
| Bounce detection (hard bounce marks email invalid) | Keeps directory clean; reduces deliverability harm | Medium (Resend webhook + status update) | Resend exposes bounce event; set `email_valid = false` on hard bounce |
| Follow-up reminder (10-day nudge if no response) | Best practice; artists forget | Low (cron + notification) | Optional opt-in per pitch; don't spam |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Curator claimed profiles | Curators can update their own genre focus, playlist links, contact prefs | High (auth flow for curator claim via email link in pitch emails) | Wave 3 PITCH-05; growth loop — curators onboard to Funūn via claim link in pitch email |
| Genre drift alerts | Alert when a curator's playlist focus shifts from their listed genre | Medium (periodic genre check; admin or AI-powered) | PITCH-06; avoids wasting pitches on curators who changed direction |
| Track player link as pitch email centrepiece | Curators experience Funūn directly; growth loop for industry onboarding | Low (auto-include `/r/[projectId]` in all pitch emails) | This is already the plan; the link is the product's growth mechanic |
| Admin view for directory management | Funūn team can add curators, review claims, flag bad actors | Medium (admin CRUD UI) | PITCH-07; internal only; needed from day one to seed the directory |
| AI-suggested pitch personalization | "Here's what's unique about this curator's playlist — use it in your pitch" | High (AI reads curator profile + suggests opening line) | Nice to have for V2; too complex for V1 without claimed profiles to train on |
| Response rate surfaced as a trust signal | Similar to SubmitHub's visible acceptance rate; helps artists prioritize | Low (compute from history) | More meaningful than follower count |
| Pitch timing nudge ("Pitch 2-4 weeks before release") | Research shows 21-40 days out = 4.5x better acceptance than last-minute | Low (compare pitch date to release date; show warning) | Simple date math; high artist value |

### Curator Pitch Email Anatomy

Structure based on research across TuneCore, SubmitHub guidance, Eb the Celeb (Medium), MusicPulse, and CyberPR.

**Subject line** (under 50 characters)
- Format: `[Genre] [release type] from [Artist Name]`
- Example: `Indie-pop single from Maeve Solis`
- Avoid: clever wordplay, ALL CAPS, "check out my music", emoji in subject
- Include: genre signal, track type (single/EP/album), artist name

**Body — Paragraph 1 (personalization, 2-3 sentences)**
- Specific compliment about the playlist (name a track already on it, explain sonic/thematic fit)
- One sentence with track title, release date, and genre
- One sentence on why this fits their curation style
- Red flag to avoid: generic "I love your playlist" without specifics

**Body — Paragraph 2 (social proof, 1-2 sentences)**
- One relevant achievement: prior placements, blog features, streaming milestone (if any)
- One unique element: what makes this track sonically or thematically distinct
- Do not: list entire biography, share all your stats, explain your backstory

**CTA (1 sentence)**
- Soft ask: "Would love for you to give it a listen — happy to send anything else you need."
- Include: player link prominently (the Funūn `/r/[projectId]` link serves this role)
- Do not: demand an answer, set a deadline, attach audio files

**Funūn pitch email template (generated)**
```
Subject: [Genre] [single/EP/album] from [Artist Name]

Hi [Curator Name],

[Specific playlist compliment + why this track fits, 2 sentences]. [Track name] — a [genre] [single/EP] releasing [date] — [one sentence on sonic/thematic fit with their existing curation].

[One social proof line if applicable: prior placement, press, or milestone]. [One distinctive element of the track].

Would love for you to give it a listen: [player link]

[Artist Name]
[Genre] · [City, if relevant]
```

**What the Funūn system adds automatically:**
- Player link: `https://funun.studio/r/[projectId]`
- Curator claim link: small footer line — "Are you this curator? Claim your profile on Funūn."
- Pitch tracking: Resend message ID stored for bounce detection

**Target length:** Under 150 words for body. Curators skim; walls of text are deleted.

### Response Rate Benchmarks

| Context | Rate | Source |
|---------|------|--------|
| Cold email (no platform) | 5-10% | Multi-source research consensus |
| SubmitHub premium submissions | 20-25% average | SubmitHub 2025 data |
| SubmitHub range (varies by genre/quality) | 5-40% | Platform reported |
| PlaylistPush | ~32% playlist adds | Platform reported |
| Pitch sent 21-40 days before release | 18% acceptance | Research data |
| Pitch sent 1-3 days before release | 4% acceptance | Research data |
| Curators' inbox per week | 200-1,000 submissions | Industry estimates |
| Curator rejection rate overall | 95%+ | Industry consensus |

**Implication for Funūn:** Display response rate per curator. Show pitch timing warning when artist pitches <14 days from release. Build expectation-setting copy into the Pitch room ("most curators receive hundreds of submissions per week — personalize every pitch").

---

## Social Campaign Planner

### Table Stakes

AI calendar tools (Later, Buffer, Hootsuite AI, SocialBee) and music-specific campaign planners (Orphiq, Tunepact) establish these as baseline expectations.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Platform selector (which platforms am I on) | Personalize calendar to what the artist actually uses | Low (multi-select checkboxes; stored per project) | SOCIAL-01 |
| AI generates draft posts for each calendar slot | Core value; without this it's just a blank calendar | Medium (Anthropic SDK prompt + release data) | SOCIAL-03; use release title, genre, collaborators, story |
| Calendar view by week and platform | Standard display format | Medium (week/platform grid UI) | SOCIAL-04 |
| Content type tag per post | Artists need to know what to actually produce (video, graphic, text, story) | Low (enum: short-form-video, static-image, stories, text, lyric-graphic) | Part of SOCIAL-04 |
| Draft caption/hook per slot | Pre-filled with AI copy; artist edits | Medium (AI-generated; part of SOCIAL-03 prompt) | DropReady for captions, SoundBait for hooks — already built |
| Check off posts as they go live | Track actual execution vs plan | Low (completion checkbox; DB-persisted) | SOCIAL-06 |
| CSV export for Later/Buffer | Table stakes for artists already using scheduling tools | Medium (CSV generation with correct columns) | SOCIAL-07; V1 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Platform nudges by genre ("for your genre, TikTok drives 3x more new listeners than Facebook") | Artists don't know where to focus; genre-specific guidance is rare | Medium (genre → platform weight lookup table) | SOCIAL-02; start with 5-6 genre buckets; maintain as editorial data |
| DropReady and SoundBait as inline calendar actions | Artist can regenerate a caption or hook for any slot without leaving the calendar | Low (modal with prefilled context from slot data) | SOCIAL-05; this is the key integration between tools and calendar |
| Calendar grounded in release data (title, story, collaborators) | AI posts feel like they're about the actual release, not a generic music post | Low (pass release metadata to AI prompt) | Already available in Supabase; collab names from Wave 2 `collaborators` table |
| 4-6 week range (configurable) | Short enough to feel achievable; long enough to cover the full algorithmic window | Low (slider or radio: 4 weeks / 6 weeks) | 4-week minimum covers Discover Weekly window; 6-week covers long tail |
| Regenerate individual slots | Artist wants to keep some AI posts, rewrite others | Low (per-slot "regenerate" button) | Important for AI UX; all-or-nothing regeneration is frustrating |
| Post type variety enforced by AI | Prevents calendar of 20 identical text posts; AI must balance types per platform | Low (prompt instruction) | Include in system prompt: "vary post types: video, image, lyric graphic, story, text" |
| Spotify algorithmic window awareness | Copy in Week 1-2 posts explicitly references the importance of saves and shares for Discover Weekly | Low (baked into AI prompt + tip copy) | 1-4 week post-release window = golden period for algorithm; artist-facing language keeps this accessible |
| Standalone quick-tool access to DropReady/SoundBait | Artists sometimes want a quick caption without running a full campaign | Low (separate tool entry point in Launchpad tools view) | SOCIAL-05; dual entry points: calendar slot + standalone |

### Platform Content Map

What to create per platform and how often, based on music marketing research.

| Platform | Best Content Types | Posting Cadence | Audience Signal | Notes |
|----------|-------------------|-----------------|-----------------|-------|
| TikTok | Short-form video (15-60s), snippet + trend, challenge, POV performance, behind-the-scenes, lyric text overlay | 3-5x/week minimum | Highest organic discovery ceiling; Gen Z/millennial; passive browse | Post multiple snippets as separate videos testing different song sections; trends drive discovery |
| Instagram (Reels) | Polished short-form video performance clip, aesthetic visual, snippet with caption hook | 3-5 Reels/week + daily Stories | Followers convert to streams/tickets at higher rate than TikTok | Stories for daily touch; Reels for growth; save Story highlights for evergreen content |
| Instagram (Stories) | Countdown sticker, polls, Q&A, link stickers, fan reaction screenshots, swipe-to-stream | Daily during campaign weeks | High engagement from existing audience; not discovery | Use countdown sticker starting 7 days before release if scheduling; fan reactions in Week 2 |
| YouTube Shorts | Cross-post best TikTok/Reels content (minimal extra effort) | 2-3x/week (repurpose) | Contributes to YouTube music discovery algorithm; cross-platform reinforcement | Also a gateway to long-form YouTube content; long-form builds catalog revenue for years |
| X (Twitter/X) | Real-time commentary, text announcement, behind-the-scenes thread, industry networking | 3-5x/week | Conversational; less music discovery; good for press interaction and tastemaker reach | Short text works; threads for storytelling; not primary discovery channel |
| Threads | Text-first, conversational updates, story posts, community building | 2-3x/week | Growing platform; text-first culture; good for parasocial connection | Similar to X but warmer tone; less industry, more fan community |
| Facebook | Release announcement, event creation, community group posts | 2-3x/week | 25-45 demographic; lower organic reach without paid | Less priority for artists targeting Gen Z; still relevant for older audiences and local shows |

**Priority recommendation for AI nudges (by genre bucket):**
- Pop / R&B / Hip-hop: TikTok first, Instagram second, YouTube Shorts third
- Indie / Alternative / Folk: Instagram first, TikTok second, YouTube Shorts third
- Electronic / Dance: TikTok first, YouTube Shorts second, Instagram third
- Jazz / Classical / Ambient: YouTube (long-form) first, Instagram second, Threads third
- Latin / Reggaeton: TikTok first, Instagram second, Facebook third (wider demographic reach)

### Suggested 4-Week Calendar Structure

The AI generates posts for each slot. Week-by-week rationale and post types follow.

**Week 1 — Release Week (7 posts across selected platforms)**

| Day | Platform(s) | Content Type | Purpose | AI Post Hook |
|-----|------------|--------------|---------|-------------|
| Day 1 (release day) | All selected | Static image + text | Announce release; drive streams | "It's here. [Title] is out now — link in bio." |
| Day 1 | TikTok + Reels | Short-form video | Song snippet, hooky section | 15-30s clip of the most-played section |
| Day 2 | Instagram Stories | Story | Thank-you to listeners; early reaction | Screenshot of first stream count or fan message |
| Day 3 | TikTok | Short-form video | Different snippet; test another section | Different 15s section than Day 1 |
| Day 4 | All selected | Text + lyric graphic | Song meaning / story behind the track | "This song started as…" personal story |
| Day 5 | Instagram Reels | Short-form video | Behind-the-scenes from recording | Studio clip or production moment |
| Day 7 | All selected | Text CTA | Add to playlists / share ask | "If you've been vibing with [Title] — add it to your playlist" |

**Week 2 — Sustain (6 posts)**

| Day | Platform(s) | Content Type | Purpose | AI Post Hook |
|-----|------------|--------------|---------|-------------|
| Day 8 | TikTok | Short-form video | Behind-the-scenes / alternate take | Raw session footage or acoustic version clip |
| Day 10 | All selected | Lyric graphic | Highlight a memorable lyric | Pull strongest lyric from the release |
| Day 11 | Instagram Stories | Story | Interactive — poll or Q&A about song | "Which version do you prefer: [A] or [B]?" |
| Day 12 | YouTube Shorts | Short-form video | Cross-post Day 3 or Day 5 TikTok | Repurpose existing asset, minimal effort |
| Day 13 | X / Threads | Text thread | Songwriting story or producer credit story | "Here's how I wrote [title line]:" thread |
| Day 14 | TikTok + Reels | Short-form video | Trend participation using the track | Find trending format; overlay your sound |

**Week 3 — Deepen (5 posts)**

| Day | Platform(s) | Content Type | Purpose | AI Post Hook |
|-----|------------|--------------|---------|-------------|
| Day 16 | All selected | Milestone post (if applicable) | Celebrate streams/saves/playlist add | "We hit [milestone] — thank you" |
| Day 18 | TikTok | Short-form video | Duet/collab invitation or reaction video | Invite fans to duet with your track |
| Day 19 | Instagram Reels | Short-form video | DropReady inline action — generate caption | Performance clip with SoundBait-generated hook as caption |
| Day 21 | YouTube Shorts | Short-form video | Behind-the-scenes of making-of (longer) | 58s making-of edit repurposed from any session footage |
| Day 21 | X / Threads | Text | Industry shoutout — thank collaborators | Tag producer, co-writers, mixing engineer |

**Week 4 — Long Tail (4 posts)**

| Day | Platform(s) | Content Type | Purpose | AI Post Hook |
|-----|------------|--------------|---------|-------------|
| Day 23 | TikTok | Short-form video | Throwback to early version or demo clip | "This is what [title] sounded like before the studio" |
| Day 25 | All selected | Lyric graphic | Second lyric pull — different from Week 2 | Choose contrasting lyric to the first one |
| Day 26 | Instagram Stories | Story | What's next tease | "Working on something new…" low-key tease |
| Day 28 | All selected | Final organic push | Keep link alive | "If you haven't heard [title] yet — still listening to this one" casual repost feel |

**Weeks 5-6 (if 6-week calendar selected):**

Transition to artist catalog content. Reduce release-specific posts to 1-2/week. Use DropReady and SoundBait to generate variations on the original track's themes with fresh angles. Add an acoustic or remix version slot if applicable. These weeks cover the long tail — research shows 75% of a release's first-year streams happen after month one.

**Buffer/Later CSV column format for export (V1):**

| Column | Type | Notes |
|--------|------|-------|
| `Date` | YYYY-MM-DD | Computed from release_date + day offset |
| `Time` | HH:mm | Default to platform best-practice times (TikTok: 7pm, Instagram: 9am or 6pm) |
| `Text` | string | AI-generated caption or hook; artist edits inline |
| `Image URL` | string (optional) | Left blank; artist fills in their asset URL |
| `Social Profile` | string | Platform identifier matching the artist's connected account |

Buffer accepts: Date, Time, Text, Image URL. Later adds: Caption, Media URL, Platform. Export two flavors or a superset CSV that both tools accept.

---

## Sources

- [Music Release Checklist 2026: Before, During, After | Chartlex](https://www.chartlex.com/blog/streaming/music-release-checklist-complete-2026) — MEDIUM confidence (web)
- [The Ultimate Single Release Checklist for Independent Artist in 2026](https://d4musicmarketing.com/single-release-checklist-independent-artists/) — MEDIUM confidence (web)
- [Advice To Independent Artists On How To Pitch To Playlist Curators | Eb the Celeb / Medium](https://medium.com/@EbtheCeleb/advice-to-independent-artists-on-how-to-pitch-to-playlist-curators-6fd9b794362e) — MEDIUM confidence (web)
- [How To Pitch Playlist Curators Without Being Ignored | MusicPulse](https://www.musicpulse.app/blog/how-to-pitch-your-music-to-playlist-curators-without-getting-ignored) — MEDIUM confidence (web)
- [How to Pitch Your Music to Blogs and Spotify Playlist Curators | TuneCore](https://www.tunecore.com/guides/pitching-your-music-101) — MEDIUM confidence (web)
- [SubmitHub vs Groover: Which Music Promotion Platform Should Artists Try? | Uranium Waves](https://www.uraniumwaves.com/soundscope/submithub-vs-groover-music-promotion-platform) — MEDIUM confidence (web)
- [SubmitHub vs Groover vs PlaylistPush 2026 | MusicPulse](https://www.musicpulse.app/blog/submithub-groover-playlistpush-which-service-should-you-choose-in-2026) — MEDIUM confidence (web)
- [Social Media Strategy for Musicians: What Works in 2026 | Chartlex](https://www.chartlex.com/blog/marketing/social-media-strategy-musicians-what-works) — MEDIUM confidence (web)
- [Social Media Content Calendar for Musicians | Orphiq](https://orphiq.com/resources/social-media-content-calendar-musicians) — MEDIUM confidence (web)
- [How Independent Musicians Can Build a Social Media Content Calendar | Tunepact](https://tunepact.com/blog/music-social-content-calendar) — MEDIUM confidence (web)
- [The Real Math on Playlist Pitching Services | Bad Royalties](https://badroyalties.com/blog/playlist-pitching-services) — MEDIUM confidence (web)
- [Best Practices for Spotify Playlist Submission | Cyber PR Music](https://cyberprmusic.com/best-practices-for-spotify-playlist-submission-2/) — MEDIUM confidence (web)
- [Preparing for Release Day and Beyond | Spotify for Artists](https://artists.spotify.com/en/blog/release-guide-preparing-for-release-day) — MEDIUM confidence (web)
- [How to upload posts in bulk to Buffer | Buffer Help Center](https://support.buffer.com/article/926-how-to-upload-posts-in-bulk-to-buffer) — MEDIUM confidence (web)
- [Spotify Playlist Pitching 2026: 14-Day Rule | Chartlex](https://www.chartlex.com/blog/streaming/how-to-pitch-to-spotify-playlists-2026-step-by-step-guide) — MEDIUM confidence (web)
- [Releasing Music in 2026: 6 Promotion Strategies That Work | LANDR Blog](https://blog.landr.com/releasing-music-2022/) — MEDIUM confidence (web)
