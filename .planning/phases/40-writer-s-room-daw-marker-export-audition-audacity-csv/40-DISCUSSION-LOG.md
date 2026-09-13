# Phase 40: Writer's Room — DAW marker export - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-12
**Phase:** 40-writer-s-room-daw-marker-export-audition-audacity-csv
**Areas discussed:** What goes in the file · How much of the song · What a marker says
**Area offered but declined:** Which formats ship — owner accepted the roadmap's three
(Audition, Audacity, CSV) without expansion.

---

## What goes in the file

| Option | Description | Selected |
|--------|-------------|----------|
| Unresolved only | A worklist — every marker is something still to do | ✓ |
| Everything, resolved marked | Complete record; DAW timeline fills with no-action markers | |
| Exporter chooses | A toggle; flexible but a choice at the moment you want one click | |

**User's choice:** Unresolved only

| Option | Description | Selected |
|--------|-------------|----------|
| Never exportable | Keeps pin privacy absolute; promote-to-comment is the existing escape hatch | |
| Author-only personal export | Work through your own flagged spots in your own DAW | ✓ |

**User's choice:** Author-only personal export — **against the recommendation**
**Notes:** I initially framed this as "D-11 gains its first exception" and corrected that in the
same turn: D-11 makes pins invisible to *other people*, so an author exporting their own data is
consistent with it. The genuinely new risk is that a file is forwardable where an in-app pin was
not — which drove the two follow-ups below.

| Option | Description | Selected |
|--------|-------------|----------|
| Separate file, separate action | The shareable file cannot contain pins by any path | ✓ |
| One file, pins included by a flag | One route; but shareable and private become the same artifact | |

**User's choice:** Separate file, separate action
**Notes:** This is the containment for the pin-export decision. Merging the two behind a flag is
precisely the change that would break it.

| Option | Description | Selected |
|--------|-------------|----------|
| "Pin" plus the timestamp | `Pin 1:12` — honest, scannable, invents nothing | ✓ |
| Numbered — "Pin 1", "Pin 2" | Cleaner, but ordinals shift between exports | |

**User's choice:** "Pin" plus the timestamp

---

## How much of the song

| Option | Description | Selected |
|--------|-------------|----------|
| One take, always | A marker file imports against one audio file | ✓ |
| Whole work, all takes | One download; but markers land on music from other performances | |

**User's choice:** One take, always
**Notes:** Presented as closer to physics than preference — v1's 0:58 is not v3's 0:58, and no DAW
format carries "which take" as a dimension.

| Option | Description | Selected |
|--------|-------------|----------|
| In the filename, always | The one carrier every format supports, incl. header-less TSV | ✓ |
| Filename plus in-file header where possible | Survives a rename in CSV; uneven across formats | |

**User's choice:** In the filename, always

---

## What a marker says

| Option | Description | Selected |
|--------|-------------|----------|
| Display name, not @handle | Readable by someone outside Funūn, where @handles mean nothing | ✓ |
| No attribution — text only | Maximum room for the actual note | |

**User's choice:** Display name, not @handle

| Option | Description | Selected |
|--------|-------------|----------|
| Omit it | Shortest label; the comment applies to this take either way | |
| Include a `[v1]` prefix | "Still open after a revision" is a real signal | ✓ |

**User's choice:** `[v1]` prefix — **against the recommendation**
**Notes:** Owner's reasoning stands on its own: feedback surviving a revision unaddressed is
exactly the thing a producer should see flagged.

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude, and say so in the UI | No marker ever lands on music it doesn't belong to | ✓ |
| Include with a warning prefix | Nothing unseen; but the marker is still on wrong music | |
| Include, collapsed to 0:00 | Visibly out-of-place; but 0:00 is a legitimate timestamp | |

**User's choice:** Exclude, and say so in the UI

---

## Claude's Discretion

- How a point comment renders in a range-shaped format (presumably `start == end`)
- Rate limiting and payload bounds on the export endpoint
- Filename sanitization for path-hostile characters in song titles
- Whether the two exports share one route with a path segment, or are two routes

## Deferred Ideas

- Include-resolved-comments flag; formats beyond the three; export accounting (who exported what,
  raised but not discussed); reaching a non-member producer; the clickable transcript pane;
  importing markers back from a DAW (explicitly one-way by design)

---

# Session 2 — 2026-09-13 (continuation)

**Areas discussed:** Does exporting leave a trace? · When there's nothing to export ·
If Audition's format can't be verified · Reaching a producer outside Funūn

---

## Does exporting leave a trace?

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing — pure read | No audit table, no marker, no Diary entry | ✓ |
| A Diary entry, comments export only | Reuses existing infrastructure; pins must never appear | |
| A dedicated audit record | Complete, but drags in retention + privacy review | |

**User's choice:** Nothing — export stays a pure read
**Notes:** I surfaced the Diary option unprompted along with its own disqualifier — a Diary entry on
a *pin* export would tell the room that someone has pins, breaking Phase 39's D-11. Declining any
trace removes that failure mode rather than relying on an exception holding.

---

## When there's nothing to export

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse, and say why | Case-specific message; never hands over a useless file | ✓ |
| Export an empty file anyway | One behaviour; writer discovers emptiness in their DAW | |
| Hide the control entirely | Quietest; indistinguishable from the feature not existing | |

**User's choice:** Refuse, and say why
**Notes:** The case that motivated the question: E-01 filters resolved and E-09 excludes
position-flagged comments, so a take can display three comments in the room and still export empty.
Without a message that reads as a bug.

---

## If Audition's format can't be verified

| Option | Description | Selected |
|--------|-------------|----------|
| Ship what's confirmed, add Audition later | Release not blocked by an undocumented vendor format | ✓ |
| Block until Audition is confirmed | Delivers exactly what was scoped; hands the date to an unknown | |
| Reverse-engineer it | A method rather than a fallback — adopted as the research approach | |

**User's choice:** Ship what's confirmed; reverse-engineering recorded as the research method

| Option | Description | Selected |
|--------|-------------|----------|
| Two named options either way | A user picks their DAW, not a serialization format | ✓ |
| Collapse into one CSV option | One fewer serializer; user must know CSV means Audition | |

**User's choice:** Two named options either way

---

## Reaching a producer outside Funūn

| Option | Description | Selected |
|--------|-------------|----------|
| Full display name | Attribution too vague to identify anyone is worse than none | ✓ |
| First name only | Less identifying if forwarded; ambiguous with shared first names | |

**User's choice:** Full display name
**Notes:** Resolved quickly — E-06 (filename) and E-07 (display name over @handle) had already
done most of the work of making the file readable to someone with no Funūn context. Onward travel
of the file is the writer's decision and stays out of scope.

---

## Offered and left as Claude's discretion

At the second Done gate the owner was offered these and left them with me: one route vs two, how a
point comment renders in a range-shaped format, rate limiting and payload bounds, and filename
sanitization for path-hostile song titles.
