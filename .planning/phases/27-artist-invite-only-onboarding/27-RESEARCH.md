# Phase 27: Artist Invitation-Only Onboarding — Research

**Researched:** 2026-08-09
**Domain:** Supabase auth provisioning gate, tokened invite substrate, public rate-limited waitlist + captcha, transactional email, Team Console staff surface
**Confidence:** HIGH (architecture/enforcement — grounded in this codebase's own established patterns) / MEDIUM (captcha provider integration, CAN-SPAM framing — standard practice, not counsel-reviewed)

## Summary

Phase 27 gates artist self-serve signup behind an invitation allowlist, enforced at the one place account creation actually happens — the `handle_new_user()` trigger (`supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql`, the current live body; **NOT** `artist_profiles` as the 27-CONTEXT.md canonical refs' migration *filenames* suggest — the table was renamed to `user_profiles` in Phase 20 and the function body has been replaced six times since (039→072→076→080→085→086), always preserving the same branch structure). This is a brownfield, low-risk addition: the trigger already branches on `raw_app_meta_data->>'role'` for curator/industry/buyer paths and falls through to a default artist branch that runs `claim_collaborators()` — the new gate is one more early check inside that same default branch, before its two `INSERT`s.

The allowlist has three sources per D-04: (1) existing `collaborators.email` rows — checked directly, no new table; (2) a new `artist_invites` table for Team-Member-issued and waitlist-conversion invites, built fresh rather than extending `collaborator_invites` (whose `collaborator_id` is `NOT NULL`, incompatible with an inviter who has no roster row for the invitee); (3) the owner's own bootstrap row. A second new table, `artist_waitlist`, captures D-11's inline denial capture and carries D-19's broadcast-scoped opt-out flag. Both tables follow this codebase's twice-proven **zero-RLS-policy + full REVOKE + service-role-only** shape (`funun_staff`/`staff_audit_log`, migration 089) rather than session-client RLS — every write and read runs through an API route, never raw PostgREST.

The pre-signup "check my invite" gate (D-10) is a public, rate-limited API route mirroring `app/api/sync/register/route.ts`'s proven in-memory rate-limiter and enumeration-safe response discipline — the owner has already accepted the residual enumeration trade-off (UI-SPEC's denial copy is deliberately identical for "mistyped" vs "never invited"), so the research task is mitigation, not elimination. Cloudflare Turnstile is the recommended captcha provider for D-12 — it needs **zero new npm dependencies** (script tag + a `fetch()` POST to `siteverify`), matching this project's established "zero new infrastructure" bias.

**Primary recommendation:** Add two new tables (`artist_invites`, `artist_waitlist`) in a schema-only migration, keep the allowlist predicate as inline SQL inside `handle_new_user()`'s existing artist branch (no new SECURITY DEFINER RPC needed for the *enforcement* path), and expose the *pre-check* UX via a public API route that runs the mirror-logic in TypeScript against the same two tables through the service-role client — with an explicit parity test (this codebase's established twin-drift guard, cf. `SPLIT_SHEET_TIER_MAP`) asserting the TS check and the trigger's SQL condition agree.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Invite-gate enforcement (the real gate) | Database (Postgres trigger) | — | D-02: must be unbypassable via direct API calls; only a DB-level check inside the provisioning trigger satisfies that |
| Invite-gate UX (prominent pre-check) | API/Backend (Next.js route) | Browser/Client | Public, rate-limited, enumeration-sensitive — server owns validation/rate-limit/captcha; client only renders state |
| Allowlist storage (`artist_invites`, plus existing `collaborators`) | Database/Storage | — | Source of truth the trigger reads directly |
| Waitlist capture + opt-out state (`artist_waitlist`) | Database/Storage | API/Backend | PII (email/name/note); zero-policy + service-role write path, same as `funun_staff` |
| Captcha verification | API/Backend | — | Secret key must never reach the browser; server calls Cloudflare's `siteverify` |
| Deep-link token issuance + resolution | API/Backend | Database/Storage | Token generation/lookup mirrors `collaborator_invites`' existing pattern |
| Branded transactional email delivery | API/Backend | — | Resend via the existing `lib/email` substrate (server-only `RESEND_API_KEY`) |
| Team Console invite/waitlist management | Browser/Client (admin UI) | API/Backend | `/admin/artist-invites`, gated by `requireStaff()`/leadership per D-06/D-15 |
| Broadcast reopen send | API/Backend | Database/Storage | Leadership-only, one-shot, must be idempotent + audited |

<phase_requirements>
## Phase Requirements

