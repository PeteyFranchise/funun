#!/bin/bash
# Round two of the inversion test. The four "misses" were my own method: I
# removed the tally from branches that never execute on the happy path, so
# nothing changed. Make each branch actually FIRE instead.
run() { node "$1" > /dev/null 2>&1; echo $?; }
check() {
  f=$1; desc=$2; sedexpr=$3
  cp "$f" "$f.bak"; sed -i '' "$sedexpr" "$f"
  code=$(run "$f"); mv "$f.bak" "$f"
  if [ "$code" -ne 0 ]; then printf "  CAUGHT      %-28s %s\n" "$f" "$desc"
  else printf "  *** MISSED *** %-25s %s\n" "$f" "$desc"; fi
}
# make the branch fire, rather than deleting its counter
check probe-privileges.mjs "superuser-UPDATE branch fires"  "s/catch (e) { console.log('OK    superuser UPDATE refused/catch (e) { holes++; console.log('OK    superuser UPDATE refused/"
check probe-truncate.mjs   "wrong-mechanism branch fires"   "s|const byTrigger = /append-only/.test(e.message)|const byTrigger = /NEVERMATCHES/.test(e.message)|"
check probe-truncate.mjs   "over-broad branch fires"        "s/TRUNCATE public.crate_capture_orphans/TRUNCATE public.crate_quality_reviews/"
check probe-concurrency.mjs "enqueue-blocked branch fires"  "s/if (enqueueResolved !== false) failures++/if (enqueueResolved === false) failures++/"
