# 13 · Reliability review [Issues 1 and 2 FIXED, 3 to 6 future]

> **In simple words:** After shipping F1 to F4 I reviewed what happens when a run goes wrong (a crash, a slow run, a half-finished save). I found 6 problems. I fixed the most dangerous one (issue 1, Session 09b), and issue 2 came with it because it is the same mechanism. The other 4 are written down here, with options, so they can be fixed later. Each one was checked against the real code first; where my first reading was too strong, this page says so.

## Why this page exists (honest intro)

Time before the deadline is short, and I do not know every DeepSpace detail yet (for example how job retries behave in every case, or whether multi-record transactions exist). Changing the core run logic without that knowledge is risky. So I chose to **fix the one high-risk issue now and document the rest** with suggested solutions. Nothing in issues 2 to 6 is fixed yet.

## Summary

| # | Problem | Impact | Verified? | Status |
|:-:|---|:-:|---|---|
| 1 | A crashed job leaves the run "running"; lock is never renewed; no reaper | High | Yes, but "forever" is too strong (see below) | **FIXED** (Session 09b, PR `fix/stuck-runs`) |
| 2 | A long run can outlive its 15-minute lock | Medium | Yes, but unlikely in practice | **FIXED** (same change as 1) |
| 3 | `startRun` has several writes and no transaction | Medium | Yes | Future |
| 4 | `saveCards` can fail partway and leave half a set of cards | Low to Medium | Yes | Future |
| 5 | Job is set to retry twice, but errors are swallowed, so it never retries | Low | Mostly (one nuance) | Future (suggest option A) |
| 6 | Failed runs still use up the room's 5-run quota | Low | Yes | Future |

## What the platform gives us (checked in the docs and SDK types)

| Fact | Source |
|---|---|
| A job that **throws** is retried if `attempts < maxAttempts`; default is 1 (no retry). | https://docs.deep.space/guides/background-jobs ("The JobContext API", "Lifecycle and limits") |
| A job whose worker **crashes** ("running" row older than about 16 min) is rescued when the Durable Object wakes up: retried if attempts remain, otherwise marked `failed`. The retry starts the handler again with `job.resumeFrom` set to the last `ctx.continue` state. | Same page, "Crash-recovery outcomes" |
| The platform marks the **job** failed, but it does **not** know about our `runs` record or our `run_locks` record. | Our design: those are our own collections |
| `ActionTools` has only `create`, `update`, `remove`, `deleteWhere`, `get`, `query`, `integration`, `registerUser`. **No transaction or batch-write method.** A docs search for "transaction" found nothing. | `node_modules/deepspace/dist/server.d.ts`, `interface ActionTools` |

So for issue 3 the design is "safe write order + self-healing", not a transaction. (I did not find a transaction feature; if one exists it is undocumented.)

---

## Issue 1 · A crashed job leaves the run "running"

| | |
|---|---|
| **What happens** | `runScoutJob` (`src/server/runs/job.ts`) catches errors and calls `failRun`. But if the worker itself dies (restart, deploy, timeout) nothing runs, so the `runs` record stays `running` and the `run_locks` record stays. `startRun` (`src/server/runs/actions.ts`) sets `expiresAt` once (`Date.now() + RUN_LOCK_TTL_MS`) and nothing renews it. `src/cron.ts` has `tasks = []`, so there is no reaper. If the platform's retries run out, it marks the job failed but never updates our run. `failRun` itself can also fail (it only swallows `releaseLock` errors, not `getRun`/`updateRun`). |
| **Check of my first claim** | **Partly accurate.** "Blocked forever" is too strong. `startRun` does take over a lock once `expiresAt < now` (15 minutes), and the user can press **Stop** (`stopRun` accepts `running`). What is true: the run record stays `running` and the UI treats it as active (`ScoutBoard.tsx`, `active`), so Start stays disabled until someone presses Stop. And `stopRun` on a `running` run does **not** free the lock (only for `queued`), so the room is still blocked until the 15 minutes pass. Doc 11 R11 ("low") understated this. |
| **Impact** | **High**: the room looks stuck, needs a manual Stop, and can be blocked for up to 15 minutes. |
| **Suggested options** | **A.** Heartbeat: write `lastProgressAt` on the run at every step (and when a step starts). Treat a run as dead after about 3 minutes without progress. Reap **lazily inside `startRun`** (no cron): if the lock holder is stale, mark that run `failed`, delete its lock, then continue. **B.** A cron reaper that does the same every minute (needs a real `runTask` in `src/cron.ts`; more moving parts). **C.** Also let `stopRun` free the lock for a stale `running` run. Suggest **A (+ C)**. |
| **Status** | **FIXED** in Session 09b (option A; C not done). Code: `isRunStale` and `staleRunMs` in `src/lib/run-types.ts`; `freeDeadLock` (the lazy reaper) in `src/server/runs/actions.ts`; heartbeat in `src/server/runs/pipeline.ts`; "seems stuck" note in `ScoutBoard.tsx`. Tests: `isRunStale`, `startRun: stuck runs` (7 unit tests), the 3 pipeline tests on heartbeat and resumed jobs, and e2e `stuck runs a)` to `d)`. Commit: see the PR. Not done: option C (`stopRun` still does not free the lock of a `running` run; the lock is freed by the job at its next step, or by the reaper after the stale time), and no cron reaper (option B). |
| **How to check** | Unit test with the memory store: a `running` run with `lastProgressAt` 4 minutes old plus its lock; call `startRun`; expect the old run `failed`, one new run, one lock. Also: a run that is only 1 minute old must **not** be reaped. |

