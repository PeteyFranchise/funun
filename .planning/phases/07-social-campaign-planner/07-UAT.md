---
status: complete
phase: 07-social-campaign-planner
source: [07-VERIFICATION.md]
started: 2026-07-03T14:00:00Z
updated: 2026-07-03T14:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. SlotGeneratePanel inline generate opens with AI suggestion
expected: Clicking 'Generate caption' / 'Generate hook' on a calendar slot slides the panel in from the right, shows 'Generating…', then shows the current caption alongside an AI suggestion. 'Use this' writes to the slot via the slot PATCH route; 'Discard' closes without writing.
result: pass

### 2. Calendar updates immediately after generate (no reload)
expected: After clicking 'Generate calendar', calendar slots appear in the week sections directly once the POST response completes — no manual page refresh needed.
result: pass

### 3. Standalone DropReady/SoundBait 'Save to calendar' opens picker and writes
expected: After a DropReady or SoundBait standalone tool run, a 'Save to calendar' action appears. Clicking it opens a centered modal with Platform/Week/Slot selects; confirming writes the caption to the chosen slot via PATCH — without recording anything to tool_outputs (D-11).
result: pass

### 4. Buffer CSV export format
expected: The Buffer CSV export downloads a valid CSV with four columns (Text, Image URL, Tags, Posting Time); Text contains slot captions; Posting Time values are formatted 'YYYY-MM-DD HH:mm' (e.g. '2026-07-15 12:00'), not ISO 8601.
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
