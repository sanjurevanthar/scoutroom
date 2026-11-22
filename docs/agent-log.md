# Agent log

How I directed the coding agent, session by session. Each entry follows this template:

    ## Session NN: <feature>
    - Date/time:
    - Goal:
    - My prompt (summary + link to docs/prompts/NN-*.md):
    - What the agent did:
    - What I verified, and how (commands run, browser checks, two-user test):
    - What I changed or took over myself, and why:
    - Tokens / cost (from /cost):

---

## Session 00: Setup
- Date/time: 2026-11-21
- Goal: Scaffold the DeepSpace app and put guardrails and tracking in place before building any feature.
- My prompt: set up agent tracking with secret protection. See [docs/prompts/00-setup.md](prompts/00-setup.md); every later prompt is auto-logged in [docs/prompts/prompt-log.md](prompts/prompt-log.md).
- What the agent did:
  - Scaffold: DeepSpace app `scoutroom` (commit "Scaffold DeepSpace app").
  - DeepSpace skill: installed from `deepdotspace/deepspace-skill` (pinned in `skills-lock.json`), copied into `.claude/skills/deepspace/` so reviewers can read it.
  - Docs MCP: `deepspace-docs` HTTP server declared in `.mcp.json` (https://docs.deep.space/mcp). TODO: describe how I used it.
  - Project rules appended to `CLAUDE.md` (server-side AI only, secrets only via `npx deepspace secrets`, one feature per session with a plan first, run tests after changes).
  - Tracking: this log, `docs/token-usage.md`, `docs/prompts/`, `docs/transcripts/`, a `UserPromptSubmit` hook (`scripts/log-prompt.sh`) and `scripts/token-report.sh` (daily totals only).
  - **Secret protection** (the repo is public):
    - `.gitignore` covers `.env*`, `.dev.vars*`, `.deepspace/`, `.wrangler/`, `.claude/settings.local.json`, `*.jsonl`, keys.
    - `scripts/redact.sh` masks API keys, JWTs, bearer tokens, key=value secrets and PEM blocks. The prompt log and token report pass through it.
    - `scripts/check-secrets.sh`, run by `.githooks/pre-commit`, scans staged files with the same patterns and blocks forbidden file types. Enable with `git config core.hooksPath .githooks`.
- What I verified, and how: fake-secret sample through `redact.sh`; staged a file containing a fake key and confirmed the commit was blocked; sent a test prompt and confirmed it was logged redacted; `git ls-files` showed no secret-looking files tracked.
- What I verified / changed myself (addendum): `wrangler.toml` had the `__APP_ID__` placeholder; I ran `npx deepspace app init`, committed the real app id, set secrets via `npx deepspace secrets` (piped, never typed in chat), and deployed to https://scoutroom.app.space (logs show 200s).
- What I changed or took over myself, and why: chose `scoutroom/` as the repo, narrowed the token report to daily totals (ccusage cannot filter by project, and session names would leak other projects).
- Tokens / cost (from /cost): TODO

---

## Session 03: Feature 1, rooms, roles, invite links
- Date/time: 2026-11-21
- Goal: Rooms with per-room roles and invite links, on a clean branch `feat/rooms` (spike code reused only as a pattern, `spike/verify` not merged).
- My prompt: Session 03 prompt (see [docs/prompts/prompt-log.md](prompts/prompt-log.md)).
- What the agent did:
  - Data (`src/schemas/rooms-schema.ts`): `rooms`, `team_members` (`uniqueOn teamId+userId`), `invites`. Room data reads use `read: 'team'` (`teamField: 'teamId'`); all client writes denied, so every write is a server action.
  - Actions (`src/server/rooms/`): `createRoom`, `createInviteLink` (owner), `joinByInvite` (joins as researcher), `changeRole` (owner), `removeMember` (owner; owner cannot remove themselves or be demoted). Role checks live in `access.ts`. `src/actions/index.ts` imports only these files, so there is no import cycle with `action-routes.ts`.
  - Screens: `/rooms` (list, empty/loading/error states), `/rooms/new`, `/rooms/:roomId` (question, members with roles, live presence via `usePresenceRoom`, empty board "Agent runs arrive in Feature 2"), `/join/:token`. `/home` now redirects to `/rooms`. No `deepspace add` feature fit (none covers rooms or roles), so the scaffold UI primitives were reused.
  - Two deliberate differences from the prompt's field list, both following docs/design/06: `team_members.teamId` instead of `roomId` (DeepSpace's `'team'` rule requires `teamId`); the invite token lives in an owner-only `invites` collection, not on `rooms`, because `rooms` is readable by every member and a token there would reach viewers.