## Issue 2 · A long run can outlive its 15-minute lock

| | |
|---|---|
| **What happens** | The lock lasts 15 minutes from the start (`RUN_LOCK_TTL_MS`, `src/lib/run-types.ts`). If the run is still alive after that, a second `startRun` takes the lock over, and two runs write cards in the same room. `releaseLock` is safe (`ToolsRunStore.releaseLock` only removes a lock that has its own `runId`). |
| **Check** | **Accurate but unlikely.** A run is at most 8 tool calls (`MAX_TOOL_CALLS`) in 4 short ticks, normally well under a minute. It could only outlive the lock when something hangs or retries. |
| **Impact** | **Medium** (low chance, messy result: duplicate or mixed cards). |
| **Suggested options** | Judge the lock by **progress**, not by a fixed time: a lock is "stale" only when `lastProgressAt` is older than the threshold. Then a live run is never taken over and a dead one is taken over quickly. This is the same mechanism as issue 1. |
| **Status** | **FIXED** in Session 09b, because it is the same change: when the lock holder is a queued/running run, `startRun` now decides by `lastProgressAt`, not by the 15-minute `expiresAt`. The 15 minutes stay only as the fallback for a lock whose run has ended or is missing. Tests: unit `issue 2: expired 15-minute lock but fresh progress -> still refused`. |
| **How to check** | Test: a run whose lock `expiresAt` has passed but whose `lastProgressAt` is 10 seconds old; `startRun` must answer "a run is already active". |

## Issue 3 · `startRun` has several writes and no transaction

| | |
|---|---|
| **What happens** | `startRun` does, in order: create lock, read room, create run, update `runsUsed`, enqueue job (`actions.ts`). (a) The `runsUsed` update (`tools.update('rooms', ...)`) result is **not checked**; if it fails the run still starts without being counted. (b) In the enqueue `catch`, the rollback (`update runs`, `update rooms`, `release`) ignores its own results; if one fails you can have a `queued` run with no job. (c) If the worker dies between steps, leftovers remain (a lock or a `queued` run with no job). |
| **Check** | **Accurate.** All three are visible in `actions.ts`. There are no transactions in `ActionTools` (see the table above). |
| **Impact** | **Medium** (rare, but it breaks the quota and can strand a run). |
| **Suggested options** | **1.** Safe order: lock, run, enqueue first, **count last**. **2.** Check every result and return a clear error. **3.** Do not keep a counter: compute `runsUsed` by counting the room's run records (the records are the truth, nothing to drift). **4.** Let the reaper from issue 1 heal leftovers (a `queued` run with no progress for 3 minutes is failed). Suggest 1 + 2 + 4 first; 3 later. |
| **Status** | Future. |
| **How to check** | Test with fake tools where `update('rooms', ...)` fails: expect an error and no uncounted run. Test where `enqueueJob` throws and the rollback update fails: expect the run is still reaped later. |

## Issue 4 · `saveCards` can fail partway

