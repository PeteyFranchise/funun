# Phase 14: Playback Room Refinement - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-06
**Phase:** 14-Playback Room Refinement
**Areas discussed:** Navigation, Stems support scope, Export Pack definition, Master/Stems toggle fix, Visual fidelity gaps

---

## Pre-discussion investigation

Before presenting gray areas, the codebase was checked directly against `sound-vault.html` and `playback.html`: `/vault/[projectId]/play` (the intended playback room) is completely unreachable from the app's UI (no nav link, no tab, no button); project cards currently link to a different, broader management page; the Master/Stems toggle is non-functional (no stems schema/upload anywhere); Export Pack doesn't exist at all.

---

## Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Card click → playback room directly | Bypasses the current management page as the landing view | ✓ |
| Card click → management page (current), with a tab to reach playback | Smaller change, keeps current landing behavior | |

**User's choice:** Card click → playback room directly, with a follow-up: "the release readiness score can have a small 'widget' somewhere on the playback room that is clickable to the release readiness page so that the artist or user can update their readiness score if they need to."
**Notes:** This became D-02 (readiness widget), later refined in the Visual Fidelity area to appear in two places.

---

## Stems support scope

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, build it now | Real upload/schema work this phase | ✓ |
| Not yet — hide/remove the toggle | Defer stems entirely | |

**User's choice:** Yes, build it now.

| Option | Description | Selected |
|--------|-------------|----------|
| Single bundled file (e.g. a ZIP) | Simpler upload/storage | ✓ |
| Multiple individual stem files | Per-instrument, bigger UI/model | |

**User's choice:** Single bundled file for now, "move into multiple if the users suggest it after some real life testing."

**Notes (Claude-raised technical issue):** A ZIP can't be streamed through an `<audio>` element, so the existing Master/Stems toggle framing (a playback-source switch) doesn't work for a ZIP.

| Option | Description | Selected |
|--------|-------------|----------|
| "Stems" becomes a download action, not a playback source | Toggle relabels/splits; Master remains the only real playback source | ✓ |
| Require a playable stems mix file too | Extra upload slot, toggle keeps working as true audio-source switch | |

**User's choice:** Option 1, plus: "we will need a separate 'upload' area in this page for the instrumental should anyone need that and make a note that we could require playable stems in the future after some live testing."

| Option | Description | Selected |
|--------|-------------|----------|
| On the Playback room itself | Upload controls live where the artist now primarily lands | |
| On the existing management page | Keep uploads on the current TrackList-based page | |

**User's choice:** Neither exclusively — "can we have more that one area to upload this and one place it lives after?" Confirmed via follow-up: both the Playback room and the management page get upload controls, writing to the same underlying track record.

| Option | Description | Selected |
|--------|-------------|----------|
| Larger limit, e.g. 250MB | Matches CLAUDE.md's storage guidance | ✓ |
| Same as master/share (50MB) | Simpler, may be too small | |

**User's choice:** 250MB.

**Additional requirement (user-raised, no options presented):** Add instructional copy or an info (ⓘ) button near the stems upload explaining what stems are, why to store them on Funūn (music supervisors/collaborators may request them), how to zip them, and how to label the archive.

---

## Export Pack definition

| Option | Description | Selected |
|--------|-------------|----------|
| Everything available | Master, share MP3, stems ZIP, instrumental, credits sheet, metadata sheet | ✓ |
| Just the audio files | No credits/metadata sheets | |

**User's choice:** Everything available.

| Option | Description | Selected |
|--------|-------------|----------|
| Single ZIP, direct download | Immediate download, no link | |
| Generate a shareable download link | Sendable link, needs its own access model | |

**User's choice:** Both — "give the option to the user."

| Option | Description | Selected |
|--------|-------------|----------|
| Expiring link | Auto-expires (e.g. 7 days) | ✓ |
| No expiry — permanent until revoked | Higher exposure risk | |

**User's choice:** Expiring link.

| Option | Description | Selected |
|--------|-------------|----------|
| PDF | Clean, professional, matches industry-handoff expectations | ✓ |
| Plain text / CSV | Simpler, less polished | |

**User's choice:** PDF.

**User-raised idea:** "If the music supervisor is a Funūn user and has their own user profile, can we create an easy way for them to 'request' and receive the export pack of a song or project on funūn directly?"

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to after Phase 10 ships | Build on real notification infrastructure | ✓ |
| Build a lightweight version now via email | Resend-based, skips in-app notifications | |

**User's choice:** Defer to after Phase 10 ships.

---

## Master/Stems toggle fix

| Option | Description | Selected |
|--------|-------------|----------|
| Master / Instrumental toggle + separate Download stems button | Toggle only switches real playable sources | ✓ |
| Keep a 3-way control: Master / Instrumental / Download stems | One control, mixed semantics | |

**User's choice:** Master / Instrumental toggle + separate Download stems button.

| Option | Description | Selected |
|--------|-------------|----------|
| Hide the toggle entirely, just show Master | Consistent with Phase 9's lyrics-button pattern | ✓ |
| Show it disabled/grayed | Visible but non-functional | |

**User's choice:** Hide the toggle entirely (for missing Instrumental).

| Option | Description | Selected |
|--------|-------------|----------|
| Hide it entirely | Same consistent pattern | ✓ |
| Show it disabled/grayed | Visible but non-functional | |

**User's choice:** Hide it entirely (for missing stems ZIP → Download stems button).

---

## Visual fidelity gaps

| Option | Description | Selected |
|--------|-------------|----------|
| Small badge near the top app bar / topbar | Compact, doesn't compete with player focus | ✓ (both) |
| Inline in the left tracklist column | Near the Files/upload section | ✓ (both) |

**User's choice:** Both.

| Option | Description | Selected |
|--------|-------------|----------|
| Close enough — build into existing structure | No dedicated redesign pass | ✓ |
| There are specific gaps — let me describe them | User would flag mismatches | |

**User's choice:** Close enough — build new features into the existing structure.

---

## Claude's Discretion

- Visual treatment/placement details of the readiness-score widget within topbar and tracklist-column contexts.
- Storage bucket/path convention for stems ZIPs and instrumental files.
- Wording/placement of the stems info (ⓘ) button copy.
- PDF generation approach for credits/metadata sheets.
- Exact expiry window for the export link (7 days suggested, not fixed).

## Deferred Ideas

- Multiple individual stem files (per-instrument) — revisit after real-life testing feedback.
- Requiring a genuinely playable stems mix beyond the ZIP — revisit after live testing.
- In-app request/approve flow for industry members requesting an Export Pack — deferred until after Phase 10 ships.