- What I tested (`npx deepspace test run all`, 14 passed):
  - Two-user Playwright: A creates a room, B joins by link, both lists show 2 members live, both show as online.
  - Direct action calls: a non-member sees "not a member" and gets `not a member` from actions; researcher and viewer get `forbidden: role=...` from `createInviteLink`, `changeRole`, `removeMember`; owner cannot remove self or be demoted; bad role refused; invalid invite refused; a removed member loses access at once.
  - Note: plain `npx deepspace test run` only runs smoke+api; the new specs need `run all`.
- What I got wrong and fixed: first run of the direct-action test failed because the page was still on `about:blank` when calling `fetch('/api/auth/token')`; fixed by loading `/rooms` first. No production test hook was added: tests get a token from `/api/auth/token`.
- Not done (later features): job room is still open to client enqueue (D4, F2); invite revoke/expiry UI and role-specific invite links; budget setting.
- What I verified myself: - What I verified myself: tested live on scoutroom.app.space with 2 accounts
  (normal + private window): created room, joined by invite link, saw both
  members online, changed role to viewer and it updated live. So far I don't see any issues.
- Tokens / cost (from /cost): TODO

---

## Session 04: Feature 2, live agent run
- Date/time: 2026-11-21
- Goal: A researcher clicks "Run scout"; everyone in the room watches plan, search and cards appear live. Branch `feat/agent-run`.
- My prompt: Session 04 prompt (see [docs/prompts/prompt-log.md](prompts/prompt-log.md)).
- What the agent did:
  - Providers (`src/providers/`): `LLMProvider.complete(messages, schema)` and `SearchProvider.search(query)`; `GroqProvider` (model `openai/gpt-oss-20b`, JSON mode, 429 backoff then "rate limited, try again"), `OpenAlexSearch` (key as `api_key`, never in an error), `WikipediaSearch`, `FakeLLM`/`FakeSearch`, DeepSpace stubs marked "not tested: no DeepSpace credits". Chosen by `LLM_PROVIDER` / `SEARCH_PROVIDER` (`wrangler.toml` `[vars]`, not secret).
  - Data (`src/schemas/runs-schema.ts`): `runs`, `run_steps` (`uniqueOn runId+seq`), `cards`, plus `run_locks` (`uniqueOn teamId`; needed for the one-run lock, from doc 06). Reads are `'team'`; all client writes denied.
  - Actions (`src/server/runs/actions.ts`): `startRun` (owner/researcher; provider config check; lock; run limit checked under the lock; enqueue; refunds the run if enqueue fails) and `stopRun` (sets `stopped`; the job frees the lock on its next tick).
  - Job room locked (D4): `authorizeWrite` always false, so only `startRun` can enqueue. Each room has its own job scope, so rooms do not queue behind each other.
  - Job `scout-run` (`src/server/runs/pipeline.ts`): one step per tick via `ctx.continue`; steps Planning, Searching papers, Checking background, Writing cards, each saved as a `run_steps` record. Budget 8 tool calls (LLM + search; a normal run uses 5). Cards: zod strict, 3-6 cards, `sourceUrl` must be one we supplied, title and type come from our search hit (not the model), Wikipedia confidence capped at 0.6, one repair attempt, then fail with a plain message. Injection guard in the system prompt; results fenced in `<sources>`.
  - UI: `ScoutBoard` on the room page: Run button (hidden for viewers, disabled during a run or at the limit), "n / 5 runs used", live step timeline, Stop, card grid, empty / loading / failed / limit states.