| | |
|---|---|
| **What happens** | `ToolsRunStore.saveCards` (`src/server/runs/store.ts`) deletes old cards, then creates cards one by one and throws on the first failure. The job's catch then marks the run `failed`, but the cards already created stay. `ScoutBoard.tsx` shows all cards of the room (`useQuery('cards', { where: { teamId } })`), with no check of the run's status. |
| **Check** | **Accurate.** (A retry of the same run would clean up, because `saveCards` deletes first, but a failed run is not retried; see issue 5.) |
| **Impact** | **Low to Medium**: a user may vote on part of a set that belongs to a failed run. |
| **Suggested options** | **A.** Show only cards whose run has status `done` (cards are saved before `status: 'done'`, so they stay hidden until the run finishes). **B.** Best-effort `deleteWhere('cards', { runId })` when a run fails. Do A for correctness and B for tidiness. |
| **Status** | Future. |
| **How to check** | Test: fake store whose 3rd card create fails; after the run, the board query/helper returns 0 cards for that run. |

## Issue 5 · The retry setting never takes effect

| | |
|---|---|
| **What happens** | `startRun` enqueues with `maxAttempts: 2` (`actions.ts`). But `runScoutJob` (`job.ts`) catches every error, calls `failRun` and returns normally, so the platform sees success and never retries. |
| **Check** | **Mostly accurate, with one nuance.** For errors thrown inside the handler, there is no retry, as described. But the retry-safe code is **not** dead: it also protects the platform's **crash recovery** path, which re-runs the handler (with `resumeFrom`) when `attempts < maxAttempts`. That path matters for issue 1, so removing `maxAttempts` would change crash behaviour too. |
| **Impact** | **Low** (misleading configuration, plus a surprise if someone "fixes" it). |
| **Suggested options** | **A.** No automatic retries after errors: fail clearly, the user re-runs (today's real behaviour; set the intent in a comment and in doc 07). **B.** Rethrow only temporary errors (network, HTTP 5xx, rate limit) so the platform retries them; keep `failRun` for the final attempt. B needs care so a retried run is not marked `failed` before its retry. Suggest **A**. |
| **Status** | Future. |
| **How to check** | Test the job with a provider that throws once: expect either (A) a `failed` run and one call, or (B) a second attempt and a `done` run. Check `job.attempts` in a real local run. |

## Issue 6 · Failed runs use up the quota

| | |
|---|---|
| **What happens** | `startRun` adds 1 to `runsUsed` before the job starts. It is given back only when the enqueue itself fails. `failRun` (`pipeline.ts`) and `stopRun` do not give it back, so a run that failed on a rate limit still costs 1 of the room's 5. |
| **Check** | **Accurate.** |
| **Impact** | **Low** (annoying, and honest about cost: the run did use free-tier calls). |
| **Suggested options** | **A.** Count only finished runs (`done`), derived from run records (this also fits issue 3, option 3). **B.** Add a hard cap on attempts per room (for example 10) so a retry loop cannot burn the free-tier quota. Suggest A + B together. |
| **Status** | Future. |
| **How to check** | Test: one failed run and one done run, `runLimit` 5; the room shows "1 of 5 used". Test: the 11th attempt is refused even if all failed. |

---

## Checklist to verify in the future

| # | Testable check | Passes when |
|:-:|---|---|
| 1 | Kill or stub a job mid-run, wait past the stale threshold, click Start | Old run is `failed`, a new run starts, one lock exists (**automated**, `npm run check:reliability`) |
| 2 | Expired lock but fresh `lastProgressAt` | Second `startRun` is refused (**automated**) |
| 3 | Make the `runsUsed` update fail | `startRun` returns an error; counts stay correct |
| 4 | Make the 3rd card save fail | The board shows no cards from that run |
| 5 | Make a provider throw once | Behaviour matches the chosen option (A or B), not the config |
| 6 | One failed run, one done run | Quota shows 1 used; attempt cap holds at 10 |

## Why not now (issues 3 to 6)

- **Time:** the deadline is close, and each fix needs code, tests and a live check.
- **Knowledge gaps:** I am not yet sure how retries and crash recovery interact with `ctx.continue` in every case, or whether DeepSpace has multi-record transactions (none found).
- **Risk:** changing `startRun` and the run loop right before the deadline could break the working demo. Only issue 1 was dangerous enough to justify that risk (and it was fixed with small, separately tested changes).

Related: [11 Decisions and risks](11-decisions-and-risks.md) (R11, R13), [12 Roadmap](12-roadmap.md), [07 Agent run design](07-agent-run-design.md).
