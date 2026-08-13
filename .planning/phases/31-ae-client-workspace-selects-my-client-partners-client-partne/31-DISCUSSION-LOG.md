# Phase 31: AE Client Workspace + Selects - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-13
**Phase:** 31-ae-client-workspace-selects-my-client-partners-client-partne
**Areas discussed:** Watermark protection, Build order / MVP slice, Health freshness, Assignment handoff, CRM-lite contact depth, AI-draft + saved search, Player UI approach

Requirements were locked by `31-SPEC.md` (14 reqs, 0.13 ambiguity) — this discussion covered implementation ("how") decisions only.

---

## Watermark protection style (R12)

| Option | Description | Selected |
|--------|-------------|----------|
| Inaudible forensic, per-recipient | Invisible per-recipient mark; clean-sounding; serves stream + download with one mechanism | |
| Audible tag on the stream | Periodic spoken/tonal tag; cheapest, strongest obvious deterrent; breaks the download test-sync use case | |
| Layered: subtle audible stream + forensic download | Light audible tag on stream; clean forensic mark on download; most complete, most build | ✓ |

**User's choice:** Layered (subtle audible stream + forensic download).

### Download scope (R12)
| Option | Description | Selected |
|--------|-------------|----------|
| AE-controlled, default full-length | Download defaults full track (forensic); AE can cap or disable per Selects | ✓ |
| Always full-length | Every download is the full track | |
| Always capped preview (~60–90s) | Length-capped slice | |

### Forensic traceability (R12/R13)
| Option | Description | Selected |
|--------|-------------|----------|
| Share token + recipient | Traces to the specific grantee, even if forwarded | ✓ (both) |
| Selects only | Identifies which Selects leaked, not which recipient | ✓ (both) |

**User's choice:** Both — the forensic payload encodes the Selects AND the recipient/token.
**Notes:** Watermarking mechanism/tooling is net-new (nothing in codebase) → a research task. Per-recipient forensic marking implies a per-share render.

---

## Build order / MVP slice (R1–R14)

| Option | Description | Selected |
|--------|-------------|----------|
| Slice: outbound Selects motion first | Rooms + Crate Requests + builder + player first; health/routing/telemetry/Game Plan follow | ✓ |
| Slice: internal rooms + routing first | Tower + assign/handoff/Playbook + health first; Selects motion second | |
| Build whole, planner sequences | No explicit MVP cut | |

**User's choice:** Slice — outbound Selects motion first.

### Slice-1 target (R1)
| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `buyer_orgs`; defer people-records | Company-level send motion first | |
| Build CRM-lite people records into slice 1 | Person/contact layer + relationship log in slice 1 | ✓ |

**User's choice:** Build CRM-lite people into slice 1.
**Notes:** "Own book" filtering in slice 1 rides the existing `buyer_orgs.ae_user_id` (mig 090); the assign/reassign UI + email + log-write stays in slice 2.

---

## Health signal freshness (R3/R4)

| Option | Description | Selected |
|--------|-------------|----------|
| Live on read | Computed each list/workspace load; always fresh; no cron | ✓ |
| Scheduled + on key events | Nightly + event hooks; cheaper at scale; can lag | |
| Hybrid: stored, recompute-if-stale | Middle ground; more moving parts | |

**User's choice:** Live on read.
**Notes:** Makes R4's "recompute on rule save" a non-issue (nothing stored). Revisit at large scale only.

---

## Assignment handoff strength (R7/R8)

| Option | Description | Selected |
|--------|-------------|----------|
| Email + in-app notif + auto-created task | Structural handoff; Intro/Onboarding task pre-created in AE queue | ✓ |
| Email + in-app notif (task on click) | Task created only when AE clicks start | |
| Email only (as spec locks) | Just the email + start-task link | |

**User's choice:** Email + in-app notif + auto-created task.
**Notes:** Uses existing `lib/notifications`; task-queue model may be net-new. Email-delivery failure must not block the assignment (SPEC AC).

---

## CRM-lite contact depth (R1)

### Contacts per company
| Option | Description | Selected |
|--------|-------------|----------|
| Multiple per company, one primary | Several stakeholders; primary drives default email/call | ✓ |
| Single contact per company | 1:1 org↔person | |

### Field depth
| Option | Description | Selected |
|--------|-------------|----------|
| Standard set | name/role/company/email/phone/LinkedIn/timezone/tags/notes | |
| Minimal | name/role/email/phone/status | |
| Rich | Standard + multiple emails/phones, address, custom fields | ✓ |

### Relationship pipeline
| Option | Description | Selected |
|--------|-------------|----------|
| Leadership-configurable, seeded default | Editable stages (New lead→Contacted→Active→Negotiating→Closed/Dormant) | ✓ |
| Fixed default pipeline | Hardcoded stages | |

**User's choice:** Multiple contacts + primary; Rich fields (incl. custom fields); leadership-configurable stages.
**Notes:** Contact layer designed export-friendly for a future real CRM. "Days in stage" measures against the configurable pipeline.

---

## AI-draft + saved search (R11)

### AI-draft track selection
| Option | Description | Selected |
|--------|-------------|----------|
| Rights-ready first, ~10 tracks, reviewable | Prioritizes rights-ready; badges shown; AE curates | ✓ |
| Rights-ready ONLY (hard filter) | Excludes anything not cleared | |
| All tracks, badged, AE decides | Widest net | |

### Saved-search sharing
| Option | Description | Selected |
|--------|-------------|----------|
| Any AE can share to the team | AE saves private + flips to team | ✓ |
| Leadership-curated team searches | Only leadership promotes to shared set | |

**User's choice:** Rights-ready-first reviewable ~10-track draft; any AE shares searches to the team.

---

## Shareable player UI (R12)

| Option | Description | Selected |
|--------|-------------|----------|
| Build from existing dark player refs | Build token player directly from the design refs | |
| Run `/gsd-ui-phase` for a UI contract first | Produce a UI-SPEC before building (client-facing, brand-critical) | ✓ |

**User's choice:** Run `/gsd-ui-phase` for the player UI contract first — even though the player is in slice 1.

---

## Claude's Discretion

None — the user decided every area raised. Details not explicitly discussed default to SPEC + sensible planner choices (audible-tag character, Crate Requests intent thresholds, the leadership-config surface's exact form).

## Deferred Ideas

Restated from SPEC out-of-scope so they aren't lost (no new scope creep surfaced):
- AI-guided company knowledge wiki — own future phase (The Playbook is its seed)
- GTM metrics dashboards + Deals room rebuild — separate phases
- Peripheral admin rooms; Green Room Placements — tabled