No requirement IDs are registered yet for this phase (per 27-CONTEXT.md, IDs live only in that file's decisions). Proposing a provisional `INVITE-` set, precedent-matched to Phase 26's `SYNCLIB-` registration style, for the planner to adopt and for `/gsd-docs-update` to register in REQUIREMENTS.md at phase close:

| ID | Description | Research Support |
|----|-------------|------------------|
| INVITE-01 | Server-authoritative gate inside `handle_new_user()`'s artist branch; new signups only, other branches untouched (D-01/D-02/D-03) | "Enforcement Mechanism" section below |
| INVITE-02 | Allowlist = collaborator emails (existing rows auto-authorized) + Team-Member invites + owner seed (D-04/D-05) | "Allowlist / Invite Table Design" |
| INVITE-03 | Any Team Member sends individual artist invites, unlimited for now (D-06/D-07) | "RLS + Permissions" |
| INVITE-04 | Collaborator-invite email via default-on prompt + explicit button; auto-send mode deferred behind an explicit toggle (D-08) | "Safe Sequencing of Auto-Send" |
| INVITE-05 | Tokened deep-link bound to the invited email; existing-account routing; expired → re-request (D-09) | "Deep-Link Token Binding" |
| INVITE-06 | Prominent gate + inline denial/waitlist UX, no redirect (D-10/D-11) | UI-SPEC surfaces 1/3 (already approved) |
| INVITE-07 | Public waitlist form protected by rate-limit + captcha (D-12) | "Waitlist Storage + Captcha" |
| INVITE-08 | Waitlist notify — per-person convert-to-invite + Leadership-only reopen broadcast (D-13/D-15) | "RLS + Permissions" |
| INVITE-09 | Team Console management surface at `/admin/artist-invites` (D-14) | UI-SPEC surface 5 (already approved) |
| INVITE-10 | Three distinct branded email templates with owner sign-off gate (D-16/D-17) | "Don't Hand-Roll" |
| INVITE-11 | Gate flips on from day one; owner + founding cohort seeded via the real invite mechanism, no soft-launch window (D-18) | "Bootstrap / Rollout Sequencing" pitfall |
| INVITE-12 | Broadcast-scoped unsubscribe + auto/manual resubscribe (D-19) | "Email Subscription & Re-Subscribe" |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.45.0 (pinned, already installed) | Service-role queries in new API routes | Existing project-wide client factory (`lib/supabase/server.ts`) |
| `resend` | 4.0.0 (already installed) | The three branded transactional emails | Existing substrate (`lib/email/index.ts`), no new provider |
| Cloudflare Turnstile | N/A (no npm package required) | D-12 waitlist captcha | Free, zero-dependency (script tag + server `fetch`), matches this project's "zero new infrastructure" convention (Wave 4 research decision log) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto` (Node built-in) | n/a | Invite token generation | Reuse `generateApprovalToken()` from `lib/split-sheets/approval.ts` (already used by the collaborator invite route) rather than writing a second token generator |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cloudflare Turnstile | hCaptcha / Google reCAPTCHA v3 | Both require either an npm package or more invasive script integration and carry stricter free-tier/consent-banner implications (reCAPTCHA v3 in particular ties into Google's analytics surface); Turnstile is the lowest-friction, zero-dependency option and is what most Vercel-hosted Next.js apps default to today |
| A new `artist_invites` table | Relax `collaborator_invites.collaborator_id` to nullable | Rejected — see "Allowlist / Invite Table Design" below; would conflate two different invite semantics (educational IPI nudge to a *named roster entry* vs. an *email-only* signup grant) in one table |
| Inline SQL predicate in the trigger | A new SECURITY DEFINER RPC (`is_artist_email_invited`) callable from both the trigger and the API route | Considered and rejected for the *enforcement* path — the trigger is already `SECURITY DEFINER` and can run the two-line `EXISTS` check inline without an extra function; a shared RPC would add an indirection layer for no security benefit, though the *pre-check UX route* does need its own independent TypeScript read (see below) |

**Installation:**
```bash
# No new npm packages required for this phase.
```

**Version verification:** No new packages are being added; all libraries used (`@supabase/supabase-js`, `resend`) are already pinned in `package.json` at the versions shown above (verified by reading `package.json` directly, not the registry — no version drift risk since nothing new is installed).

## Package Legitimacy Audit

**Not applicable — this phase installs no new external packages.** Cloudflare Turnstile is integrated via a `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js">` tag and a server-side `fetch()` call to `https://challenges.cloudflare.com/turnstile/v0/siteverify`; no `npm install` step exists to audit. If the planner later chooses a React wrapper package (e.g. `@marsidev/react-turnstile`) purely for developer convenience, run the Package Legitimacy Gate protocol against it at that time — it is not required by this research's recommended architecture.