- Where I deviated from the docs: card shape follows the prompt (`paper|background`, confidence 0-1), not doc 07 (`web|paper`, low/medium/high). "Tool calls" count LLM and search calls together. A bad plan falls back to searching with the question instead of failing.
- What I tested (`npx deepspace test run all`: 50 unit + 18 Playwright passed; automated tests use fake providers only):
  - Unit: card validation (bad JSON, made-up URL, lookalike URL, extra keys, too few/many cards), provider contract (Groq, OpenAlex, Wikipedia, fakes, 429 backoff, key never in an error), pipeline with fakes (repair, budget, stop, failures, retried step).
  - Two-user e2e: A runs the scout, B sees steps and cards appear live; stop; failed run shows its message and frees the lock.
  - Server: viewer's `startRun` refused; second and simultaneous `startRun` refused; client enqueue to the job room refused; run limit (5 of 5) enforced.
  - One real run locally (Groq + OpenAlex + Wikipedia): done in about 5 s, 4 steps, 5 cards, all from real OpenAlex papers.
- What went wrong and was fixed:
  - My first attempt to switch tests to fake providers (process env) did not reach the worker, so one full e2e run made real Groq/OpenAlex calls. Fixed by `SCOUTROOM_FAKE_PROVIDERS=1` in `tests/playwright.config.ts`, read by `vite.config.ts` (unset for dev, build and deploy). Confirmed fake mode with the `[fake:429]` marker before re-running.
  - While capturing the real run, my throwaway script waited on a missing element, so the real pipeline ran 3 more times than the one asked for. Roughly 4 real runs in total, all within the free tiers. The throwaway script is deleted.
  - The pre-commit secret scan blocked a placeholder test key; renamed it rather than bypass the hook.
- Not done / open: all 5 cards in the real run were papers (the model did not cite the Wikipedia background articles); no per-room spend view; stop on a running job takes effect at the next step boundary (up to one model call later); the `deepspace` provider stubs are untested.
- What I verified myself: I tested it live on scoutroom.app.space with two
  accounts (A in Chrome, B in a private window). As A, I ran the research
  agent. The counter showed "1 / 5 runs used", and it gave me evidence cards
  with a confidence percentage on each one. Then I made B a viewer, and the
  "Run scout" button disappeared for B, as expected. No issues found.
- Tokens / cost (from /cost): TODO

---

## Session 05: Feature 3, team votes on cards (+ docs sync from F2)
- Date/time: 2026-11-22
- Goal: Owners and researchers keep or reject evidence cards; everyone sees live counts and a Kept / Rejected / Undecided status. Branch `feat/votes`, PR to main (not merged, not deployed).
- My prompt: Session 05 prompt (see [docs/prompts/prompt-log.md](prompts/prompt-log.md)).
- What the agent did:
  - Part 0 (own commit): synced docs 06 and 07 with F2 (card shape `paper|background` + confidence 0-1, `run_locks` and why it exists, bad plan falls back to searching with the question, stop takes effect at the next step boundary, tests use fake providers via `SCOUTROOM_FAKE_PROVIDERS`); added the "F2 was auto-merged" note to doc 11 as D11.
  - Data: `votes` collection (`teamId`, `cardId`, `userId`, `value keep|reject`), `uniqueOn cardId+userId`, member-only reads, all client writes denied.
  - Action `castVote(cardId, value | null)`: room is taken from the card, caller must be a member and owner/researcher (viewers refused); null removes the vote; a changed vote updates the same row; a create refused by `uniqueOn` (two clicks at once) falls back to an update.
  - The kept rule is one pure function, `cardStatus` in `src/lib/votes.ts` (with `tally`), used by the UI. Counts and status are computed live from `votes`, not stored on cards.
  - UI: Keep / Reject buttons (my vote highlighted, click again to undo), `👍 n · 👎 n`, status badge, filter tabs All / Kept / Undecided / Rejected with counts, "Voting failed, try again." and an empty-filter message. Viewers see counts and status but no buttons.
