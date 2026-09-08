# Organizational Doctrine — Playbook Publication Map

**Status:** PUBLICATION PREFLIGHT BUILT LOCALLY — doctrine approved; candidate migrations 201–202 authored outside the active chain, human-gated and unapplied
**Purpose:** Place every approved doctrine in the correct Playbook room without flattening or losing its hierarchy, callouts, tables, diagrams or authority distinctions.

## Publication constraint

The production database-backed Playbook currently represents:

- `sop` entries as `{ items: string[] }`.
- `topic` entries as `{ questions: string[] }`.

The doctrine package requires headings, paragraphs, lists, callouts, tables, links and Mermaid diagrams. Publishing it as hundreds of flat checklist lines would damage meaning and make authority rules harder to understand. Releases 1–7 now implement the richer model, governance, reading operations and publication preflight locally; production remains on the earlier model until the owner applies migrations 201–202.

Therefore:

1. The Markdown package remains authoritative until migrations 201–202 are applied and each doctrine is human-reviewed and published.
2. Existing A&R and BDT flat entries remain historical initial publications; they should be updated from the canonical package after adoption support exists.
3. Candidate migrations 201–202 are reserved and authored outside `supabase/migrations`; they must not enter the active chain until Phase 38.2 migrations 199–200 land.
4. Playbook publication is a separate human-reviewed operation after schema, renderer, editor and role grants are verified.

## Required content capability

The Playbook must support a page or document entry that preserves:

- H1–H4 headings.
- Paragraphs and block quotes.
- Ordered and unordered lists.
- Note, tip, caution and warning callouts.
- Tables with usable mobile rendering.
- Links to related doctrine and source evidence.
- Mermaid or an approved text-to-diagram representation.
- Source file, adopted date, source revision and later in-app revision history.
- Draft, review, published, superseded and archived states.
- Role-based room access and narrower entry-level restrictions where necessary.

`sop` and `topic` should remain available for Gameplan checklist and coaching-question use. Rich documents should coexist rather than overload those types.

## Room map

| Doctrine | Playbook room | Subgroup | Default sensitivity |
|---|---|---|---|
| Company-wide principles | Company-wide | Organizational Doctrine | Internal |
| A&R | A&R | Role Doctrine | Internal |
| Account Executives | AE / Sales | Role Doctrine | Internal |
| Business Development | Business Development | Role Doctrine | Internal |
| Talent Services & Member Success | Talent Services & Member Success | Role Doctrine | Internal; restricted member cases separate |
| Sync & Licensing | Sync & Licensing | Role Doctrine | Internal; deal records separate |
| Rights, Legal & Contract Operations | Rights, Legal & Contract Operations | Role Doctrine | Internal; privileged matters excluded |
| Catalogue, Metadata & Verification | Catalogue Operations | Role Doctrine | Internal |
| Finance, Accounting & Royalties | Finance | Role Doctrine | Internal; financial records excluded |
| Marketing, Community & Audience | Marketing | Role Doctrine | Internal |
| Product, Engineering & IT | IT Team | Role Doctrine | Internal; security procedures may be restricted |
| Leadership | Leadership | Leadership Doctrine | Restricted |
| Team Member Services | TMS | Role Doctrine | Internal; personnel records excluded |
| Training & Enablement | TMS | Training & Enablement | Internal |
| Trust & Safety | Trust & Safety | Role Doctrine | Internal; case information excluded |
| Support Operations | Support Operations | Role Doctrine | Internal |
| Funūn Deal Flow | Company-wide | Cross-Functional Operations | Internal |
| Workforce & Commercial Scale | Leadership | Workforce Planning | Restricted |
| Six-Month Launch Growth Plan | Leadership | Launch Planning | Restricted |

## Recommended room creation

Existing rooms should be reused where they already exist. Add only rooms that need an enduring working identity:

- Talent Services & Member Success.
- Sync & Licensing.
- Rights, Legal & Contract Operations.
- Catalogue Operations.
- Finance.
- Marketing.
- Trust & Safety.
- Support Operations.

Training remains a subgroup under TMS. Product/Engineering remains within IT Team unless the owner later approves a broader label. Workforce and launch plans remain in Leadership rather than Company-wide because they contain internal planning assumptions.

## Entry decomposition

Each function should publish a short entry series rather than one overwhelming page:

1. **Start Here — Purpose, Boundary and Outcome**
2. **Core and Expanded Responsibilities**
3. **Decision Authority and Escalation**
4. **Lifecycle, Statuses and Records**
5. **Daily Workflow and Console**
6. **Service Level Agreements**
7. **Communication, Privacy and Recordkeeping**
8. **Metrics and Anti-Gaming Safeguards**
9. **Ethics, Conflicts and Refusal**

The concise Start Here entry links to the detailed operating entries. Sensitive procedures or case records never belong inside general doctrine articles.

## Cross-functional entries

Publish these shared articles once and link to them from every relevant room:

- One relationship owner and one deal operator.
- Handoff sent versus handoff accepted.
- Funūn Deal Flow and stage gates.
- Level 1–4 Occurrence Model.
- Technical access versus business authority.
- Training, certification, authority and access distinctions.
- Record visibility: internal, member-visible, Client Partner-visible, confidential and privileged.
- Funūn net revenue, GMV, participant funds and collected cash distinctions.
- Ethical refusal and escalation.

Avoid copying these rules into many rooms where later edits could diverge.

## Gameplan connections

Doctrine is the policy layer; CRM Gameplans are executable checklists. Published doctrine should be able to link to reusable Gameplans such as:

- Member beta onboarding.
- Producer onboarding.
- Client Partner qualification.
- BDT-to-AE handoff.
- Qualified brief intake.
- Exact-version Crate admission.
- Licence clearance and delivery.
- Cue-sheet follow-up.
- Incident response.
- Team Member onboarding and role certification.

Checking off a Gameplan does not prove that an approval, licence, payment, verification or certification exists. The underlying authoritative record remains required.

## Publication workflow

1. Adopt the canonical Markdown source into a draft rich-document entry.
2. Record source path and revision.
3. Assign subject-matter and authority reviewers.
4. Verify room and entry visibility using ordinary roles, not only service-role access.
5. Render and inspect desktop and mobile presentation, including tables and diagrams.
6. Verify links to related doctrine and Gameplans.
7. Publish through the existing approval workflow.
8. Record the publication date and superseded source entries.
9. Never auto-overwrite later in-app edits when a source file changes; surface a reviewable source-change notice.

## Publication readiness console

Release 7 adds `/admin/playbook/publication` for Leadership and authorized room leads. It is deliberately metadata-only and:

- maps approved sources to their room and subgroup;
- shows ready, draft, published, changed and blocked states;
- detects missing structure, duplicate sources, title/source collisions and unresolved legacy supersession;
- identifies expected reviewer roles and missing connected Gameplans;
- filters non-Leadership room leads to rooms they actually govern;
- provides a session checklist for ordinary-reader, room-lead, Leadership, mobile, diagram and hostile-content UAT;
- links into the existing room adoption and approval workflow without bulk publishing.

## Publication acceptance criteria

- Every approved function appears in its intended room.
- No role receives access solely because its title sounds senior.
- Leadership planning is not exposed through a general Company-wide grant.
- Legal privilege, Trust and Safety cases, personnel matters and financial records remain outside general doctrine content.
- Tables and diagrams remain readable on mobile.
- Existing Gameplan topic sourcing continues to work.
- Existing A&R and BDT entries have a deliberate supersession path.
- Published content matches the owner-approved Markdown package.