**Packages removed due to [SLOP] verdict:** none (none proposed)
**Packages flagged as suspicious [SUS]:** none (none proposed)

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────┐
                         │  Visitor lands on /signup    │
                         │  (with or without ?invite=T) │
                         └──────────────┬───────────────┘
                                        │
                    ┌───────────────────┴────────────────────┐
                    │ token present?                          │
                    ▼ yes                                      ▼ no
        GET /api/signup/invite/[token]                 gate: email input shown
        (resolve token -> email, inviter name)          "Check my invite"
                    │                                          │
                    └───────────────┬──────────────────────────┘
                                     ▼
                    POST /api/signup/check-invite {email}
                    (rate-limited ip+email; service-role reads:
                     collaborators.email OR artist_invites pending)
                                     │
              ┌──────────────────────┼───────────────────────────┐
              ▼ allowed               ▼ existing account           ▼ denied
     show credential form      "sign in instead" ->/signin   inline denial + waitlist
     (email pre-filled)                                       form (name/note/captcha)
              │                                                     │
              ▼                                                     ▼
     supabase.auth.signUp()                              POST /api/waitlist
              │                                          (captcha verify -> rate limit
              ▼                                           -> upsert artist_waitlist,
     INSERT auth.users (Supabase)                          resubscribe-on-rejoin)
              │
              ▼
   AFTER INSERT trigger: handle_new_user()
   ┌─────────────────────────────────────────────────────────┐
   │ IF role IN ('curator','industry','buyer',...) -> existing│
   │   branches, UNCHANGED, RETURN early                       │
   │ ELSE (default = artist branch):                           │
   │   ① gate check (NEW):                                     │
   │      is_invited := EXISTS(collaborators WHERE email=..)   │
   │                  OR EXISTS(artist_invites WHERE email=..  │
   │                             AND status='pending'           │
   │                             AND token_expires_at > now())  │
   │      IF NOT is_invited THEN RAISE EXCEPTION 'not_invited'  │
   │         -- rolls back the whole transaction, incl.         │
   │         -- the auth.users row Supabase just inserted       │
   │   ② mark matching artist_invites row accepted              │
   │   ③ INSERT user_profiles / subscriptions (unchanged)       │
   │   ④ PERFORM claim_collaborators() (unchanged, unreachable  │
   │      unless ① passed — correct ordering by construction)   │
   └─────────────────────────────────────────────────────────┘
              │
              ▼
     signUp() promise resolves/rejects to the client
     (rejection -> generic error copy, never DB detail)

   Team Console (/admin/artist-invites):
   ┌───────────────────────────────────────────────────────────┐
   │ any staff -> "Convert to invite" (waitlist row -> INSERT    │
   │   artist_invites + email B "spot opened")                   │
   │ leadership only -> "Reopen & broadcast" (bulk email C to    │
   │   artist_waitlist WHERE unsubscribed_at IS NULL,             │
   │   idempotency-guarded)                                       │
   └───────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
supabase/migrations/
├── 097_artist_invites_and_waitlist.sql   # new tables + RLS (schema-only, isolated)
└── 098_artist_signup_gate.sql            # handle_new_user() gate (isolated, higher-risk change)
lib/
├── invites/
│   ├── schema.ts          # ARTIST_INVITE_SOURCE_VALUES, sanitizers
│   ├── allowlist.ts       # isArtistEmailAllowed() — TS mirror of the trigger predicate
│   └── waitlist.ts        # sanitizeWaitlistEntry(), resubscribe helper
├── email/
│   ├── artistInvite.ts        # template A (D-17)
│   ├── artistSpotOpened.ts    # template B
│   └── artistReopened.ts      # template C
├── security/
│   └── rate-limit.ts      # extracted shared in-memory limiter (see Don't Hand-Roll)
│   └── turnstile.ts       # verifyTurnstileToken()
app/
├── (auth)/signup/page.tsx          # modified: gate state machine
├── unsubscribe/page.tsx            # new (D-19)
├── api/
│   ├── signup/
│   │   ├── check-invite/route.ts   # public, rate-limited
│   │   └── invite/[token]/route.ts # public, resolves deep-link
│   ├── waitlist/
│   │   ├── route.ts                # POST public (captcha+rate-limit)
│   │   └── resubscribe/route.ts    # POST public
│   └── admin/
│       └── artist-invites/
│           ├── route.ts            # GET list, any staff
│           ├── [id]/convert/route.ts  # POST, any staff
│           └── broadcast/route.ts     # POST, leadership only
components/
├── admin/ArtistInvitesAdmin.tsx
└── collaborators/CollaboratorInvitePrompt.tsx  # D-08a
app/(admin)/admin/artist-invites/page.tsx
```

### Pattern 1: Server-authoritative gate as a trigger early-check
**What:** Add the allowlist check as the first statement inside `handle_new_user()`'s existing default (artist) branch, before its two `INSERT`s — not as a separate `BEFORE INSERT ON auth.users` trigger, not as an API-layer check alone.
**When to use:** Any time an app-layer check on Supabase auth signup must be truly unbypassable (D-02's explicit requirement).
**Example:**
```sql
-- Source: pattern inferred from this repo's existing handle_new_user() branches
-- (supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql lines 106-157)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_is_invited BOOLEAN;
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN RETURN NEW; END IF;
  IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN
    -- ... unchanged industry branch ...
    RETURN NEW;
  END IF;
  IF (NEW.raw_app_meta_data->>'role') = 'buyer' THEN
    -- ... unchanged buyer branch (migration 086) ...
    RETURN NEW;
  END IF;

  -- ── NEW: artist self-serve invite gate (D-01/D-02/D-03) ──
  -- Staff/industry/buyer/curator provisioning above is untouched — this
  -- check applies ONLY to the default (artist) branch, matching D-03's
  -- "artist branch only" scope exactly.
  SELECT EXISTS (
    SELECT 1 FROM public.collaborators WHERE LOWER(email) = LOWER(NEW.email)
  ) OR EXISTS (
    SELECT 1 FROM public.artist_invites
    WHERE LOWER(email) = LOWER(NEW.email)
      AND status = 'pending'
      AND token_expires_at > NOW()
  ) INTO v_is_invited;

  IF NOT v_is_invited THEN
    RAISE EXCEPTION 'not_invited' USING ERRCODE = 'P0001';
    -- Raising here rolls back the ENTIRE transaction, including the
    -- auth.users row Supabase's signUp() just inserted — no phantom
    -- account, no profile row, no enumeration leak from this layer.
  END IF;

  UPDATE public.artist_invites
    SET status = 'accepted', accepted_user_id = NEW.id, accepted_at = NOW()
    WHERE LOWER(email) = LOWER(NEW.email) AND status = 'pending';

  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status) VALUES (NEW.id, 'free', 'active');

  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Pattern 2: Public, rate-limited, enumeration-mitigated pre-check route
