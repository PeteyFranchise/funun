# Midjourney briefs — the composer testimonial avatars

**Captured:** 2026-09-27 · **Status:** placeholders live in the bench; art is an owner task
**Surface:** marketing page section 05, `#voices` (`private/bench/marketing.html`)
**Owner:** *"There are pictures of these composers floating around online with Gen Z haircuts… I
want to decide if we use those instead to further the joke here, and it would make for funny
marketing memes."*

## Why we generate rather than reuse

The composer *paintings* are public domain and already in the bench — Stieler's Beethoven (1820),
Haussmann's Bach (1748), Krafft's Mozart (1819), all confirmed PD on Wikimedia Commons, all
downloaded to `private/bench/img/composer-*.jpg`.

**The viral modernised versions are a different thing.** Hidreley Diao's AI photo-realisations and
similar work involve prompting, selection, retouching and compositing — human creative choices that
attach copyright to those elements. "An AI made it, so nobody owns it" is an open question, not a
settled one, and it is not a question worth answering on a live commercial homepage.

The deciding argument is not legal, it is positional. **Funūn sells rights hygiene.** Lifting an
identifiable artist's signature work because we reckon it is probably unowned is precisely the
behaviour the product exists to talk artists out of. No legal opinion repairs that.

Generating our own costs a Midjourney session and gets us more: a consistent set, sized for both
the 44px avatar and social, in our own style, with a provenance story we would be happy to tell.

## What these are for

Two sizes, same source render:

- **Avatar** — square, tight head-and-shoulders. Renders at **44px**, so anything finer than the
  hairline reads as mud. The bench already has per-portrait framing knobs (`op` for
  object-position, `z` for zoom) if a render needs nudging rather than re-cropping.
- **Meme / social** — the full render, 4:5 or 1:1, where the joke actually lands.

## The rule that makes the joke work

**The face must stay unmistakably the painting.** The gag is recognition — Beethoven's scowl,
Bach's jowls, Mozart's soft chin — wearing something that does not belong to 1780. If the face
drifts, it stops being Beethoven and becomes a stranger in a hoodie, and there is no joke.

So: **reference the actual portrait**, keep the likeness, the lighting and the oil-painting
surface. Change the hair and the clothes and nothing else. Painterly, not photoreal — a photoreal
composer is a different joke (that's Hidreley Diao's joke, and it's his).

House palette for anything behind them: near-black ground (`#0a0a0c`), indigo `#818cf8` → fuchsia
`#d946ef`. Keep the background plain; these sit in a 44px circle.

## The briefs

Use the downloaded portrait as an image reference in every case.

### 1 · Beethoven — *the one who's over it*

Stieler's scowl is already the most modern thing about him — he looks like a man being asked to
join a group chat. Keep the glare exactly. Replace the wild romantic mane with a **high-fade with
volume on top**, sharp line-up. Swap the red cravat for a plain black crew-neck under the coat, or
lose the coat for a simple chain. He should look like he'd say *"this is hella fire"* flatly,
without smiling.

### 2 · Bach — *the one who books the session*

Haussmann's Bach is stern and a little smug, holding his canon like a receipt. Lose the powdered
wig entirely — that's the whole gag — and give him **short twists or a cropped textured fro**,
neat. Keep the heavy coat and the white stock collar; the contrast between period clothes and
modern hair is funnier than modernising both. He may keep the sheet of music.

### 3 · Mozart — *the one who's already onto the next thing*

Krafft's Mozart is the youngest and the most pleased with himself. Keep the red coat and gold
braid — it already reads as a fit. Replace the powdered curls with a **middle-part curtain cut**,
the single most Gen Z haircut there is. Slight smirk retained. He should look like someone who
says *"lowkey goes hard fr fr"* and means it.

## Acceptance

- At 44px, is each one still recognisably that composer? Test in the actual avatar, not at full
  size — this is where most renders fail.
- Does the face match the painting closely enough that a viewer gets the joke without the caption?
- Is the hair the only thing doing the modernising, or has it drifted into cosplay?

## Not blocked on

Nothing. The PD paintings are in place and rendering correctly, so the section works today. This is
an upgrade, and the memes are the larger prize.

## Related

- `2026-09-26-differentiator-carousel-art.md` — same owner-art pattern, same house palette
- The section's own placeholder flag on the page also records two copy items still open: the
  subhead *"From people who've written in the room"* is a factual claim these people used the
  product, and the heading still says *"Hear it"* with no audio.
