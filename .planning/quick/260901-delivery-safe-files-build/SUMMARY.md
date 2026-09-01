# Delivery-Safe Files Build — GSD Summary and Claude Handoff

## Status

Implementation complete and locally verified. Production activation remains gated on the owner applying migration 142 through the established Supabase workflow.

This completes the first shippable Delivery-safe files slice from Phase 37.3 Stage 3. It does not claim recipient delivery, partner acceptance or DDEX transmission.

## What Changed

- Added a server-only delivery evidence model for generated tagged MP3s and metadata sidecars.
- Replaced the reusable `.tagged.mp3` overwrite path with a unique UUID-backed artifact path and `upsert: false`.
- Hashes the exact source audio and generated artifact with SHA-256.
- Freezes the metadata used for each output and hashes the canonical snapshot.
- Generates two separate JSON documents:
  - a manifest identifying source, artifact, hashes, metadata snapshot and generation time;
  - an export receipt recording the authenticated actor and completed generation action.
- Added an explicit receipt disclaimer: the receipt proves Funūn generated the artifact; it does not claim a recipient received or accepted it.
- Added authenticated, owner-scoped manifest and receipt download routes with private/no-store caching.
- Upgraded Metadata Studio from direct sidecar/download links to accountable generation actions for both tagged MP3s and sidecars.
- Added a user-facing custody statement confirming that the original audio remains unchanged.
- Preserved the legacy sidecar GET endpoint for compatibility; the UI now uses the accountable POST path.
- Added best-effort rollback that removes only a newly generated artifact if URL signing or ledger persistence fails. The source path is never a cleanup target.

## Why This Shape

- Unique paths make corrections additive: generating a new copy cannot silently rewrite the evidence attached to an earlier copy.
- Source and artifact hashes let Funūn prove which exact bytes produced which delivery file.
- The frozen metadata snapshot answers which credits, identifiers and rights fields were included at generation time even if the project changes later.
- Separating manifest from receipt keeps file identity distinct from the event record.
- A service-only ledger prevents browser clients from reading, rewriting or deleting export evidence directly.
- The receipt language stays truthful: this build records generation, not downstream delivery or acceptance.

## User Effect

Inside Metadata Studio, a user can now:

1. Choose **Generate tagged MP3** for an MP3 source or **Generate sidecar** for another delivery workflow.
2. Download the separately generated artifact.
3. Download its machine-readable manifest.
4. Download its export receipt.
5. Continue working from the original audio knowing the generation process did not overwrite it.

If evidence cannot be recorded, Funūn does not present the artifact as complete and tells the user that no source file was changed.

## Security and Doctrine Boundaries

- Project and track ownership are proven with the caller's authenticated session before any service-role operation.
- The evidence table grants no access to `PUBLIC`, `anon` or `authenticated` browser roles.
- Manifest/receipt downloads re-check the authenticated owner's project and track relationship.
- Signed artifact links expire after two hours.
- No direct distributor delivery, recipient acknowledgment, watermarking, Content ID, payment or DDEX claim was added.

## Validation Run

- Focused delivery and metadata suites: **46/46 passing**.
- Delivery route, pure evidence and migration suites after route coverage was added: **16/16 passing**.
- `npm run typecheck`: **passing**.
- Scoped ESLint across every implementation/test route: **passing with zero warnings**.
- Full Jest suite: **3,647 passing; 3 failing in `components/catalogue/WorkPage.test.tsx`**.
  - The failures expect older strings/layout markers (`Add to this song —`, `Next for this song:`) that the current Writer's Room render no longer emits.
  - Delivery-safe files do not touch `WorkPage.tsx`, its tests or any Writer's Room component.
  - These were recorded as an unrelated pre-existing repository failure and were not modified in this build.
- `git diff --check`: passing for the scoped build.

## Production Activation

Owner/Claude must apply and verify:

```text
supabase/migrations/142_metadata_delivery_exports.sql
```

Do not expose the new Metadata Studio generation actions in production before the migration exists. Without the table, the route safely removes the generated copy and returns an evidence-recording error, but the intended workflow is not operational.

## Claude/GSD Continuation

1. Review this summary and migration 142.
2. Apply migration 142 through the human-gated production process.
3. Verify one MP3 generation and one sidecar generation against production Storage.
4. Confirm source hashes remain stable before and after both generations.
5. Download and inspect each manifest and receipt.
6. After production verification, mark the pending production-migration TODO complete and update Phase 37.3 Stage 3 as partially shipped.

Natural next increments, not included here: a delivery-history UI, named-recipient grants/receipts, successor/supersession links, and incorporating these artifacts into Export Pack.
