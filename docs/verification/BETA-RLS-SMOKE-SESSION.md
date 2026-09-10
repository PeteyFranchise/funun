# Workspace Access Smoke Test — Beta Screenshare Protocol

**For the Funūn team.** This is the script a team member runs on a screenshare
with beta testers to verify that workspace sharing actually protects artists'
catalogues.

**Source of truth:** `.planning/phases/38-member-organization-team-workspaces/38-RLS-SMOKE-CHECKLIST.md`
(57 boxes). This document is how that checklist gets executed with real people
instead of six fabricated accounts.

---

## Why a screenshare, and not "just use it and tell us"

Most of what we are testing is a **negative**: that someone CANNOT reach
something. Ordinary use never surfaces a negative failure.

> A user tells you immediately when they cannot reach something they should.
> A user will never tell you they CAN reach something they should not — that
> failure is silent, and it looks exactly like the product working.

So a facilitator watches the screen and asks for specific actions. The
facilitator is the instrument. The tester is just driving.

**Every check below is a PAIR:** one action that must be refused, and one that
must succeed. A refusal on its own proves nothing — it could be a network
error, a typo, or an unrelated outage. Only refusal-plus-success proves the
gate is the thing doing the refusing. (This design is what caught the
invitation-redemption bug in migration 199; a refusal-only test had passed it.)

---

## Who you need

Six roles. **Three beta testers plus two team accounts covers all six**, because
role E is role C after you remove them.

| Role | Who | What they are |
|------|-----|---------------|
| **A** | Beta tester 1 | An artist who owns a project |
| **B** | Team account | Workspace owner — creates the workspace, proposes, attaches, grants |
| **C** | Beta tester 2 | Workspace member WITH a grant to A's project |
| **D** | Beta tester 3 | Workspace member with NO grant |
| **E** | = C, later | C after being removed from the workspace |
| **F** | Team account | Unrelated outsider — the control |

**Record who played which role.** A "pass" that cannot be attributed to a role
is not a pass.

---

## Before the session (facilitator, 10 minutes)

- [ ] Confirm B's workspace exists and is empty of A's content
- [ ] Confirm A has at least one project with **audio uploaded** (needed for
      the clean-master check) and at least one other project that will stay
      unattached (needed for narrowing)
- [ ] Confirm C and D are both members of B's workspace, C and D both
      **without** grants yet
- [ ] Have the D-56 workspace access switch **ON** for the session
- [ ] Open a scratch doc to record verbatim error text — "it didn't work" is
      not a result; the exact message is

---

## Session 1 — Nothing is granted by proposing (§1)

**What this proves:** naming an artist on a roster gives you nothing. Consent
is required. If this fails, workspaces can claim artists unilaterally.

1. **B** proposes a roster relationship naming **A**. Do not attach, do not grant.
2. **Ask B:** "Open the workspace. Can you see any of A's projects, tracks,
   files or documents?"
   - **PASS:** no. The roster shows a pending proposal and nothing else.
   - **FAIL:** any of A's content is visible.
3. **Ask C and D** the same. Same expected answer.
4. **Ask A:** "Do you see a claim naming you?"
   - **PASS:** yes — A can see they've been named. *(This is the positive
     control. If A sees nothing either, the whole screen may just be broken.)*

---

## Session 2 — Accepting, attaching, granting (§2, §3)

**What this proves:** access works when it should, and reaches exactly one
project — not the artist's whole catalogue.

1. **A** accepts the relationship.
2. **B** attaches ONE of A's projects. Leave the other unattached.
3. **B** issues C an operational grant on that project.
4. **Ask C:** "Open the workspace. What can you see?"
   - **PASS:** the attached project, and only that one.
   - **FAIL — record loudly:** A's *other* project is visible. That is
     catalogue-wide exposure from a single-project grant.
5. **Ask D:** "Same workspace. What do you see?"
   - **PASS:** D sees the workspace but cannot open A's project.
   - This is the negative half. C's success above is its positive control.

---

