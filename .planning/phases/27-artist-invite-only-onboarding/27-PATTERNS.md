# Phase 27: Artist Invitation-Only Onboarding - Pattern Map

**Mapped:** 2026-08-09
**Files analyzed:** 21 (new + modified)
**Analogs found:** 21 / 21

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/097_artist_invites_and_waitlist.sql` | migration | CRUD (schema) | `supabase/migrations/089_funun_staff_and_audit.sql` (zero-RLS-policy shape) + `018_collaborators_split_sheets.sql` (tokened invite table shape) | exact |
| `supabase/migrations/098_artist_signup_gate.sql` | migration | event-driven (trigger) | `supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql` (`handle_new_user()` current live body) | exact |
| `lib/invites/schema.ts` | model/schema | transform | `lib/metadata/schema.ts` (`_LABELS`/`_VALUES` export convention) | role-match |
| `lib/invites/allowlist.ts` | service | request-response | `lib/staff/leadershipFallback.ts` + the trigger's own `EXISTS` predicate (twin-parity target) | role-match |
| `lib/invites/waitlist.ts` | service | CRUD | `lib/collaborators/index.ts` (sanitizer pattern) | role-match |
| `lib/security/rate-limit.ts` | utility | request-response | `app/api/sync/register/route.ts` (in-route limiter, to be extracted) | exact |
| `lib/security/turnstile.ts` | utility | request-response | new pattern (no direct analog) — server `fetch()` verify call | no close analog |
| `lib/email/esc.ts` | utility | transform | `lib/email/industryInvite.ts` / `staffInvite.ts` (duplicated `esc()`, to be extracted) | exact |
| `lib/email/artistInvite.ts` | service | request-response | `app/api/collaborators/[id]/invite/route.ts`'s inline email (has HTML+text, closest to "branded + fallback" bar) | role-match |
| `lib/email/artistSpotOpened.ts` | service | request-response | `lib/email/staffInvite.ts` (magic-link invite template shape) | role-match |
| `lib/email/artistReopened.ts` | service | pub-sub (batch send) | `lib/email/staffInvite.ts` template shape + `app/api/sync/register/route.ts`'s best-effort side-effect pattern | role-match |
| `app/(auth)/signup/page.tsx` (modified) | component | request-response | itself (existing file, extend state machine) — same file is baseline | exact |
| `app/unsubscribe/page.tsx` | component | request-response | `app/(auth)/signup/page.tsx` (card shell + `inputClass` + `sent`-style state swap) | role-match |
| `app/api/signup/check-invite/route.ts` | route | request-response | `app/api/sync/register/route.ts` (public, rate-limited, enumeration-safe) | exact |
| `app/api/signup/invite/[token]/route.ts` | route | request-response | `app/api/collaborators/[id]/invite/route.ts` (token resolve pattern, reversed direction) | role-match |
| `app/api/waitlist/route.ts` | route | request-response | `app/api/sync/register/route.ts` (public write, rate-limit + captcha, upsert) | exact |
| `app/api/waitlist/resubscribe/route.ts` | route | request-response | `app/api/sync/register/route.ts` (public write, simpler payload) | role-match |
| `app/api/admin/artist-invites/route.ts` | route | CRUD | `app/(admin)/admin/team-members/page.tsx`'s server-side list-fetch pattern + `requireStaff()` gate convention | role-match |
| `app/api/admin/artist-invites/[id]/convert/route.ts` | route | event-driven | `app/api/collaborators/[id]/invite/route.ts` (token issuance + send) | role-match |
| `app/api/admin/artist-invites/broadcast/route.ts` | route | batch | `app/api/sync/register/route.ts`'s `routeLead()` best-effort side-effect pattern, escalated to a leadership-gated bulk loop | partial match |
| `app/(admin)/admin/artist-invites/page.tsx` | route(page)/server component | request-response | `app/(admin)/admin/team-members/page.tsx` (page shell, leadership/staff role check, service-client list fetch) | exact |
| `components/admin/ArtistInvitesAdmin.tsx` | component | CRUD | `components/admin/StaffAdmin.tsx` (themed `.fncon` admin list component) | exact |
| `components/collaborators/CollaboratorInvitePrompt.tsx` | component | event-driven | `components/collaborators/CollaboratorForm.tsx` (inline-swap panel convention) + existing `CollaboratorCard` "Invite" button styling | role-match |

## Pattern Assignments

### `supabase/migrations/097_artist_invites_and_waitlist.sql` (migration, CRUD schema)

**Analogs:** `supabase/migrations/089_funun_staff_and_audit.sql` (zero-RLS-policy shape) and `018_collaborators_split_sheets.sql` (tokened-invite table columns).

**Zero-RLS-policy + service-role-only shape** (089, lines 27-45):
```sql
CREATE TABLE IF NOT EXISTS public.funun_staff (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  staff_role   TEXT NOT NULL CHECK (staff_role IN ('leadership', 'ae', 'bd')),
  ...
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_funun_staff_user_id ON public.funun_staff (user_id);
ALTER TABLE public.funun_staff ENABLE ROW LEVEL SECURITY;
-- No policies are created for any role. Zero-policy + REVOKE = service-role only.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.funun_staff FROM authenticated, anon;
```
Apply this exact shape to both `artist_invites` and `artist_waitlist` — `ENABLE ROW LEVEL SECURITY` with **zero policies** plus explicit `REVOKE` from `authenticated, anon`. Every new API route in this phase must use the service-role client (`createServiceClient()`), never `createApiClient()`, against these two tables (RESEARCH Pitfall 4).

**Tokened invite table columns** (018, lines 1-25, `collaborators` + the `collaborator_invites` shape referenced later in the same file):
```sql
CREATE TABLE collaborators (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name    TEXT NOT NULL,
  email   TEXT,
  ...
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
`artist_invites` needs: `email` (matched case-insensitively — index on `LOWER(email)`), `status` (`pending`/`accepted`/`expired`), `invite_token`, `token_expires_at`, `invited_by_user_id` (nullable — waitlist conversions may have no single named inviter), `source` (`collaborator`/`staff`/`waitlist_conversion`/`owner_seed`), `accepted_user_id`, `accepted_at`. `artist_waitlist` needs: `email` (UNIQUE, case-normalized per RESEARCH's `email_lower` example), `name`, `note`, `unsubscribed_at`, `unsubscribe_token` (distinct random token, NOT the row PK — RESEARCH Security Domain IDOR mitigation), `notified_reopen_at`, `converted_to_invite_at`.

**Header-comment convention** — every migration in this repo explains *why*, and RESEARCH Pitfall 5 explicitly requires documenting why `artist_waitlist` is a fresh table rather than reuse of the dead migration-001 `waitlist` table (mirror migration 075's "why not reuse X" header style, seen in `076`'s own header block above).

---

### `supabase/migrations/098_artist_signup_gate.sql` (migration, trigger/event-driven)

**Analog:** `supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql` — this IS the current live `handle_new_user()` body to extend (NOT migration 039, which is stale).

**Current live branch structure** (076, lines ~108-157):
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;
  END IF;

  IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN
    INSERT INTO public.user_profiles (id, member_type, artist_name, industry_roles, roles)
    VALUES (...);
    BEGIN
      INSERT INTO public.subscriptions (user_id, tier, status)
      VALUES (NEW.id, 'free', 'active');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN NEW;
  END IF;

  -- default / artist branch:
  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- swallow claim errors; account creation continues
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
**Note there is also a `buyer` branch (migration 086)** between `industry` and the default fallthrough that RESEARCH's diagram references — read migration 086's `handle_new_user()` body directly before writing 098, since 076 predates it; the planner/executor must locate the CURRENT (post-086, and any later renumbering) live body, not stop at 076.

**Gate insertion point** — the new `IF NOT v_is_invited THEN RAISE EXCEPTION ...` check goes as the **first statement inside the default (artist) branch only**, after all role-specific `IF ... RETURN NEW` blocks and before the two existing `INSERT`s. See RESEARCH's Pattern 1 code block (lines 200-249 of 27-RESEARCH.md) for the exact recommended body — reproduce it verbatim, adjusted for whatever branches actually exist in the current live function.

**Exception-isolation pattern to reuse for the `claim_collaborators()` call** (unchanged, already shown above) — same `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END;` wrapper migration 027 established; do not touch this block, only insert the new gate check before it.

---

### `lib/security/rate-limit.ts` (utility, extracted)

**Analog:** `app/api/sync/register/route.ts` lines 28-54 (in-route, to be lifted into a shared module).

```typescript
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX_ATTEMPTS = 5
const rateLimitStore = new Map<string, number[]>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (rateLimitStore.get(key) ?? []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    rateLimitStore.set(key, recent)
    return true
  }
  recent.push(now)
  rateLimitStore.set(key, recent)
  return false
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') ?? 'unknown'
}
```
Export `isRateLimited`/`getClientIp` (or a factory that takes window/max as params so `check-invite`, `waitlist`, and `waitlist/resubscribe` can each get their own `Map` instance) from `lib/security/rate-limit.ts`; import into all three new public routes plus (optionally) refactor `sync/register` to import from the shared module too — do not leave a 4th copy-pasted limiter (RESEARCH "Don't Hand-Roll").

---

### `app/api/signup/check-invite/route.ts` (route, request-response, public)

**Analog:** `app/api/sync/register/route.ts` (full file) — the established "first genuinely public write path" shape: no `createApiClient()` session check, `createServiceClient()` only, two-dimension rate limiting (ip + email), generic error responses, never leaking DB detail.

**Core public-route pattern** (sync/register lines 94-124):
```typescript
export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (isRateLimited(`ip:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  // ... strict field allowlist / validation via a buildXPayload()-style helper ...
  if (isRateLimited(`email:${payload.email}`)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const service = createServiceClient()
  // ... service-role reads/writes only ...
}
```
Apply this shape verbatim for `check-invite`; the response body should be the enumeration-mitigated shape RESEARCH's Pattern 2 shows (`{ allowed, existingAccount }`), with `isArtistEmailAllowed()` (see `lib/invites/allowlist.ts` below) as the TS-side mirror of the trigger's SQL predicate.

---

### `app/api/waitlist/route.ts` and `app/api/waitlist/resubscribe/route.ts` (routes, public writes)

**Analog:** `app/api/sync/register/route.ts` (full file) — same public-write shape, plus the upsert idiom below for D-19's auto-resubscribe.

**Upsert-with-resubscribe pattern** (from RESEARCH, matching this repo's `ON CONFLICT` conventions used elsewhere e.g. `buyer_orgs`/`collaborators`):
```sql
INSERT INTO public.artist_waitlist (email, name, note)
VALUES (LOWER($1), $2, $3)
ON CONFLICT (email_lower) DO UPDATE
  SET name = EXCLUDED.name,
      note = EXCLUDED.note,
      unsubscribed_at = NULL,   -- D-19: rejoining auto-resubscribes
      updated_at = NOW();
```
Add Turnstile verification (`lib/security/turnstile.ts`) as an extra gate before the DB write, fail-closed on verification errors (see turnstile pattern below).

---

### `lib/security/turnstile.ts` (utility, request-response)

**No direct in-repo analog** — new integration surface. Use the RESEARCH-provided verified pattern directly:
```typescript
export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
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
    return false // fail closed
  }
}
```
Follow this codebase's env-var discipline: `TURNSTILE_SECRET_KEY` server-only (read only inside the API route, matching how `RESEND_API_KEY` is read only inside `lib/email/index.ts`); `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is the only public key.

---

### `app/api/signup/invite/[token]/route.ts` (route, deep-link resolve)

**Analog:** `app/api/collaborators/[id]/invite/route.ts` — token generation/expiry conventions (reverse direction: this route *resolves* a token instead of issuing one).

**Token generation to reuse** (collaborators invite route, lines 60-72):
```typescript
const inviteToken = generateApprovalToken()
const expiresAt = new Date()
expiresAt.setDate(expiresAt.getDate() + APPROVAL_TOKEN_EXPIRY_DAYS)

const { error: insertError } = await supabase.from('collaborator_invites').insert({
  collaborator_id: id,
  inviting_user_id: user.id,
  invited_email: collaborator.email,
  invite_token: inviteToken,
  status: 'pending',
  token_expires_at: expiresAt.toISOString(),
})
```
Import `generateApprovalToken`/`APPROVAL_TOKEN_EXPIRY_DAYS` from `lib/split-sheets/approval.ts` directly — do not write a second token generator (RESEARCH "Don't Hand-Roll"). The resolve route looks up `artist_invites` by `invite_token`, returns `{ email, inviterName, expired }`; expired → re-request state per D-09.

---

### `app/(auth)/signup/page.tsx` (modified, component, request-response)

**Analog:** itself — current file (full text read above) is the baseline to extend into the `gate → checking → allowed|existing-account|denied→waitlist` state machine.

**Reusable pieces verbatim:**
- `inputClass` constant (line 7-8).
- Card shell: `rounded-xl border border-white/10 bg-white/[0.03] p-6` (line 58).
- Error block: `rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200` (lines 96-98).
- Primary button: `w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40` + `submitting ? 'Creating account…' : 'Create account'` present-participle convention (lines 101-107) — new "Checking…" state matches this exactly.
- The existing unmodified `<form onSubmit={handleSubmit}>` (email/password fields, lines 62-93) becomes the `allowed` state's rendered content, with `"You're invited ✓"` inserted above the `<h1>`.

The `signUp()` call itself (lines 24-28) is unchanged — D-02 confirms the server (trigger) is the real gate; the client only adds a pre-check UX layer in front of the same call.

---

### `app/unsubscribe/page.tsx` (new, component)

**Analog:** `app/(auth)/signup/page.tsx` — reuse the exact card shell (`rounded-xl border border-white/10 bg-white/[0.03] p-6`), `inputClass`, and the `sent`-boolean state-swap pattern (lines 39-55 showing a post-submit success card replacing the form in place) for the unsubscribed/resubscribed confirmation states.

---

### `app/(admin)/admin/artist-invites/page.tsx` (new, server component page)

**Analog:** `app/(admin)/admin/team-members/page.tsx` (full file, 44 lines) — page shell, auth/role check, service-client list fetch.

**Page shell + role gate pattern** (lines 1-24):
```typescript
export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'

export default async function AdminArtistInvitesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const role = getStaffRole(user)
  if (!role) redirect('/') // any staff role allowed (D-06), unlike team-members' leadership-only gate

  const service = createServiceClient()
  const { data: waitlist } = await service
    .from('artist_waitlist')
    .select('id, email, name, note, unsubscribed_at, converted_to_invite_at, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-[color:var(--ink)]">Artist Invites</h1>
      <ArtistInvitesAdmin initialWaitlist={waitlist ?? []} isLeadership={role === 'leadership'} />
    </div>
  )
}
```
Pass `isLeadership` as a boolean prop (per UI-SPEC surface 5) to conditionally render the "Reopen & broadcast" button — never hide it via CSS alone.

---

### `components/admin/ArtistInvitesAdmin.tsx` (new, client component)

**Analog:** `components/admin/StaffAdmin.tsx` (referenced by team-members page as the themed `.fncon` list component — read it directly during implementation for the exact row/action markup; not reproduced here due to non-overlap budget, but it is the correct analog for: themed row list on `var(--panel)`/`var(--border)`, right-aligned row actions, and the admin add/edit inline pattern).

Two-step destructive confirm for "Reopen & broadcast" should mirror `CollaboratorForm`'s delete-confirm exactly (per UI-SPEC): inline text + solid `bg-rose-500/90 hover:bg-rose-500` "Yes, send" + text-only "Cancel".

---

### `lib/email/artistInvite.ts`, `artistSpotOpened.ts`, `artistReopened.ts` (new, service/email)

**Analogs:** `lib/email/industryInvite.ts` + `lib/email/staffInvite.ts` (magic-link template shape, `esc()` duplication to extract) and `app/api/collaborators/[id]/invite/route.ts`'s inline email (HTML + text fallback bar).

**`esc()` helper, currently duplicated — extract to `lib/email/esc.ts`** (identical in both `industryInvite.ts` lines 11-17 and `staffInvite.ts` lines 8-14):
```typescript
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
```

**Template export shape** (`industryInvite.ts` lines 19-27):
```typescript
export function industryInviteEmail(args: { displayName: string; actionLink: string }): {
  subject: string
  html: string
} {
  const { displayName, actionLink } = args
  return {
    subject: 'You have been invited to Funūn',
    html: `<p>Hi ${esc(displayName)},</p>...<p><a href="${esc(actionLink)}">Sign in to Funūn</a></p>`,
  }
}
```
Phase 27's three templates must ADD a `text` field to this return shape (raising the bar per UI-SPEC surface 6) — copy the HTML+text dual-body pattern from `app/api/collaborators/[id]/invite/route.ts` lines 83-127 (the `sendEmail({ to, subject, html, text })` call shape), and use the brand gradient CTA button (`background: linear-gradient(105deg,#818CF8 0%,#D946EF 100%)`) instead of the flat `#818CF8` seen in that file's existing button (line 106) — D-17 upgrade.

---

### `components/collaborators/CollaboratorInvitePrompt.tsx` (new)

**Analog:** `components/collaborators/CollaboratorForm.tsx` — inline-swap convention (the form itself replaces the "Add collaborator" button in place; same convention applies here — render as a transient inline panel, not a modal). Reuses the existing `POST /api/collaborators/[id]/invite` endpoint unchanged (see route excerpt above) — this is a new entry point into the same send action, not a new send mechanism, matching UI-SPEC surface 4's explicit instruction.

---

## Shared Patterns

### Zero-RLS-policy + service-role-only tables
**Source:** `supabase/migrations/089_funun_staff_and_audit.sql`
**Apply to:** `artist_invites`, `artist_waitlist` (migration 097) and every API route reading/writing them.
```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
-- no CREATE POLICY statements
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.<table> FROM authenticated, anon;
```

### Public-route rate limiting + enumeration-safe responses
**Source:** `app/api/sync/register/route.ts`
**Apply to:** `check-invite`, `waitlist`, `waitlist/resubscribe` routes (via extracted `lib/security/rate-limit.ts`).

### Email `esc()` HTML-escaping
**Source:** `lib/email/industryInvite.ts` / `lib/email/staffInvite.ts`
**Apply to:** all three new branded templates (extract to `lib/email/esc.ts`).

### Exception-isolated secondary writes inside `handle_new_user()`
**Source:** `supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql` (the `claim_collaborators` `BEGIN...EXCEPTION WHEN OTHERS THEN NULL; END;` block)
**Apply to:** the new gate's `UPDATE artist_invites SET status='accepted'...` step, if the planner decides it should not itself risk rolling back a successful signup.

### Staff-action audit trail
**Source:** `lib/staff/` `logStaffAction()` (Phase 25)
**Apply to:** convert-to-invite and broadcast admin routes — every staff mutation in this codebase writes through this single audit call.

### Invite token generation
**Source:** `lib/split-sheets/approval.ts` `generateApprovalToken()` / `APPROVAL_TOKEN_EXPIRY_DAYS`
**Apply to:** `artist_invites.invite_token`, `artist_waitlist.unsubscribe_token`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/security/turnstile.ts` | utility | request-response | First captcha integration in this codebase — zero prior Turnstile/hCaptcha/reCAPTCHA references found by grep; implemented directly from RESEARCH's verified Cloudflare `siteverify` pattern, not from an in-repo precedent. |
| `app/api/admin/artist-invites/broadcast/route.ts` (bulk-send loop + idempotency guard) | route | batch | No existing bulk-email-to-many-recipients route exists in this codebase (all prior email sends are 1:1 transactional); closest partial analog is `routeLead()`'s best-effort single-recipient side-effect pattern in `sync/register`, scaled up — treat as a new pattern, not a reuse.

## Metadata

**Analog search scope:** `supabase/migrations/`, `app/(auth)/`, `app/api/sync/`, `app/api/collaborators/`, `app/api/claim-collaborators/`, `app/(admin)/`, `components/admin/`, `components/collaborators/`, `lib/email/`, `lib/staff/`, `lib/collaborators/`, `lib/split-sheets/`
**Files scanned:** ~15 read directly (migrations 018/076/089, `app/(auth)/signup/page.tsx`, `app/api/sync/register/route.ts`, `app/api/collaborators/[id]/invite/route.ts`, `lib/email/industryInvite.ts`, `lib/email/staffInvite.ts`, `app/(admin)/admin/team-members/page.tsx`) + full RESEARCH.md/CONTEXT.md/UI-SPEC.md cross-reference for the remainder
**Pattern extraction date:** 2026-08-09
