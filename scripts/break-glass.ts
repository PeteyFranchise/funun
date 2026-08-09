#!/usr/bin/env node
// ─── Break-glass CLI — owner-only self-lockout escape hatch ───────────────
// Phase 27 (artist-invite-only-onboarding), extends plan 27-11's scope.
// D-18 / INVITE-11 / threat T-27-17: migration 098 gates the DEFAULT
// (artist) branch of handle_new_user() behind an invite check. Once that
// gate is live, EVERY new artist signup requires a matching artist_invites
// row (or a collaborators row). This tool exists so the owner can ALWAYS
// mint a way in — even if every existing account is inaccessible — without
// touching the Supabase dashboard's SQL editor (though docs/BREAK-GLASS.md
// documents the raw-SQL equivalent for when this repo itself is
// unreachable too).
//
// Two subcommands:
//   grant-artist-invite <email>  — idempotent owner_seed artist_invites row
//                                  so <email> can self-serve sign up as an
//                                  artist through the normal /signup form.
//   create-staff <email> [role]  — an UNGATED Team Member (admin) account.
//                                  Staff provisioning is a fully separate
//                                  handle_new_user() branch (migration 086)
//                                  that RETURNs NEW before the artist-branch
//                                  gate is ever reached — reusing
//                                  lib/staff/createStaffAccount.ts here is
//                                  what makes this path immune to the gate
//                                  by construction, not by a parallel
//                                  reimplementation that could drift.
//
// SERVICE-ROLE ONLY. Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_
// ROLE_KEY from the environment (or .env.local for local use) and refuses
// to run without both. NEVER logs either value.
//
// GUARDRAIL: this is an operator tool, run directly via `npm run
// break-glass -- <command> ...` (see package.json). Nothing under app/,
// components/, or lib/ imports this file, and nothing should — nothing
// here belongs in a request-serving code path.

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ARTIST_INVITE_SOURCE_VALUES, type ArtistInviteSource } from '@/lib/invites/schema'
import { createStaffAccount, DuplicateStaffAccountError } from '@/lib/staff/createStaffAccount'
import { ALL_STAFF_ROLES, type StaffRole } from '@/lib/admin/staff-role'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Must be a value migration 097's `source` CHECK constraint accepts (see
// lib/invites/schema.ts, the single TS source of truth) — 'owner_seed' is
// the exact value that vocabulary reserves for this bootstrap/break-glass
// use case.
const OWNER_SEED_SOURCE: ArtistInviteSource = ARTIST_INVITE_SOURCE_VALUES.includes('owner_seed')
  ? 'owner_seed'
  : ARTIST_INVITE_SOURCE_VALUES[0]

const DEFAULT_STAFF_ROLE: StaffRole = 'leadership'

// ─── env ────────────────────────────────────────────────────────────────

export class MissingEnvError extends Error {}

// Dependency-free .env.local loader — mirrors what Next's dev/build process
// does automatically, but this script runs OUTSIDE Next. Only fills in vars
// that are not already set in the real environment (real env always wins),
// and is a pure best-effort read: a missing/unreadable .env.local is not an
// error, since real shell env vars are a perfectly valid way to run this.
function loadDotEnvLocal(): void {
  const envPath = resolve(__dirname, '..', '.env.local')
  if (!existsSync(envPath)) return

  let contents: string
  try {
    contents = readFileSync(envPath, 'utf8')
  } catch {
    return
  }

  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
    if (isQuoted) value = value.slice(1, -1)
    if (key && !(key in process.env)) {
      process.env[key] = value
    }
  }
}

// Throws with a clear, actionable message — never prints either value, only
// which ones are missing.
export function assertEnv(): void {
  const missing: string[] = []
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length > 0) {
    throw new MissingEnvError(
      `Missing required env var(s): ${missing.join(', ')}. Set them in your shell, or in .env.local ` +
        `for local use. Refusing to run without service-role credentials — this tool bypasses RLS ` +
        `and the artist-signup gate, on purpose.`
    )
  }
}

