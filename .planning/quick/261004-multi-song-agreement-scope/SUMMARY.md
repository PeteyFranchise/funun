# Multi-Song Agreement Scope Decision — Summary

## What changed

- Added agreement coverage choices for one song, several selected songs, an entire project/release, and non-song-specific agreements.
- Added release-type capture for Singles, EPs, LPs, Albums, and other project types.
- Defined `Entire release as currently listed` as a fixed scope snapshot, with `Select specific tracks` as the alternative.
- Required a Schedule A or equivalent exhibit identifying every covered composition and exact recording/master version.
- Required composition, master-recording, or combined coverage to be explicit for each listed item.
- Defined scope classifications and immutable covered-item rows so a project link cannot silently expand legal scope.
- Required a scope-difference review when a draft's project track list changes and an amendment, replacement, or new agreement after execution.
- Kept catalogue/future-work coverage unavailable by default unless an expressly governed, counsel-approved template supports it.
- Extended the external-music workflow to multi-song releases while preserving the `Not linked to existing Funūn music` status and match checks.
- Defined how one agreement reference appears across Contract Locker, Song Passport, Sound Vault, and The Crate without creating duplicate contracts or false clearance claims.

## Validation run

- Confirmed project-level scope resolves to an exact set of works and recording versions.
- Confirmed later release changes cannot alter executed scope.
- Confirmed composition and master coverage remain independently identified for every listed item.
- Confirmed external release references do not create Funūn music records or clearance status.
- Confirmed a shared agreement can appear on each covered Song Passport without duplicating the agreement instance.
- `git diff --check` passed for the task paths.

## Coordination note

Claude was concurrently working. This task modified only Codex's standalone decision record and added uniquely named quick-task files.

## Workflow note

Native `/gsd-quick` invocation was unavailable in this Codex session, so the AGENTS.md manual quick-task fallback was used.
