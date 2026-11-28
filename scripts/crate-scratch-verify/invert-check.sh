#!/bin/bash
# Invert one assertion per DISTINCT failure branch and require a nonzero exit.
# The previous round inverted one branch per FILE, which is how the untallied
# superuser, wrong-mechanism and outcome-pair branches survived.
run() { node "$1" > /dev/null 2>&1; echo $?; }
check() {
  f=$1; desc=$2; sedexpr=$3
  cp "$f" "$f.bak"; sed -i '' "$sedexpr" "$f"
  code=$(run "$f"); mv "$f.bak" "$f"
  if [ "$code" -ne 0 ]; then printf "  CAUGHT      %-28s %s\n" "$f" "$desc"
  else printf "  *** MISSED *** %-25s %s\n" "$f" "$desc"; fi
}
check probe-privileges.mjs "service_role write expected allowed"  "s/'refused')/'allowed')/"
check probe-privileges.mjs "superuser UPDATE tally"               "s/holes++; console.log('\*\*\* HOLE \*\*\*  superuser UPDATE/console.log('*** HOLE ***  superuser UPDATE/"
check probe-truncate.mjs   "wrong-mechanism branch"               "s/if (!byTrigger) bad++/if (false) bad++/"
check probe-truncate.mjs   "over-broad mutable branch"            "s/bad++; console.log('\*\*\* OVER-BROAD/console.log('*** OVER-BROAD/"
check probe-concurrency.mjs "outcome-pair assertion"              "s/\&\& pair === 'created + replayed'/\&\& pair === 'nonsense'/"
check probe-concurrency.mjs "enqueue-blocked assertion"           "s/if (enqueueResolved !== false) failures++/if (false) failures++/"
check probe-capture-vs-reject.mjs "both-branches requirement"     "s/ok(sawAdmitted,/ok(!sawAdmitted,/"
check probe-rls.mjs        "must-fail control"                    "s/ok(died,/ok(!died,/"
check probe-rls.mjs        "positive half"                        "s/ok(capturable,/ok(!capturable,/"
check probe-replay-status.mjs "withdrawn refusal"                 "s|/no longer admitted/|/never matches/|"
check probe-codes.mjs      "SQLSTATE match"                       "s/e.code === '23505'/e.code === 'NEVER'/"