**What:** A `POST` route with no auth requirement, reusing the exact in-memory rate-limit shape already proven at `app/api/sync/register/route.ts`.
**When to use:** Any public write/read surface this codebase exposes without a session (D-10's check-invite, D-12's waitlist submit).
**Example:**
```typescript
// Source: pattern lifted directly from app/api/sync/register/route.ts
// (RATE_LIMIT_WINDOW_MS/RATE_LIMIT_MAX_ATTEMPTS/isRateLimited/getClientIp)
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX_ATTEMPTS = 5
const rateLimitStore = new Map<string, number[]>()
function isRateLimited(key: string): boolean { /* identical to sync/register */ }

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (isRateLimited(`ip:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const { email } = await request.json().catch(() => ({ email: '' }))
  if (isRateLimited(`email:${String(email).toLowerCase()}`)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const service = createServiceClient() // bypasses RLS — same convention as claim-collaborators route
  const invited = await isArtistEmailAllowed(service, email) // TS mirror, see parity-test pitfall
  const hasAccount = await emailHasExistingAccount(service, email)
  return NextResponse.json({ allowed: invited, existingAccount: hasAccount })
}
```

### Anti-Patterns to Avoid
- **A page-only (client-side) invite check with no trigger-level enforcement:** Bypassable via a direct `POST` to Supabase's `/auth/v1/signup` REST endpoint with the anon key, which any browser dev-tools user can find. D-02 explicitly forbids this.
- **A `BEFORE INSERT ON auth.users` trigger instead of the existing `AFTER INSERT` one:** Supabase's own `on_auth_user_created` trigger (migration 001) is `AFTER INSERT`; a `RAISE EXCEPTION` inside an `AFTER` trigger still rolls back the whole transaction (same result), but adding a *second*, separate `BEFORE` trigger duplicates trigger-management surface for no benefit — extend the existing function instead.
- **Reusing `collaborator_invites` by relaxing its `collaborator_id NOT NULL` constraint:** Conflates two distinct invite semantics (see Table Design below) and risks breaking the existing IPI-education invite flow's assumptions (`app/api/collaborators/[id]/invite/route.ts` always has a real collaborator row to read `.name`/`.email` from).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting a public route | A new bespoke limiter per route | Extract the existing `app/api/sync/register/route.ts` in-memory Map pattern into `lib/security/rate-limit.ts` and import it in the ≥3 new public routes this phase adds (check-invite, waitlist submit, resubscribe) | The pattern is already proven "acceptable for beta" by the project's own directive; duplicating it a third/fourth time invites drift (e.g. different window/threshold constants by accident) |
| HTML-escaping interpolated user values in email templates | A new escape function | The `esc()` helper already duplicated in `lib/email/staffInvite.ts`/`industryInvite.ts` — extract it once into `lib/email/esc.ts` this phase (3 new templates need it) rather than copy-pasting a 5th time | UI-SPEC surface 6 explicitly instructs reusing this pattern "verbatim" |
| Invite token generation | A new random-token generator | `generateApprovalToken()` from `lib/split-sheets/approval.ts` (already used by the collaborator invite route for `collaborator_invites.invite_token`) | One canonical token generator for the whole app; avoids a second crypto-randomness implementation to review |
| Staff-action audit trail on invite send / convert / broadcast | A parallel ad hoc log | `logStaffAction()` (Phase 25, `lib/staff/` — the single write-through call every staff mutation already uses) | Matches D-04's "audit every staff write" precedent exactly; the Team Console invite/broadcast actions ARE staff writes |
| "Does this email already have an account" check | A raw `auth.users` PostgREST query (that schema isn't exposed) or a new `listUsers()` full-table scan | A small `SECURITY DEFINER` helper, `public.email_has_account(p_email text) RETURNS boolean`, `EXECUTE` revoked from PUBLIC/anon/authenticated and granted to `service_role` only — mirrors the exact lockdown migration 075 already applied to `claim_collaborators()` | Supabase's JS admin SDK has no `getUserByEmail()` (open feature request, supabase/auth#880); the reliable, precise, non-enumerating approach documented across Supabase's own community discussions is a `SECURITY DEFINER` function against `auth.users`, called only via the service-role client — never exposed to anon PostgREST directly |
| Waitlist captcha widget + verification | A bespoke iframe/verification flow | Cloudflare Turnstile: `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js">` client-side + a server `fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method:'POST', body: new URLSearchParams({secret, response, remoteip})})` | Zero new npm dependency, free tier, no consent-banner complications; matches "zero new infrastructure" project convention |

