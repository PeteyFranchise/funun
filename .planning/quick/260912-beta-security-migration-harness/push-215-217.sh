#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
if [[ "$mode" != "--dry-run" && "$mode" != "--apply" ]]; then
  echo "Usage: $0 --dry-run|--apply" >&2
  exit 64
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN is required." >&2
  exit 65
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
migration_218="$repo_root/supabase/migrations/218_auth_diagnostic_events.sql"
hold_dir="$(mktemp -d "${TMPDIR:-/tmp}/funun-218-hold.XXXXXX")"
held_218="$hold_dir/218_auth_diagnostic_events.sql"

restore_218() {
  if [[ -f "$held_218" ]]; then
    mv "$held_218" "$migration_218"
  fi
  rmdir "$hold_dir" 2>/dev/null || true
}
trap restore_218 EXIT INT TERM

if [[ ! -f "$migration_218" ]]; then
  echo "Expected migration 218 at $migration_218; refusing to continue." >&2
  exit 66
fi

mv "$migration_218" "$held_218"
cd "$repo_root"

if [[ "$mode" == "--dry-run" ]]; then
  npx supabase db push --linked --skip-vault --dry-run
else
  npx supabase db push --linked --skip-vault
fi
