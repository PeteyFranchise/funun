#!/bin/bash
# Mutation check for the probe harness: invert one assertion per DISTINCT
# failure branch and require the probe to exit nonzero.
#
# LOW (review 2026-11-28): the first version printed "*** MISSED ***" and exited
# ZERO — the exact defect it had just been used to remove from the probes, left
# in the thing that checks the probes. It now counts misses and exits nonzero,
# and restores every file through a trap so an interrupted run cannot leave a
# mutated probe behind.
set -u
misses=0
touched=()
restore() { for f in "${touched[@]:-}"; do [ -f "$f.bak" ] && mv "$f.bak" "$f"; done; }
trap restore EXIT INT TERM

check() {
  local f=$1 desc=$2 sedexpr=$3
  cp "$f" "$f.bak"; touched+=("$f")
  sed -i '' "$sedexpr" "$f"
  node "$f" > /dev/null 2>&1
  local code=$?
  mv "$f.bak" "$f"
  if [ "$code" -ne 0 ]; then
    printf "  CAUGHT          %-30s %s\n" "$f" "$desc"
  else
    misses=$((misses + 1))
    printf "  *** MISSED ***  %-30s %s\n" "$f" "$desc"
  fi
}

echo "=== assertion branches ==="
check probe-privileges.mjs       "service_role write expected allowed" "s/'refused')/'allowed')/"
check probe-concurrency.mjs      "outcome-pair assertion"              "s/&& pair === 'created + replayed'/\&\& pair === 'nonsense'/"
check probe-capture-vs-reject.mjs "both-branches requirement"          "s/ok(sawAdmitted,/ok(!sawAdmitted,/"
check probe-rls.mjs              "must-fail control"                   "s/ok(died,/ok(!died,/"
check probe-rls.mjs              "positive half"                       "s/ok(capturable,/ok(!capturable,/"
check probe-replay-status.mjs    "withdrawn refusal"                   "s|/no longer admitted/|/never matches/|"
check probe-codes.mjs            "SQLSTATE match"                      "s/e.code === '23505'/e.code === 'NEVER'/"

# These branches only execute when something fails, so removing their counter
# changes nothing. They must be made to FIRE. An earlier run reported four
# false misses by mutating them the other way.
echo "=== failure-only branches, made to fire ==="
check probe-privileges.mjs  "superuser-UPDATE branch fires" "s/catch (e) { console.log('OK    superuser UPDATE refused/catch (e) { holes++; console.log('OK    superuser UPDATE refused/"
check probe-truncate.mjs    "wrong-mechanism branch fires"  "s|const byTrigger = /append-only/.test(e.message)|const byTrigger = /NEVERMATCHES/.test(e.message)|"
check probe-truncate.mjs    "over-broad branch fires"       "s/TRUNCATE public.crate_capture_orphans/TRUNCATE public.crate_quality_reviews/"
check probe-concurrency.mjs "enqueue-blocked branch fires"  "s/if (enqueueResolved !== false) failures++/if (enqueueResolved === false) failures++/"

echo
if [ "$misses" -eq 0 ]; then
  echo "ALL MUTATIONS CAUGHT"
else
  echo "$misses MUTATION(S) NOT CAUGHT"
fi
exit $(( misses == 0 ? 0 : 1 ))
