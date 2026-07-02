/**
 * Pitch note copy — AI-drafted, editable, playlist-specific note (D-05).
 *
 * Reuses the buildPitchPlugPrompt shape (lib/tools/pitchplug.ts): a
 * SYSTEM-style preamble with hard style rules, a hard word-count cap, and
 * a final instruction to output raw JSON only. This is the ONLY prompt
 * builder for the pitch composer's note — app/api/pitches/draft/route.ts
 * calls it and app/api/pitches/route.ts re-validates the same word-count
 * rule server-side (T-06-11).
 */

/** Hard cap on the pitch note's word count — locked in the UI-SPEC. */
export const PITCH_NOTE_MAX_WORDS = 150

const PITCH_NOTE_SYSTEM = `You are a music outreach specialist who writes short, human, playlist-specific pitch notes for independent artists reaching out to a single curator about a single track. You write the kind of note that sounds like the artist typed it themselves.

Hard rules:
- Sound like the artist wrote it — direct, warm, a little understated. Never like a publicist or a press release.
- NEVER use these phrases or anything like them: "I hope this email finds you well", "I am reaching out", "I wanted to share", "check out my latest", "blessed", "grind", "fire", "this is a movement", "don't sleep", "game-changer", "next level", "passionate about music".
- No exclamation-mark spam. At most one.
- Be specific and honest. Use only the facts provided. Do NOT invent streaming numbers, press, co-signs, chart positions, or collaborators.
- Reference the curator's playlist by name (if given) and their genre focus — this must read as written FOR this specific curator, not a form letter.
- The note body is a HARD MAXIMUM of 150 words. Shorter is fine.
- Make one clear, low-pressure ask: a listen for the playlist.`

export function buildPitchNotePrompt(args: {
  artistName: string | null
  trackTitle: string
  projectTitle: string
  genre: string | null
  releaseDate: string | null
  curatorGenreFocus: string[]
  playlistName: string | null
}): string {
  const artist = args.artistName || 'the artist'

  const facts = [
    args.genre && `Genre: ${args.genre}`,
    args.releaseDate && `Release date: ${args.releaseDate}`,
  ].filter(Boolean)

  return `${PITCH_NOTE_SYSTEM}

ARTIST
Name: ${artist}
${facts.length ? facts.join('\n') : 'No additional release details provided.'}

TRACK BEING PITCHED
Title: ${args.trackTitle}
Project: ${args.projectTitle}

CURATOR (who this note is for)
Playlist/channel name: ${args.playlistName ?? 'their playlist'}
Genre focus: ${args.curatorGenreFocus.length ? args.curatorGenreFocus.join(', ') : 'not specified'}

Write ONE pitch note (max ${PITCH_NOTE_MAX_WORDS} words) from ${artist} to this curator about "${args.trackTitle}", referencing the curator's playlist name and genre focus so it reads as playlist-specific, not a form letter.

Respond with ONLY a JSON object (no markdown, no preamble) in this exact shape:
{ "note": "…" }`
}
