# 10 · Testing Plan

> **In simple words:** We prove the rules that matter most: live sync between two people, permissions enforced on the **server**, the one-run lock, the budget stop, bad AI output, and failed searches. We write the plan now and the tests when we build.

## What we test

| # | Test | Type | Pass when |
|---|---|---|---|
| T-1 | **Two-user live test** | e2e, two browsers | Alice runs the agent; Bob (same room) sees steps and cards appear with no refresh. |
| T-2 | **Viewer cannot run** | API + e2e | UI hides Run; direct `POST /api/actions/startRun` as viewer returns a refusal and creates no run. |
| T-3 | **Viewer cannot vote** | API + e2e | Same: server refuses `castVote`. |
| T-4 | **Outsider sees nothing** | API + e2e | A non-member gets no room data over the socket and a refusal from every action. |
| T-5 | **Cannot enqueue directly** | API | A member cannot enqueue a job through the job socket (closed `authorizeWrite`). |
| T-6 | **One-run lock** | API | Two `startRun` calls at once: exactly one succeeds. |
| T-7 | **Budget: run limit** | API | After `runLimit` runs, `startRun` is refused. |
| T-8 | **Budget: search cap** | unit/API | A plan with 12 queries only runs 8 searches. |
| T-9 | **Invalid JSON** | unit | Bad AI output: one repair call, then run `failed`, zero invalid cards saved. |
| T-10 | **Invented source** | unit | A card whose URL was not in the search results is dropped. |
| T-11 | **Failed integration** | unit/API | One search fails: run continues. All fail: run `failed`, lock released. |
| T-12 | **Refresh keeps status** | e2e | Reload during a run: same status and steps. |
| T-13 | **Stop** | e2e | Stop ends the run as `stopped` after the current step; lock released. |
| T-14 | **Vote rules** | API | One vote per person per card; changing a vote does not double count. |
| T-15 | **Invites** | API | Expired / revoked code refused; invite cannot make an owner. |
| T-16 | **Provider contract** | unit | Each `LLMProvider` and `SearchProvider` (fake, DeepSpace Claude, Exa, Scholar, and the fallback Groq, OpenAlex, Wikipedia) returns the agreed shape (DeepSpace adapters use recorded sample responses, no network; the Scholar sample is the documented shape, not a recording); `SearchHit.url` is `https`; an adapter never leaks vendor fields. |
| T-17 | **Provider switch** | unit/API | Changing `LLM_PROVIDER` / `SEARCH_PROVIDER` picks the right class with no agent change; an unknown value fails at startup. |
| T-18 | **Missing key** | API | Free fallback only (`LLM_PROVIDER = "groq"`): with no `GROQ_API_KEY` set, `startRun` refuses early; no run and no lock are created. The default DeepSpace config needs no key. |
| T-19 | **Key never leaks** | unit | The key does not appear in logs, run records, error messages or any response. |
| T-20 | **Plan B pipeline** | API | If built: one action creates 4 steps and cards, honors the lock and `stopRequested`. |
| T-21 | **Kept rule** | unit | keeps > rejects and keeps >= 1 means kept; ties and zero votes stay open. |

Before the build, a **spike** (T2, T3, T4, T6; measure T1, T5) decides Plan A vs Plan B; see [07](07-agent-run-design.md).

For T-8 to T-11, the provider calls are replaced by a fake (a fast fake provider) so tests are quick, free, and repeatable.
*Pattern source: https://docs.deep.space/guides/background-jobs#testing-without-waiting-for-a-real-upstream, https://docs.deep.space/guides/server-actions#testing-server-actions*

## How

- `npx deepspace test run` (also `test:api`, `test:e2e`, `test:smoke`) and `npm run validate` (type-check + unit tests). *Source: `package.json` scripts.*
- **Two browsers / two accounts** for T-1 and T-4: use `npx deepspace test accounts` (listed under `test` in the CLI overview) or two test emails. How to create test accounts: TO VERIFY.
- One test file per area: `tests/api/rooms.spec.ts`, `runs.spec.ts`, `votes.spec.ts`, plus an e2e `live-board.spec.ts`.