## Session 3 — The clean master (§5) — HIGHEST STAKES

**What this proves:** a collaborator can work on a project without being handed
the unwatermarked master. If this fails, a grant is a free download of the
artist's finished record.

**Facilitator: watch the screen yourself. Do not accept "looks fine".**

1. **Ask C:** "Play the track. Then try every way you can find to download or
   export the audio — download buttons, right-click Save As, share links."
2. Watch for: is anything offered that is not the watermarked preview?
   - **PASS:** C can listen. C cannot obtain an unwatermarked file.
   - **FAIL:** any download yields a clean master.
3. **Positive control — ask A:** "Can you download your own master?"
   - **PASS:** yes. *(If A also can't, the file may simply be missing, and
     C's refusal proved nothing.)*
4. Record the exact wording of any refusal.

---

## Session 4 — Payout data (§6)

**What this proves:** a workspace grant never reaches banking or payout
information.

1. **Ask C:** "Look for anything about A's payouts, earnings, bank details or
   tax information anywhere in the workspace or on A's project."
   - **PASS:** nothing. Not blank fields — the surfaces should not be there.
2. **Positive control — ask A:** "Can you see your own payout settings?"
   - **PASS:** yes.

---

## Session 5 — Removal actually revokes (§7)

**What this proves:** removing someone ends their access immediately, not at
the next login or cache expiry.

1. With **C still logged in and the project open on screen**, have **B**
   remove C from the workspace. C is now role **E**.
2. **Ask C to refresh** — not log out, just refresh.
   - **PASS:** access is gone. Record the exact message.
   - **FAIL:** the project still loads. Note whether it survives a hard
     refresh and a re-login — that distinguishes a stale cache from a
     revocation that never happened.
3. **Positive control — ask D** (still a member, still ungranted): "Can you
   still see the workspace itself?"
   - **PASS:** yes. *(Proves the workspace didn't just break for everyone.)*

---

## Session 6 — The outsider control (§11)

**What this proves:** none of this changed anything for users outside the
workspace. Cheap, and it catches a policy that accidentally widened.

1. **Ask F:** "Walk through your normal Funūn session — dashboard, vault,
   Green Room."
   - **PASS:** everything behaves as it did before.
   - **FAIL:** anything of A's or B's is visible to F.

---

## What the team keeps — do NOT put these in front of beta users

| Check | Why it stays internal |
|-------|-----------------------|
| §8a / §8b — D-56 kill switch off, on, fails closed | These are owner actions on a production switch, not user actions |
| §10 — performance measurement | A measurement, not a yes/no; needs instrumentation |
| §9 — recursion check | Structural, not observable from the UI |
| §7 negative half | Confirming E's access is gone at the DATA layer, not just the screen |

---

## Recording results

For each session write down: **role, action, exact result, verbatim error
text.** Then tick the corresponding boxes in `38-RLS-SMOKE-CHECKLIST.md`,
naming who played which role and the session date.

**A row is only ticked when its positive control also passed.** A refusal with
no matching success is UNPROVEN, not PASS. Say so in the notes rather than
rounding up — the whole point of this document is that a false all-clear here
is worse than an open box.

---

## The two rows worth automating instead

**§5 (clean master) and §6 (payout) are the highest-stakes and the most
fragile to re-verify by hand.** Both are "X must never appear in a
workspace-scoped response". That is checkable in code:

Before a workspace-scoped payload is returned, scan it for anything shaped like
a storage path, a signed URL, or a payout field. Throw in development; strip
and alert in production. The workspace catalogue reader **already** guarantees
it never resolves or returns a storage path (plan 38.0.1-11 states this as an
invariant) — this makes the guarantee self-enforcing rather than remembered.

Why that beats a manual tick: it observes real traffic, it keeps holding after
the next refactor, and it notices exactly the failure a user never would.

Its limit, stated honestly: it only sees traffic that actually happens. If no
beta user ever holds a grant, it observes nothing and proves nothing. It is
strictly better than the manual check, not a substitute for real usage.