**Key insight:** This phase's highest-leverage move is almost entirely *reuse* — every mechanism it needs (tokened invites, rate limiting, email escaping, staff audit, zero-RLS-policy service-only tables, in-memory rate limiting) already has one clean precedent living in this exact codebase. The research risk is not "what library to add" (none) — it is "don't let a 4th copy-pasted rate limiter or a 5th copy-pasted `esc()` drift from the other three/four."

## Common Pitfalls

### Pitfall 1: Gate scoped too broadly, locking out non-artist branches
**What goes wrong:** The `not_invited` check gets placed before the `role` branch checks instead of inside the default (artist-only) branch, silently blocking industry/buyer/staff/curator signups too.
**Why it happens:** The trigger's branch structure (curator → industry → buyer → default) is easy to misread as "one function, add a check at the top."
**How to avoid:** The gate must be the **first statement inside the default/artist branch only**, after all three role-specific `IF ... RETURN NEW` blocks. Add a migration-content test (this codebase's established convention, cf. `migration-054/055/057/058/063/066` assertion tests) asserting the new `RAISE EXCEPTION` text appears textually *after* the last `role = 'buyer'` branch's `RETURN NEW;` in the function body.
**Warning signs:** Any UAT where a staff-provisioned Team Member or an admin-invited industry account fails to sign in.

### Pitfall 2: Bootstrap self-lockout (D-18)
**What goes wrong:** Migration 098 (the gate) ships before the owner's own artist account exists or before an `artist_invites` row for the owner exists — the owner (or the person testing the flow) cannot sign up.
**Why it happens:** D-18 says "flip the gate on from day one," which reads as "ship immediately," but doesn't by itself guarantee the owner's account predates the flip.
**How to avoid:** Before pushing the gate migration, confirm explicitly (Wave-0 checkpoint, human-verified) whether the owner already has a `user_profiles` row. Given this project's extensive staff/leadership history (Phase 25's `is_admin`→Leadership fallback, `funun_staff` seeding), the owner very likely already has an account — but this must be **confirmed, not assumed** before the gate migration is pushed. If not yet confirmed, seed one `artist_invites` row for the owner's own email as part of the same migration/checkpoint, so the very first real signup attempt is self-admitting.
**Warning signs:** Any account (including the owner's) rejected with `not_invited` post-push.

### Pitfall 3: `check-invite` route logic drifts from the trigger's SQL predicate
**What goes wrong:** The TypeScript pre-check (`isArtistEmailAllowed()`) and the SQL `EXISTS` condition inside `handle_new_user()` are maintained independently and slowly diverge (e.g. one adds a third allowlist source, the other doesn't) — resulting in a UI that says "you're invited ✓" and a server that then rejects the actual signup (or vice versa).
**Why it happens:** No single source of truth; SQL and TS can't literally share code across the process boundary.
**How to avoid:** This codebase has an established mitigation for exactly this class of bug — the `SPLIT_SHEET_TIER_MAP`/coverage-fixtures.ts twin-parity pattern (Phase 17/18). Write one shared scenario fixture (a list of `{email, collaboratorRows, inviteRows, expected}` cases) and a proxy test asserting both the TS helper's output and a **structural** description of the SQL predicate agree — Jest cannot execute PL/pgSQL directly, so the SQL side is checked via a migration-content assertion test, matching the project's own precedent for this exact limitation.
**Warning signs:** Any UAT scenario where the gate's UI state (`allowed`/`denied`) doesn't match the actual `signUp()` outcome.

### Pitfall 4: `artist_invites`/`artist_waitlist` given ordinary RLS policies instead of the zero-policy/service-role pattern
**What goes wrong:** A well-intentioned `USING (auth.uid() = invited_by_user_id)` policy is added, but then a public (unauthenticated) route needs to read/write these tables too (the check-invite gate, the waitlist submit) — RLS as designed can't serve an anonymous caller without a much looser (and dangerous) policy.
**Why it happens:** Most other tables in this codebase (`collaborators`, `split_sheets`) are session-owner-scoped and use ordinary RLS; it's the natural first reach.
**How to avoid:** Follow the `funun_staff`/`staff_audit_log` precedent exactly (migration 089): `ENABLE ROW LEVEL SECURITY` with **zero policies** + explicit `REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ... FROM authenticated, anon` — every read and write goes through an API route using the service-role client, which enforces its own authorization (staff routes call `requireStaff()`; public routes rely on rate-limit + captcha + strict field allowlisting, matching `POST /api/sync/register`'s "first genuinely public write path" precedent).
**Warning signs:** A direct `supabase.from('artist_invites').select()` call succeeding from the browser console.

### Pitfall 5: Old, dead `waitlist` table (migration 001) silently reused or confused with the new one
**What goes wrong:** A planner or executor greps for "waitlist," finds the pre-existing `waitlist` table (email/artist_name/source, `UNIQUE` email, a permissive `"Anyone can join waitlist"` `FOR INSERT USING (true)` policy that predates this codebase's privilege-hardening passes), and either reuses it as-is or gets confused about which table backs D-11/D-12.
**Why it happens:** The table already exists, is unused anywhere in `app/`/`lib/`/`components/` (confirmed via grep), and its name is an exact match for the new feature.
**How to avoid:** Build a fresh `artist_waitlist` table (schema doesn't match: no `name`/`note`/`unsubscribed_at` columns on the old one, and its RLS policy has never been through the migration-031-style column-privilege hardening this project now expects of every new table). Document in the new migration's header comment that this is a **deliberate** divergence from the old `waitlist` table, not an oversight — mirroring this codebase's existing convention of explaining "why not reuse X" inline (cf. migration 075's header).
**Warning signs:** Two tables both named similarly in `\dt` output with no comment explaining the split.

### Pitfall 6: Reopen broadcast double-sends
**What goes wrong:** Leadership clicks "Reopen & notify waitlist" twice (network retry, double-click, or a second Team Member acting independently), sending the same batch email to every waitlister twice.
**Why it happens:** No idempotency guard on a one-shot bulk action; D-15's own copy ("This can't be undone") signals the team already anticipates this as high-stakes.
**How to avoid:** Add a `notified_reopen_at` timestamp column to `artist_waitlist`; the broadcast route only emails rows where `notified_reopen_at IS NULL` (or older than some interval, if repeat reopens across weeks are expected), and sets it in the same transaction as the send loop completes for each recipient (or before sending, accepting at-most-once semantics over at-least-once, matching general transactional-email best practice for a bulk send).
**Warning signs:** A waitlister reporting two "we've reopened" emails.

### Pitfall 7: Turnstile secret key exposed client-side
**What goes wrong:** `TURNSTILE_SECRET_KEY` gets prefixed `NEXT_PUBLIC_` by mistake, or the verify `fetch()` call is made from a client component instead of the API route.
**Why it happens:** Copy-paste from a tutorial that inlines both keys in one file for brevity.
**How to avoid:** Only `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (the site key, safe to expose — it's rendered in the widget's `data-sitekey` attribute) is public; `TURNSTILE_SECRET_KEY` stays server-only, read inside the `POST /api/waitlist` route handler exactly like `RESEND_API_KEY` is read only inside `lib/email/index.ts`.
**Warning signs:** `grep NEXT_PUBLIC_TURNSTILE_SECRET` returning any hits.

## Code Examples

### Turnstile server-side verification
```typescript
// Source: Cloudflare Turnstile docs pattern (verified endpoint via web search,
// 2026-08 — https://challenges.cloudflare.com/turnstile/v0/siteverify)
// lib/security/turnstile.ts
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret || !token) return false
  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = (await res.json()) as { success: boolean }
    return data.success === true
  } catch {
    return false // fail closed — a Cloudflare outage should not open the waitlist form to abuse
  }
}
```

### Waitlist upsert with auto-resubscribe (D-19)
```sql
-- Source: pattern inferred from this repo's UNIQUE-email + ON CONFLICT
-- conventions (buyer_orgs, collaborators)
INSERT INTO public.artist_waitlist (email, name, note)
VALUES (LOWER($1), $2, $3)
ON CONFLICT (email_lower) DO UPDATE
  SET name = EXCLUDED.name,
      note = EXCLUDED.note,
      unsubscribed_at = NULL,   -- D-19: rejoining the waitlist auto-resubscribes
      updated_at = NOW();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Open self-serve artist signup (`app/(auth)/signup/page.tsx`, unconditional `signUp()`) | Invite-gated self-serve (this phase) | Phase 27 | Signup UX gains a pre-check state machine; DB gains one new branch-internal check |
| `collaborator_invites` as the only invite/token table | `collaborator_invites` (unchanged, IPI-education use case) + new `artist_invites` (signup-allowlist use case) | Phase 27 | Two tables, two purposes — do not conflate |

**Deprecated/outdated:** None — no existing mechanism is being removed, only extended.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The owner (Pete) already has a `user_profiles` row from before this phase ships, so no self-lockout window exists | "Bootstrap / Rollout Sequencing" pitfall | If wrong, the owner is locked out of their own product on push — must be a human-verified Wave-0 checkpoint, not assumed by the executor |
| A2 | Cloudflare Turnstile requires no npm package and is the lowest-friction captcha choice for this stack | Standard Stack / Don't Hand-Roll | If the team has an existing captcha vendor relationship (e.g. already-configured hCaptcha elsewhere), that could be cheaper to reuse — no evidence of one in this codebase (grep found zero hits) |
| A3 | Supabase's admin SDK (`@supabase/supabase-js` 2.45.0) has no `getUserByEmail()`, requiring a `SECURITY DEFINER` helper against `auth.users` for existing-account detection | "Don't Hand-Roll" — email_has_account | If a newer/undocumented admin API method exists, the recommended helper function becomes an unnecessary extra migration object — low risk either way, but worth a quick `supabase-js` changelog check before implementing |
| A4 | The reopen broadcast is legally "commercial" (CAN-SPAM-applicable) while collaborator/Team-Member personal invites are "transactional" | "Email Subscription & Re-Subscribe" | This is a legal characterization, not verified against counsel — 27-CONTEXT.md's own `<for_research>` section already flags this exact line for BD/counsel review; do not treat as settled |

**If this table is empty:** N/A — see rows above; all four should be confirmed before the corresponding plan tasks are treated as locked.

## Open Questions

1. **Does the owner's artist account already exist?**
   - What we know: Extensive staff/leadership infrastructure (Phase 25) strongly implies yes.
   - What's unclear: No direct evidence found in this research pass (no `user_profiles` table read was performed — out of scope for a code-only research pass).
   - Recommendation: Add an explicit Wave-0 human-verification checkpoint task in the plan: confirm the owner's artist account exists (or seed an `artist_invites` bootstrap row for their email) *before* the gate migration is pushed.

2. **Should the deep-link token (D-09) carry any enforcement weight beyond pre-fill/framing?**
   - What we know: The UI-SPEC explicitly describes a silent fallback to the generic gate if the visitor edits the pre-filled email — meaning the *actual* admission decision is always "is this email on the allowlist," never "does this token match."
   - What's unclear: Whether the planner wants the token to also gate deep-link *access* itself (e.g. an expired/invalid token shows a distinct "re-request" state) versus only cosmetic framing.
   - Recommendation: Treat the token as UX-binding (pre-fill honesty + "invited by" framing + expiry-triggered re-request copy), not as a second security boundary — the real security boundary is the email-based check in `handle_new_user()` plus Supabase's own mandatory email-confirmation step (which already guarantees whoever completes signup controls the invited inbox).

3. **Exact captcha provider sign-up / Turnstile site key provisioning** — requires the owner (or an operator with Cloudflare account access) to create a Turnstile widget and obtain a site key + secret key; this is an operational/account-setup task, not a code task, and should be a `checkpoint:human-verify` in the plan before the waitlist route can go live.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | The three branded emails (D-17) | ✓ (already configured — used by every existing invite lane) | n/a | `sendEmail()` already no-ops gracefully (`{ ok: false }`) if unset, matching every other email call site in this codebase |
| Cloudflare Turnstile site + secret key | Waitlist captcha (D-12) | ✗ — not yet provisioned in this codebase (grep found zero references) | n/a | None — this is a hard blocker for shipping the waitlist form; needs an owner/operator `checkpoint:human-verify` to create the widget in the Cloudflare dashboard and set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` |
| Supabase CLI / `supabase db push` access | Both new migrations (097/098) | ✓ (project has an established human-gated push convention; every migration since 065 has followed it) | supabase CLI 1.200.0 (pinned) | None needed — this is the existing, working convention (never push from an agent) |

**Missing dependencies with no fallback:**
- Cloudflare Turnstile site/secret key pair — must be provisioned by a human before the waitlist form can go live; the plan should sequence UI/route build ahead of this and gate the actual captcha-enabled deploy behind a `checkpoint:human-verify`.

**Missing dependencies with fallback:**
- None beyond the above.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 (ts-jest, transpile-only per `tsconfig.json`'s `isolatedModules`) |
| Config file | `jest.config.js` (repo root) |
| Quick run command | `npx jest <path-to-new-test-file>` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INVITE-01 | Gate-migration text places the `RAISE EXCEPTION` after all role branches, before the artist-branch inserts | unit (migration-content assertion, this codebase's established pattern for un-executable SQL) | `npx jest __tests__/migration-098-gate.test.ts` | ❌ Wave 0 |
| INVITE-02 | `isArtistEmailAllowed()` TS helper matches fixture table (collaborator match / pending invite match / expired / none) | unit | `npx jest lib/invites/allowlist.test.ts` | ❌ Wave 0 |
| INVITE-03 | `requireStaff()` (no role restriction) gates individual-invite route; non-staff gets 403 | unit/integration | `npx jest app/api/admin/artist-invites/route.test.ts` | ❌ Wave 0 |
| INVITE-04 | `sanitizeWaitlistEntry()`/collaborator invite prompt default-checked state | unit | `npx jest lib/invites/waitlist.test.ts` | ❌ Wave 0 |
| INVITE-05 | Token resolves to email/inviter; expired token returns re-request state; edited email falls back to generic gate | unit | `npx jest app/api/signup/invite/route.test.ts` | ❌ Wave 0 |
| INVITE-06/07 | Rate-limiter caps at threshold; captcha-fail rejects before DB write | unit | `npx jest lib/security/rate-limit.test.ts` | ❌ Wave 0 |
| INVITE-08 | `requireStaff(['leadership'])` gates broadcast route; idempotency guard skips already-notified rows | unit | `npx jest app/api/admin/artist-invites/broadcast/route.test.ts` | ❌ Wave 0 |
| INVITE-12 | Resubscribe clears `unsubscribed_at`; broadcast query excludes opted-out rows | unit | `npx jest lib/invites/waitlist.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest <touched test files>`
- **Per wave merge:** `npm test` (full suite — this repo is at 1700+ tests as of Phase 26; keep it green)
- **Phase gate:** Full suite green before `/gsd-verify-work`; migration 098 (the gate) additionally requires the human-gated `supabase db push` + a live smoke (an uninvited test email rejected, an invited one admitted, the owner's own account unaffected) before the phase can be marked shipped — mirroring every prior schema-changing phase's convention (085, 089, 095, 096).

### Wave 0 Gaps
- [ ] `__tests__/migration-098-gate.test.ts` — text-content assertion on the new trigger body (this codebase's only viable test strategy for un-executable PL/pgSQL, per Phase 17/19's own precedent)
- [ ] `lib/invites/allowlist.test.ts` + a shared `invite-fixtures.ts` scenario table (the twin-parity guard for Pitfall 3)
- [ ] `lib/security/rate-limit.ts` extraction + its own test (currently only tested indirectly via `sync/register`'s route test)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth (`signUp`/email confirmation) — unchanged by this phase, gate sits *before* it |
| V3 Session Management | no | No new session concepts introduced |
| V4 Access Control | yes | `requireStaff()` (any-staff vs. leadership-only split, D-06/D-15); zero-RLS-policy + service-role-only tables (`artist_invites`, `artist_waitlist`) |
| V5 Input Validation | yes | Explicit field allowlists on every new mutation (mirrors `EDITABLE_FIELDS`/`buildRegisterPayload` convention); `zod` (already installed) or the existing hand-rolled sanitizer pattern |
| V6 Cryptography | yes | Invite/unsubscribe tokens via `crypto.randomBytes(32)`-equivalent (`generateApprovalToken()`, already audited/in-use) — never hand-roll a weaker generator |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Account/email enumeration via the check-invite gate | Information Disclosure | Rate-limit (ip+email dimensions), generic denial copy (already locked in UI-SPEC), captcha on the adjacent waitlist submit; residual risk explicitly accepted by the owner per 27-CONTEXT.md's own framing |
| Direct PostgREST bypass of the app-layer gate | Elevation of Privilege | The DB-level `handle_new_user()` `RAISE EXCEPTION` is the real boundary (D-02) — a client hitting Supabase's `/auth/v1/signup` REST endpoint directly still passes through the same trigger |
| Forwarded deep-link used by an uninvited third party | Spoofing | Not a distinct threat — admission is always re-derived from the *submitted* email at signup time, and account activation requires confirming that exact email's inbox (Supabase's built-in flow), so a forwarded link with a different typed-in email just re-runs the normal (likely-denying) gate |
| Waitlist form spam / scraping | Denial of Service (resource exhaustion) | Rate-limit + Turnstile captcha (D-12), matching the `sync/register` public-write precedent |
| Reopen-broadcast abuse (unauthorized mass email) | Elevation of Privilege | `requireStaff(['leadership'])` (D-15), audited via `logStaffAction()` |
| IDOR on the unsubscribe link | Tampering | Dedicated random `unsubscribe_token` column (not the row's primary-key UUID) so guessing/enumerating waitlist IDs from other contexts can't toggle a stranger's subscription state |

## Sources

### Primary (HIGH confidence)
- This repository's own code, read directly during this research pass: `app/(auth)/signup/page.tsx`, `supabase/migrations/001_initial_schema.sql`, `039_handle_new_user_industry_branch.sql`, `075_phase19_privilege_hardening.sql`, `076_rename_artist_profiles_to_user_profiles.sql`, `018_collaborators_split_sheets.sql`, `089_funun_staff_and_audit.sql`, `094_funun_staff_user_id_unique.sql`, `app/api/collaborators/[id]/invite/route.ts`, `app/api/claim-collaborators/route.ts`, `app/api/sync/register/route.ts`, `lib/staff/createStaffAccount.ts`, `lib/collaborators/index.ts`, `lib/email/index.ts`, `lib/email/staffInvite.ts`, `lib/admin/gate.ts`, `app/(admin)/layout.tsx`, `app/(admin)/admin/team-members/page.tsx`, `package.json`

### Secondary (MEDIUM confidence)
- Cloudflare Turnstile `siteverify` endpoint and integration pattern — WebSearch, cross-referenced across multiple 2025/2026 Next.js integration writeups (Medium/DeepWiki/GitHub) agreeing on the same POST-to-`siteverify` shape
- Supabase admin SDK lacking a native `getUserByEmail()` — WebSearch of Supabase's own GitHub issues/discussions (supabase/auth#880 open feature request; community-recommended `SECURITY DEFINER` RPC workaround)

### Tertiary (LOW confidence)
- CAN-SPAM/transactional-vs-commercial email framing (D-19) — general practice knowledge, explicitly flagged in this document's Assumptions Log as requiring counsel review, per 27-CONTEXT.md's own instruction

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every mechanism reused has a live, working precedent in this exact codebase
- Architecture: HIGH — the enforcement point, table shapes, and RLS pattern all mirror proven, already-shipped structures in this repo (funun_staff, collaborator_invites, sync/register)
- Pitfalls: HIGH — every pitfall listed traces to a concrete, named risk already discovered and documented by this project's own prior phases (twin-drift, bootstrap sequencing, zero-policy RLS, dead-table confusion)
- Captcha/email-law framing: MEDIUM/LOW — provider mechanics verified via search; legal characterization explicitly unverified, flagged for BD/counsel per the phase's own context

**Research date:** 2026-08-09
**Valid until:** 2026-09-08 (30 days — this is a stable, low-churn domain: Postgres trigger patterns and this codebase's own conventions don't move fast; re-verify only if Supabase ships a native email-lookup admin API before the plan executes)