- Where I deviated from the docs: doc 06 had `choice` and stored `keepCount`/`rejectCount`/`decision` on the card. I used `value` (as in the prompt) and compute counts instead of storing them, so they cannot drift. Doc 06 and 07 are updated in this PR.
- What I tested (`npx deepspace test run all`; fake providers only, no real API calls):
  - Unit: the kept rule (no votes, ties, only rejects, one-vote margins) and `tally`; 62 unit tests pass in total.
  - Two-user e2e: A and B vote on one card; counts, status and highlight update live on both screens; B's changed vote replaces their earlier one and A sees it; undo; filter tab counts.
  - Server: viewer's `castVote` refused; non-member's refused; unknown card refused; bad value refused; the same vote twice and two simultaneous votes by one person still count once.
- Known gap: some older Playwright tests are timing-sensitive and failed intermittently when the whole suite ran together with the new votes spec (API status page "Loading..." check, run-limit lock polling). Each failure was in a different test and the next run passed; two runs on `main` passed. Not fixed in this PR.
- What I verified myself: Google sign-in doesn't work on localhost, so before
  merging I relied on the automated tests (3 green full runs). After merging
  PR #1 and deploying, I tested on scoutroom.app.space with two accounts in
  two browsers. At first the vote buttons were missing: I had deployed before
  the merge reached main. I merged, pulled main, deployed again, and the
  Keep / Reject buttons and filter tabs appeared. When user one voted on a
  card, the count updated live in the other browser without refreshing.
- Tokens / cost (from /cost): TODO

---

## Session 06: Independent review of PR #1
- Date/time: 2026-11-22
- Goal: Review PR #1 (`feat/votes`) as a strict reviewer who did not write it, post the review, fix must-fix items and the flaky tests, prove 3 green full runs. No merge, no deploy.
- My prompt: Session 06 prompt (see [docs/prompts/prompt-log.md](prompts/prompt-log.md)).
- Findings (posted on the PR as a review comment):

| # | Severity | File:line | Problem (one sentence) | Suggested fix |
|---|---|---|---|---|
| R1 | must-fix | test storage (`vite.config.ts`) | The test accounts keep every room they create (one is in 103); DeepSpace reads "my rooms" with one `?` per room and SQLite allows 100, so pages hang on "Connecting..." (the flaky tests). | Fresh, empty storage for every test run. |
| R2 | should-fix | `votes/actions.ts:14` | A request with no `value` silently deletes the person's vote. | Require `value`; only explicit `null` removes. |
| R3 | must-fix | `rooms.ts:129` | A removed member's votes still count toward Kept / Rejected. | Delete their votes when removing them. |
| R4 | should-fix | `votes.spec.ts:147` | Fixed 1.5 s sleep instead of waiting for the real result. | Wait for the counts. |
| R5 | should-fix | `votes.spec.ts` | No test that a non-member cannot read another room's votes. | Add a read test. |
| R6 | should-fix | `votes/actions.ts` | No unit tests for the server action, only browser tests. | Unit tests with fake tools. |
| R7 | nit | `ScoutBoard.tsx:207` | `canVote={canRun}` is confusing. | Separate `canVote`. |
| R8 | nit | `votes/actions.ts:9` | `str` helper copied in 3 files. | Share it. |
| R9 | nit | `ScoutBoard.tsx:164` | `role="tab"` without a tab panel. | Toggle buttons with `aria-pressed`. |
| R10 | nit | `CardVotes.tsx:26` | Every vote error shows the same message. | Show the server message. |
| R11 | nit | `votes.spec.ts:71` | `'All ('` assertion checks almost nothing. | Check the real number. |
| R12 | nit | `runs-schema.ts` | Extra blank lines. | Remove. |

  Checked and fine: the room comes from the card; membership and owner/researcher role checked on the server; client writes to `votes` denied; `uniqueOn` plus update fallback; the kept rule matches doc 07; no secrets in code, logs or tests.
