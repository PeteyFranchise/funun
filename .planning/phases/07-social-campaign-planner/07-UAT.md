---
status: testing
phase: 07-social-campaign-planner
source: [07-VERIFICATION.md]
started: 2026-07-03T14:00:00Z
updated: 2026-07-03T14:00:00Z
---

## Current Test

number: 1
name: SlotGeneratePanel inline generate opens with AI suggestion
expected: |
  Panel slides in from the right, shows 'Generating…' text, then shows the
  current caption alongside an AI suggestion. 'Use this' writes to the slot
  via the slot PATCH route. 'Discard' closes without writing.
awaiting: user response

## Tests

### 1. SlotGeneratePanel inline generate opens with AI suggestion
expected: Clicking 'Generate caption' / 'Generate hook' on a calendar slot slides the panel in from the right, shows 'Generating…', then shows the current caption alongside an AI suggestion. 'Use this' writes to the slot via the slot PATCH route; 'Discard' closes without writing.
result: [pending]

### 2. Calendar updates immediately after generate (no reload)
expected: After clicking 'Generate calendar', calendar slots appear in the week sections directly once the POST response completes — no manual page refresh needed.
result: [pending]

### 3. Standalone DropReady/SoundBait 'Save to calendar' opens picker and writes
expected: After a DropReady or SoundBait standalone tool run, a 'Save to calendar' action appears. Clicking it opens a centered modal with Platform/Week/Slot selects; confirming writes the caption to the chosen slot via PATCH — without recording anything to tool_outputs (D-11).
result: [pending]

### 4. Buffer CSV export format
expected: The Buffer CSV export downloads a valid CSV with four columns (Text, Image URL, Tags, Posting Time); Text contains slot captions; Posting Time values are formatted 'YYYY-MM-DD HH:mm' (e.g. '2026-07-15 12:00'), not ISO 8601.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
