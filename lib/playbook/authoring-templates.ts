import type { PlaybookEntryType } from '@/lib/playbook/content'

export type PlaybookAuthoringTemplate = {
  key: string
  label: string
  caption: string
  entryType: PlaybookEntryType
  titlePlaceholder: string
  body: string
}

export const PLAYBOOK_AUTHORING_TEMPLATES: readonly PlaybookAuthoringTemplate[] = [
  {
    key: 'doctrine',
    label: 'Doctrine',
    caption: 'Purpose, authority, responsibilities, boundaries, and accountability.',
    entryType: 'document',
    titlePlaceholder: 'e.g. Artist Development Doctrine',
    body: `> [!NOTE]
> **Owner:** Name the accountable team or role.
> **Applies to:** Name the people and work covered.
> **Review cadence:** Choose a review interval.

## Purpose

Explain why this doctrine exists and the outcome it protects.

## Scope and boundary

Define what this team owns, shares, and must not do.

## Core responsibilities

- Responsibility one
- Responsibility two
- Responsibility three

## Authority and escalation

State which decisions this team may make and what requires escalation.

## Service Level Agreements (SLAs)

Describe response and completion expectations.

## Measures and accountability

Define healthy outcomes without rewarding harmful shortcuts.

## Ethics and refusal rules

State the behavior this doctrine will not permit.`,
  },
  {
    key: 'sop',
    label: 'SOP / checklist',
    caption: 'A repeatable sequence someone can check off while doing the work.',
    entryType: 'sop',
    titlePlaceholder: 'e.g. New member onboarding',
    body: `Confirm the objective and responsible owner
Gather the required information and permissions
Complete the work in the approved system
Record decisions, exceptions, and follow-ups
Verify the result with the affected person
Close or escalate the work`,
  },
  {
    key: 'policy',
    label: 'Policy',
    caption: 'A clear rule, its rationale, exceptions, and enforcement path.',
    entryType: 'document',
    titlePlaceholder: 'e.g. Catalogue access policy',
    body: `## Policy statement

State the rule in plain language.

## Why it exists

Explain the people, rights, safety, or business interest this protects.

## Who and what it covers

Define the scope precisely.

## Required behavior

- Requirement one
- Requirement two

## Exceptions

List who can approve an exception, what evidence is required, and how it is recorded.

## Violations and escalation

Describe the proportionate response and escalation path.

## Review and change control

Name the owner and review cadence.`,
  },
  {
    key: 'training-guide',
    label: 'Training guide',
    caption: 'Learning goals, preparation, instruction, practice, and completion checks.',
    entryType: 'document',
    titlePlaceholder: 'e.g. Running a producer onboarding call',
    body: `## Learning outcome

By the end, the learner can…

## Before you begin

- Required access
- Required context
- Supporting material

## Walkthrough

### 1. Introduce the work

Explain the first action and why it matters.

### 2. Practice it

Give the learner a realistic task.

### 3. Verify the result

Describe what successful completion looks like.

## Common mistakes

> [!WARNING]
> Document the most important error and how to recover safely.

## Completion check

- [ ] Learner completed the practice task
- [ ] Learner knows when and where to escalate
- [ ] Follow-up support is identified`,
  },
  {
    key: 'runbook',
    label: 'Runbook',
    caption: 'Operational triggers, ordered response, verification, and stop conditions.',
    entryType: 'document',
    titlePlaceholder: 'e.g. Failed audio delivery runbook',
    body: `## Trigger

Describe exactly when to use this runbook.

## Owner and escalation path

Name the primary owner, backup, and escalation contact or role.

## Before acting

- Preserve relevant evidence
- Confirm scope and user impact
- Check for an active incident or duplicate response

## Procedure

### 1. Contain

Describe the safest first action.

### 2. Diagnose

List the evidence and systems to inspect.

### 3. Resolve

Describe the approved recovery path.

### 4. Verify

Confirm the user-visible and system result.

## Stop conditions

> [!WARNING]
> Stop and escalate when the next action could expose data, alter rights, destroy evidence, or widen impact.

## Closeout

Record the outcome, follow-up owner, and prevention work.`,
  },
  {
    key: 'gameplan-topic',
    label: 'CRM Gameplan topic',
    caption: 'Open-ended prompts that help a team member guide a useful conversation.',
    entryType: 'topic',
    titlePlaceholder: 'e.g. Release strategy discovery',
    body: `What outcome does the member or client want from this conversation?
What is already decided, and what is still uncertain?
Who else is involved or affected?
What rights, access, timing, or budget constraints matter?
What is the clearest next action, owner, and due date?
What should be recorded in the call log?`,
  },
] as const

export function findPlaybookAuthoringTemplate(key: string): PlaybookAuthoringTemplate | null {
  return PLAYBOOK_AUTHORING_TEMPLATES.find(template => template.key === key) ?? null
}
