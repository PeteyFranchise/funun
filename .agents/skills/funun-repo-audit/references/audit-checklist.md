# Funūn Repository Audit Checklist

Use this checklist to build the coverage inventory. Mark areas not present or not inspectable rather than silently skipping them.

## Repository And Branch Scope

- Current branch, commit, dirty files, untracked files, and upstream status
- Available local and remote refs
- Default branch and branch-only deltas
- `AGENTS.md`, project documentation, planning artifacts, and accepted decisions
- Runtime, framework, package manager, database, authentication, deployment, and integrations

## Authentication And Authorization

- Missing session or user validation
- Client-provided user, role, organization, ownership, or price fields
- Object-level authorization and cross-tenant IDOR/BOLA
- Role escalation, mass assignment, and confused-deputy behavior
- UI-only permission gates
- Service-role operations without a trusted server-side gate
- Differences between route checks, RLS, storage policies, and RPC grants
- Invitation, password-reset, magic-link, and one-time-token lifecycle
- Account enumeration and stale-session behavior

## Injection And Unsafe Execution

- SQL, command, HTML, Markdown, template, email, header, CSV, and log injection
- Stored/reflected XSS and React escape hatches
- SSRF, open redirects, unrestricted URLs, and path traversal
- Unsafe deserialization, prototype pollution, and regex denial of service
- Untrusted values passed to shells, interpreters, providers, or AI tools

## Secrets And Data Exposure

- Committed credentials and server secrets exposed through `NEXT_PUBLIC_*`
- Service-role keys or privileged responses reachable from clients
- PII or tokens in logs, errors, URLs, analytics, or notifications
- Over-broad selects and cross-tenant response fields
- Public or long-lived storage access where private signed access is required
- Development, preview, debugging, or source-map exposure

Never reproduce a secret value in the report.

## Supabase And PostgreSQL

- Missing, permissive, or caller-controlled RLS policies
- `SECURITY DEFINER` functions without a locked `search_path`
- RPCs unnecessarily executable by `PUBLIC`, `anon`, or `authenticated`
- Missing foreign keys, checks, uniqueness, ownership constraints, and indexes
- Trigger races and unsafe dynamic SQL
- Production data that could make a migration fail
- Rolling-deployment compatibility between schema and application code

## Webhooks And Integrations

- Raw-body signature verification before parsing or side effects
- Timestamp/replay validation
- Provider identifier uniqueness and event idempotency
- Concurrent delivery and partial failure
- Retry semantics and expiring provider URLs
- Duplicate charges, messages, documents, notifications, or external actions
- Timeouts, response validation, and secret handling

## Files And Storage

- Server-side type, size, and content validation
- Client-controlled filenames or storage paths
- Executable or active-content uploads
- Cross-user object access and signed URL lifetime
- Orphaned uploads and incomplete cleanup
- Whole-file buffering and memory exhaustion
- Download authorization

## Concurrency And Data Integrity

- Check-then-insert and count-then-insert races
- Read-modify-write without compare-and-swap
- Sequential multi-row updates described as atomic
- Lost updates and duplicate records
- Jobs without leases, stale-worker fencing, or retry limits
- Webhook work performed before an atomic claim
- Billing, credits, emails, or notifications without idempotency
- Retry-unsafe external side effects
- Partial writes across storage and database boundaries
- Missing transactional outbox behavior
- Unbounded tables and unscheduled cleanup

For each issue, state the A/B request interleaving and the authoritative transaction boundary.

## Performance And Reliability

- N+1 queries and sequential independent requests
- Unbounded selects, result sets, loops, maps, caches, and queues
- Missing pagination and query indexes
- Long AI/provider/PDF operations in request handlers
- Missing timeout, cancellation, batching, or backpressure
- Large objects buffered in memory
- Retry storms and ignored database or storage errors
- React render loops, unstable dependencies, stale closures, and listener leaks
- Expensive work before authentication or rate limiting

Do not label an ordinary loop a bottleneck without establishing realistic scale and cost.

## Generated-Code And AI Risks

- Hallucinated functions, SDK methods, routes, RPCs, tables, columns, or environment variables
- Code referencing missing or unapplied migrations
- Genuinely unused imports, symbols, and unreachable code
- Misleading comments or duplicated contradictory implementations
- Bad state ownership or mutable derived state
- AI output used without schema, length, cost, or provenance validation
- Prompt injection reaching tools, URLs, database operations, or privileged actions
- Provider- or AI-generated claims presented as verified Funūn facts

## Edge Cases

- Missing, malformed, null, or oversized JSON
- Empty strings and arrays
- Duplicate identifiers
- Fractional, negative, NaN, infinite, and out-of-range numbers
- Unicode normalization and case sensitivity
- Deleted parents, stale browser state, and concurrent deletion
- Provider timeout and malformed response handling
- Zero-row updates incorrectly reported as success
- Retry after partial success
- Missing environment variables and clock/expiry boundaries

## Validation Commands

Run only when relevant and safe:

- `npm run typecheck`
- `npm run typecheck:strict`
- `npm run lint`
- `npx jest --runInBand`

Do not run builds, servers, migrations, deployments, destructive Git operations, live provider calls, email sends, payment actions, or production mutations during the audit.
