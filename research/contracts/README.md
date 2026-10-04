# Contract Template Research Library

This directory holds contract examples and working drafts for research. It is intentionally outside `lib/`, `app/`, and production template paths.

Nothing in this directory is approved for use as a Funūn agreement. A research item must not be offered to users, generated, sent for signature, or placed in Contract Locker as an operative agreement merely because it is stored here.

See [`GOVERNANCE.md`](GOVERNANCE.md) for the owner-approved direction on attorney review, Funūn's non-counsel boundary, and collaboration with a user's independently retained lawyer.

## Required item structure

Each item has its own directory containing:

- `source.md` — the supplied source, preserved without substantive rewriting.
- `metadata.json` — provenance, classification, lifecycle state, and explicit eligibility flags.
- `intake-audit.md` — separate review notes, open questions, and proposed future intake fields.

`catalog.json` is the discovery index. Production code must not import it.

## Lifecycle

```text
research_only
  -> counsel_reviewed
  -> product_approved
  -> implementation_ready
  -> published_version
```

Promotion requires all of the following:

1. Designated counsel approves the exact legal language, intended jurisdictions, use cases, and exclusions.
2. Funūn records reviewer provenance, review date, version, and re-review cadence.
3. Product owners approve editable fields, protected clauses, validation rules, disclosures, and signer roles.
4. Engineering creates a versioned production artifact and tests generation, access control, audit history, and e-signature field placement.
5. The published artifact states whether it is a template, deal memo, or binding agreement and includes the approved user-facing legal boundary.

Editing a protected clause after review invalidates the reviewed status until counsel reviews the new exact version.

Template-review counsel and a user's own counsel are distinct roles. Review of a Funūn standard form does not create an attorney-client relationship with every user. A user may invite independently retained counsel to collaborate through a scoped Funūn account as described in `GOVERNANCE.md`.

## Security and privacy

Do not add passwords, secrets, access tokens, signatures, government identifiers, payment credentials, private addresses, or live party data. Use placeholders or synthetic examples. Executed agreements belong in the permissioned Contract Locker workflow, not in this research directory.