// A standalone script, not a Next request — instantiates @supabase/supabase-js
// directly rather than importing lib/supabase/server's createServiceClient
// (which pulls in next/headers, a Next-request-scoped module this script has
// no business depending on for the grant-artist-invite path).
export function getServiceClient(): SupabaseClient {
  assertEnv()
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ─── arg parsing ────────────────────────────────────────────────────────

export type ParsedArgs =
  | { command: 'grant-artist-invite'; email: string }
  | { command: 'create-staff'; email: string; role: StaffRole }
  | { command: 'help' }
  | { command: 'error'; message: string }

export function normalizeEmail(raw: string): string {
  const trimmed = (raw ?? '').trim().toLowerCase()
  return EMAIL_REGEX.test(trimmed) ? trimmed : ''
}

export function resolveStaffRole(raw: string | undefined): StaffRole | null {
  if (raw === undefined) return DEFAULT_STAFF_ROLE
  return (ALL_STAFF_ROLES as string[]).includes(raw) ? (raw as StaffRole) : null
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { command: 'help' }
  }

  if (command === 'grant-artist-invite') {
    const email = normalizeEmail(rest[0] ?? '')
    if (!email) {
      return { command: 'error', message: 'Usage: grant-artist-invite <email> — a valid email is required.' }
    }
    return { command: 'grant-artist-invite', email }
  }

  if (command === 'create-staff') {
    const email = normalizeEmail(rest[0] ?? '')
    if (!email) {
      return { command: 'error', message: 'Usage: create-staff <email> [role] — a valid email is required.' }
    }
    const role = resolveStaffRole(rest[1])
    if (!role) {
      return {
        command: 'error',
        message: `Invalid role "${rest[1]}". Must be one of: ${ALL_STAFF_ROLES.join(', ')}.`,
      }
    }
    return { command: 'create-staff', email, role }
  }

  return { command: 'error', message: `Unknown command "${command}".` }
}

function printHelp(): void {
  console.log(`
Break-glass — owner-only self-lockout escape hatch (Phase 27, D-18/T-27-17)

Usage:
  npm run break-glass -- grant-artist-invite <email>
  npm run break-glass -- create-staff <email> [role]

Commands:
  grant-artist-invite <email>   Idempotent owner_seed artist_invites row so
                                 <email> can self-serve sign up as an artist
                                 at /signup.

  create-staff <email> [role]   Create an UNGATED Team Member (admin)
                                 account (bypasses the artist invite gate —
                                 a different handle_new_user() branch).
                                 role defaults to "${DEFAULT_STAFF_ROLE}";
                                 valid roles: ${ALL_STAFF_ROLES.join(', ')}.

Env (required, never logged):
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  (read from your shell, or from .env.local for local use)

See docs/BREAK-GLASS.md for the full runbook, including a raw-SQL
equivalent for each layer runnable from the Supabase Dashboard SQL editor.
`)
}

// ─── artist_invites payload ────────────────────────────────────────────

export type GrantInvitePayload = {
  email: string
  status: 'pending'
  source: ArtistInviteSource
  invite_token: null
  token_expires_at: null
}

// No invite_token/expiry — migration 098's gate treats a NULL
// token_expires_at as never-expiring, and the token itself only matters for
// the deep-link (/signup?invite=<token>) UX, not the plain email/password
// /signup form this command exists to unblock.
export function buildGrantInvitePayload(email: string): GrantInvitePayload {
  return {
    email,
    status: 'pending',
    source: OWNER_SEED_SOURCE,
    invite_token: null,
    token_expires_at: null,
  }
}

// ─── grant-artist-invite ────────────────────────────────────────────────

type InviteRow = { id: string; status: string }