## Manual checklist for demo day

- [ ] Fresh deploy opens at `<app>.app.space` over HTTPS.
- [ ] Sign in works with two different accounts (two browsers, one normal and one private window).
- [ ] Create a room, invite a researcher and a viewer with links.
- [ ] Run the agent: both browsers show steps and cards live.
- [ ] Viewer: Run and Vote are hidden; (optional) show the server refusal.
- [ ] Vote keep and reject: counts update on both screens.
- [ ] Click Run twice quickly: only one run starts.
- [ ] Refresh mid-run: status and steps are still there.
- [ ] Reach the run limit: button disabled with a clear message.
- [ ] Write brief: every `[n]` links to a kept card; clicking it highlights the card; "Stale" shows after a vote changes.
- [ ] `npx deepspace logs` shows no errors; `npx deepspace app usage` shows spend is small.
- [ ] **Seeded demo room (Sunday):** a room with a real question, a finished run, ~8 cards and a few votes, created before the demo as a backup if search, the AI provider or the network is slow.
- [ ] `LLM_PROVIDER` and `SEARCH_PROVIDER` in `wrangler.toml` are `deepspace`; credits remain (`npx deepspace app usage`). Only if the free fallback is used: `GROQ_API_KEY` is in the secrets store (not in git).

## Test isolation

The e2e test server uses fresh, throwaway storage on every run (`vite.config.ts`, only when `SCOUTROOM_FAKE_PROVIDERS=1`). The two test accounts keep every room they create, and past about 100 rooms the SDK's team-read query fails (R12 in [11](11-decisions-and-risks.md)), which made random tests fail. Never point tests at `.wrangler/state`.

## F4 brief tests (session 07)

- Unit `src/server/briefs/parse.test.ts`: unknown citation id rejected, real-but-not-kept id rejected, bad JSON, wrong shape, extra keys, 0 or 5 paragraphs, empty citations; `keptCardIds` uses the one kept rule.
- Unit `src/server/briefs/actions.test.ts` (fake tools + FakeLLM): only kept cards reach the prompt; 0 kept refused without an LLM call; viewer and non-member refused; limit holds (also for two at once); one repair then fail cleanly; 429 message; card text cannot close the data fence.
- e2e `tests/brief.spec.ts` (two users, fake providers): A keeps a card and writes a brief, B sees it live, clicking `[1]` highlights the card, Stale appears live and clears on regenerate; server refusals and the 5-brief limit; a viewer reads but cannot write.

## Stuck-run tests (session 09b)

Run only these with `npm run check:reliability`.

- Unit `src/lib/run-types.test.ts`: `isRunStale` (fresh, stale, done/failed/stopped never stale, edge at the threshold, no heartbeat), and the `STALE_RUN_MS` setting.
- Unit `src/server/runs/actions.test.ts` (fake tools, mocked job queue): a stale run is reaped (`failed` + message, one lock, one new run); a fresh run is refused; **issue 2**: expired lock with fresh progress is refused; ended run's lock waits for the 15-minute TTL; failing lock release refuses cleanly; two starts at once on a stale room, one wins; a viewer is refused.
- Unit `src/server/runs/pipeline.test.ts`: heartbeat is written; a job resumed after its run was reaped stops at the next step boundary, saves no cards, and leaves the new run's lock alone.
- e2e `tests/stuck-runs.spec.ts` (two users, fake providers, `STALE_RUN_MS=3000`, question marker `[fake:hang]` stalls every model call for 12 s): (a) after the threshold a new start succeeds and the old run is no longer active; (b) a slow run whose steps keep reporting progress is not reaped; (c) two starts at once, one wins; (d) a viewer still cannot start.
- Gap: the e2e cannot read the old run's `failed` text from the browser, so the exact message is checked in the unit test.