- Found later, while proving the fix: **R13** (must-fix, flaky): `collab.spec.ts` "API status page renders loading..." gave the mocked response after only 100 ms, so the test could miss the "Loading..." text. This was a second, separate cause (failed 1 of 3 runs after R1 was fixed).
- What was fixed (commits on `feat/votes`):
  - R1 `0de2379`: test server uses a fresh temp storage folder (only when `SCOUTROOM_FAKE_PROVIDERS=1`). Confirmed `.wrangler/state` is no longer touched.
  - R2 `60c4a3e`: `castVote` refuses a missing `value`. Test added in `55ac5c1`.
  - R3 `2ec6097`: `removeMember` deletes that person's votes. Test added in `55ac5c1`.
  - R4 `55ac5c1`: the sleep is replaced by waiting for the counts (assertion kept, not weakened).
  - R13 `096548d`: the response is held until the test has seen "Loading...", then released (no sleep, assertions unchanged).
  - Docs `3f2786b`: D12 and risk R12 in doc 11, a vote note in doc 06, a "Test isolation" section in doc 10.
- Not fixed (why):
  - R5, R6: each needs more than 5 minutes (a non-member read goes over a WebSocket, and the action needs a fake tools harness). The server rules they would test are already covered by the e2e tests and the schema.
  - R7 to R12: nits, skipped as instructed.
  - Real-user part of R12/doc 11: a person in about 100 rooms still breaks live reads; there is no leave/delete room feature yet. Recorded as a risk, not built.
  - Old local dev data: `.wrangler/state` still has 103 and 83 test rooms for the two test accounts. If your own `npm run dev` hangs on "Connecting...", delete that folder (dev data only).
- Test results (`npx deepspace test run all`, foreground): before the fixes 3 of 4 runs failed a different old test each time. After R1 to R4: run 1 green, run 2 red (R13, one old test), run 3 green. After R13: **3 of 3 green** (62 unit + 21 Playwright each time). Only 3 runs prove it, so watch for a repeat.
- What I verified myself: I read the review and the fix reply on PR #1. Each
  finding was marked fixed (with a commit) or not fixed (with a reason). I
  merged only after the 3 green test runs, then checked the voting behaviour
  live with two accounts (see Session 05).
- Tokens / cost (from /cost): TODO

---

## Session 07: Feature 4, cited brief from kept cards
- Date/time: 2026-11-22
- Goal: Build F4 unattended on `feat/brief`: `briefs` collection, `generateBrief` action (owner/researcher, kept cards only, strict JSON, validated citations), Brief section with live updates and a Stale note, docs 01/02/04/05/06/07/10/11/12 updated. No merge, no deploy.
- My prompt: Session 07 prompt (see [docs/prompts/prompt-log.md](prompts/prompt-log.md)).
- What the agent did:
  - Data and server: `briefs` schema (members read, no client writes, `uniqueOn teamId+seq`); `src/lib/brief.ts` (`keptCardIds` built on `tally`/`cardStatus`, so the kept rule is not duplicated); `src/server/briefs/{actions,parse,prompts}.ts`; `getLlm` split out of `getProviders`; FakeLLM answers the `brief` schema.
  - UI: `BriefPanel` above the board (Write brief, `n / 5 briefs used`, `[n]` markers that scroll to and highlight the card, Stale note, loading/empty/error/limit states).
  - Tests: 23 new unit tests (parse, kept rule, action with fake tools), 2 two-user e2e tests.
  - Docs: see the PR "Doc changes" list; decision D13 added in doc 11.