// Idempotent: a pending row is left untouched; an existing row in any other
// state (accepted, expired) is reactivated to pending/owner_seed rather
// than duplicated — artist_invites has a non-unique case-insensitive index
// on email (migration 097), not a unique constraint, so "insert or update"
// is done explicitly here rather than via ON CONFLICT.
export async function runGrantArtistInvite(service: SupabaseClient, email: string): Promise<void> {
  const { data: existingRows, error: selectError } = await service
    .from('artist_invites')
    .select('id, status')
    .ilike('email', email)
    .order('created_at', { ascending: false })
    .limit(1)

  if (selectError) {
    throw new Error(`Lookup failed: ${selectError.message}`)
  }

  const existing = ((existingRows ?? []) as InviteRow[])[0]

  if (existing && existing.status === 'pending') {
    console.log(`OK — ${email} already has a pending artist_invites row (id ${existing.id}). No changes made.`)
    console.log(`     ${email} can self-serve sign up now at /signup.`)
    return
  }

  if (existing) {
    const { error: updateError } = await service
      .from('artist_invites')
      .update({
        status: 'pending',
        source: OWNER_SEED_SOURCE,
        invite_token: null,
        token_expires_at: null,
        accepted_user_id: null,
        accepted_at: null,
      })
      .eq('id', existing.id)

    if (updateError) {
      throw new Error(`Reactivation failed: ${updateError.message}`)
    }

    console.log(
      `OK — reactivated artist_invites row ${existing.id} for ${email} (was "${existing.status}", now "pending", source="${OWNER_SEED_SOURCE}").`
    )
    console.log(`     ${email} can self-serve sign up now at /signup.`)
    return
  }

  const payload = buildGrantInvitePayload(email)
  const { data: inserted, error: insertError } = await service
    .from('artist_invites')
    .insert(payload)
    .select('id')
    .maybeSingle()

  if (insertError || !inserted) {
    throw new Error(`Insert failed: ${insertError?.message ?? 'unknown error'}`)
  }

  console.log(
    `OK — granted artist invite: inserted artist_invites row ${(inserted as { id: string }).id} for ${email} (status=pending, source=${OWNER_SEED_SOURCE}).`
  )
  console.log(`     ${email} can self-serve sign up now at /signup.`)
}

// ─── create-staff ───────────────────────────────────────────────────────

// Reuses lib/staff/createStaffAccount.ts rather than reimplementing account
// creation — that helper's cleanup/rollback discipline (compensating delete
// on partial failure) applies here for free, and staying on the one real
// implementation means this command can never drift from the app's own
// staff-creation behavior.
export async function runCreateStaff(service: SupabaseClient, email: string, role: StaffRole): Promise<void> {
  try {
    const { userId, emailSent } = await createStaffAccount({
      email,
      displayName: email,
      staffRole: role,
    })

    console.log(`OK — created ungated Team Member account: ${email} (user_id ${userId}, staff_role=${role}).`)
    console.log(`     Invite email sent: ${emailSent ? 'yes' : 'no (RESEND_API_KEY unset or delivery failed)'}`)

    // Mint a fresh one-time sign-in link too — break-glass callers may be
    // here BECAUSE email delivery is unavailable, so don't rely on it alone.
    const { data: link, error: linkError } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (linkError || !link?.properties?.action_link) {
      console.log('     Could not mint a fresh sign-in link — the invite email above is the fallback.')
    } else {
      console.log(`     Sign in immediately with this one-time link: ${link.properties.action_link}`)
    }
  } catch (err) {
    if (err instanceof DuplicateStaffAccountError) {
      console.log(`SKIP — ${email} already has an account: ${err.message}`)
      console.log('       If this is the same person, have them sign in normally at /signin.')
      return
    }
    throw err
  }
}

// ─── entrypoint ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2))

  if (parsed.command === 'help') {
    printHelp()
    return
  }

  if (parsed.command === 'error') {
    console.error(`Error: ${parsed.message}\n`)
    printHelp()
    process.exitCode = 1
    return
  }

  const service = getServiceClient()

  if (parsed.command === 'grant-artist-invite') {
    await runGrantArtistInvite(service, parsed.email)
    return
  }

  await runCreateStaff(service, parsed.email, parsed.role)
}

if (require.main === module) {
  loadDotEnvLocal()
  main().catch((err) => {
    console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
}
