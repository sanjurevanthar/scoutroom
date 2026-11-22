# Session 09b prompt: fix stuck runs (reliability issue 1)

SESSION 09b: Fix reliability issue #1 (HIGH): a crashed run blocks the room.
Read CLAUDE.md (follow the Git workflow) and docs/design/13-reliability.md,
06, 07. Branch fix/stuck-runs from an up-to-date main. Time-box: 45 minutes.

PROBLEM: if the scout job crashes, the run stays "running" forever and the
room lock is never released, so nobody can run in that room again.

FIX (keep it small and safe):
1. Heartbeat: add lastProgressAt to runs. Set it when the run starts and
   every time a step begins/ends.
2. Stale rule in ONE pure function, e.g. isRunStale(run, now, staleMs):
   status is queued/running AND now - lastProgressAt > staleMs.
   staleMs comes from a setting STALE_RUN_MS (default 180000 = 3 min);
   tests set it small (e.g. 3000).
3. Lazy reaper in startRun: if the room's lock belongs to a stale run, mark
   that run "failed" with the message "Run stopped responding: marked as
   failed", release the lock, then continue the normal start. If the
   existing run is NOT stale, refuse as today ("a run is already active").
   Check every write's result; if the reaping fails, refuse cleanly.
4. If the job ever resumes after being reaped, it must see status "failed"
   at the next step boundary and stop without saving cards.
5. Issue #2: if judging the lock by progress (instead of the fixed 15-minute
   TTL) is part of this same change, do it; otherwise leave #2 for the future.
6. UI: if the latest run is running but stale, show "This run seems stuck.
   Click Run scout to start a new one." (owner/researcher).
Don't change the quota rules, retries or card saving (issues 3–6 stay
future, as documented).

CHECKS (fake providers only):
- Unit: isRunStale (fresh, stale, done/failed never stale, edge at threshold).
- E2E/server, using a fake provider marker like [fake:hang] that never
  finishes:
  a) a run hangs → after STALE_RUN_MS, a new startRun succeeds, and the old
     run shows "failed" with the message;
  b) a slow but progressing run (steps under the threshold, total over it)
     is NOT reaped;
  c) two startRuns at once on a stale room → only one new run wins;
  d) a viewer still can't start a run.
- Add an npm script "check:reliability" that runs only these tests.
- Run `npm run check:reliability`, then `npx deepspace test run all`
  3 times IN THE FOREGROUND (no sleep loops, no Monitors). All must be green.

DOCS AND LOGS (same PR):
- docs/design/13-reliability.md: #1 status → FIXED (commit + test names);
  #2 → FIXED or still future (say which and why).
- Update docs 06 (lastProgressAt), 07 (stale rule + reaper), 10 (new checks).
- Save this prompt as docs/prompts/09b-fix-stuck-runs.md.
- Add Session 09b to docs/agent-log.md; leave "What I verified myself" EMPTY.
- docs/token-usage.md: add rows 09a and 09b using `npx ccusage session
  --json` for these sessions (if this session isn't in the logs yet, write
  "fill after session" and I'll fill it).

Commit (the secret check must pass), push, open a PR with: the cause, the
fix, the check results, doc changes, and known gaps. Do NOT merge. Do NOT
deploy. If not done in 45 minutes: open a DRAFT PR listing what's missing. STOP.