- Decisions: listed in the PR under "Decisions I made".
- Test results (`npx deepspace test run all`, foreground, 3 runs): 3 of 3 green (85 unit + 23 Playwright each time).
- Real Groq run (local, one run): the brief followed the cards and every citation was valid; one sentence added a little outside colour ("integrates with the MongoDB ecosystem"). The brief text is in the PR.
- What I verified myself: - I merged PR #3, deployed from main, and tested on
  scoutroom.app.space with two accounts (Chrome + private window). Before any
  card was kept, "Write brief" was disabled. After A kept 2 cards, "Write
  brief" produced a short summary with [1] [2] citations, and it appeared
  live in B's window without refreshing. Clicking [1] jumped to and
  highlighted the right card. When B kept a third card, the brief showed the
  "Stale" note. After A made B a viewer, B could read the brief but the
  "Write brief" button was gone. Everything worked.
- Tokens / cost (from /cost): TODO

---

## Session 09a: Reliability document (docs only)
- Date/time: 2026-11-22
- Goal: Document 6 run-reliability issues I found in my own review, verified against the code, with options and checks. Fix only issue 1 (in 09b); the rest are future work. No code changes.
- My prompt: [docs/prompts/09a-reliability-doc.md](prompts/09a-reliability-doc.md).
- What the agent did:
  - Read `src/server/runs/{actions,job,store,pipeline}.ts`, `src/cron.ts`, `src/lib/run-types.ts`, `ScoutBoard.tsx`, the SDK `ActionTools` types and the DeepSpace background-jobs docs.
  - Wrote `docs/design/13-reliability.md` (intro, summary table, 6 issues, checklist, "Why not now").
  - Linked it from doc 00, doc 11 (R11 updated, R13 added) and doc 12 (follow-up table).
- Findings that differ from my prompt:
  - Issue 1: "blocked forever" is too strong. The lock expires after 15 minutes and Stop works on a `running` run; but the run stays `running`, the UI stays blocked, and `stopRun` does not free the lock of a `running` run.
  - Issue 2: accurate but unlikely (a run is at most 8 tool calls).
  - Issue 3: no transaction method exists in `ActionTools`; none found in the docs.
  - Issue 5: no retry for thrown errors is accurate, but the retry-safe code also protects the platform's crash-recovery retry, so it is not dead.
- Test results: not run (docs only, no code changed).
- What I verified myself: I reviewed docs/design/13-reliability.md and checked
  that the 6 issues, options and statuses match my review, then merged it.
- Tokens / cost (from /cost): TODO

---

## Session 09b: Fix reliability issue 1 (a crashed run blocks the room)
- Date/time: 2026-11-22
- Goal: Fix issue 1 from [docs/design/13-reliability.md](design/13-reliability.md) on `fix/stuck-runs`, small and safe: heartbeat, one stale rule, lazy reaper in `startRun`, a "stuck" note in the UI. No change to quota rules, retries or card saving. No merge, no deploy.
- My prompt: [docs/prompts/09b-fix-stuck-runs.md](prompts/09b-fix-stuck-runs.md).
- What the agent did:
  - Added `lastProgressAt` to runs (set at start, at each step begin/end, and on each tool call); one pure function `isRunStale(run, now, staleMs)` plus `staleRunMs()` for the `STALE_RUN_MS` setting (default 180000).
  - `startRun`: when the lock is taken, `freeDeadLock` checks the holder. A stale run is marked `failed` ("Run stopped responding: marked as failed") and its lock removed; a live run is refused. Every write result is checked.
  - Pipeline: the cards step and the next-step check treat any ended run (not only `stopped`) as a reason to stop without saving; `failRun` no longer overwrites a run that already ended.
  - Issue 2 came with it: a live run's lock is judged by progress, not by the 15-minute TTL (the TTL stays as the fallback for runs that ended or are missing).
  - UI: "This run seems stuck. Click Run scout to start a new one." and the button is enabled when the latest run is stale (owner/researcher).
  - Tests: `isRunStale` unit tests, 8 `startRun` unit tests, 3 pipeline tests, 4 e2e tests with the new `[fake:hang]` marker; script `npm run check:reliability`.
  - Docs: 06, 07, 10, 11 (R11), 13 (issues 1 and 2 FIXED), token usage rows 09a/09b.
- Decisions: the fake hang lasts 12 s, then answers (not forever), so the test server's job queue is not blocked for good; it also lets the "job resumes after being reaped" case run. The browser's stuck note uses the 3-minute default; only the server decides. Option C (Stop frees the lock of a running run) and a cron reaper were not done.
- Test results: `npm run check:reliability` green (31 unit + 4 e2e). `npx deepspace test run all`, foreground, 3 runs: 3 of 3 green (102 unit + 27 Playwright each time). `tsc --noEmit` and eslint clean.
- What I verified myself:  I found the 6 reliability issues in my own review
  and chose to fix only the high-risk one (#1) before the deadline. I read
  PR #8 and ran `npm run check:reliability` myself on the branch: all tests
  passed (a hung run is reaped after the stale time, a slow but progressing
  run is not, only one new run wins, viewers still can't start). I can't
  crash a job on the live site, so the automated checks are my proof for
  the crash case; live, I checked that a normal run still works.
- Tokens / cost (from /cost): see [token-usage.md](token-usage.md) (09b row is a snapshot)

---

## Session 08: README
- Date/time: 2026-11-22
- Goal: Replace the scaffold README with a short, scannable one for DeepSpace reviewers, on `docs/readme`. Describe only what is built and verified. No merge, no deploy.
- My prompt: [docs/prompts/08-readme.md](prompts/08-readme.md).
- What the agent did:
  - Read docs/design 00 to 13, `docs/agent-log.md`, `docs/token-usage.md`, `package.json`, the schemas and the prompts in `src/`.
  - Wrote `README.md` with the 12 requested sections, one Mermaid diagram and links to the design docs.
- Decisions:
  - The cost line says "sessions 00 to 07 about $10.6", because that is what the Total row in `token-usage.md` covers (rows 09a and 09b are not in it).
  - The secrets example uses `pbpaste | ... --stdin` (from `deepspace secrets --help`: `KEY --stdin`); it was not run.
- Test results: not run (docs only, no code changed).
- What I verified myself:
- Tokens / cost (from /cost): see [token-usage.md](token-usage.md) (no row for this session yet)

---

## Session 08b: README, DeepSpace integrations planned vs. used now
- Date/time: 2026-11-22
- Goal: Make clear that Groq, OpenAlex and Wikipedia are external free providers, not DeepSpace integrations, on `docs/readme-integrations`. Docs only. No merge, no deploy.
- My prompt: [docs/prompts/08b-readme-integrations.md](prompts/08b-readme-integrations.md).
- What the agent did:
  - Checked `src/providers/` (`index.ts`, `deepspace.ts`, `groq.ts`, `openalex.ts`, `wikipedia.ts`), `worker.ts` and `wrangler.toml`.
  - Added the section "DeepSpace integrations: planned vs. used now" with the table and "How the switch works" to `README.md`; moved the tradeoff text into it.
  - Aligned `docs/design/08-integrations.md`.
- Findings that differ from my prompt:
  - "Switching is a config change" is only half true: `DeepSpaceLLM` and `DeepSpaceSearch` are stubs that throw `not tested: no DeepSpace credits`. The settings (`LLM_PROVIDER`, `SEARCH_PROVIDER`) and the agent are ready, but the real proxy adapters are not written. README and doc 08 now say so.
  - OpenAlex's key is optional (`OPENALEX_API_KEY`, sent as `api_key` if set); the code has no `OPENALEX_MAILTO`, so doc 08 no longer mentions it.
- Decisions: this branch is stacked on `docs/readme` (PR #9), because README.md is not on `main` yet; the PR targets `docs/readme`.
- Test results: not run (docs only, no code changed).
- What I verified myself:
- Tokens / cost (from /cost): see [token-usage.md](token-usage.md) (no row for this session yet)
