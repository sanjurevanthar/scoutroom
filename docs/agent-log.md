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
- What I verified myself:
- Tokens / cost (from /cost): TODO
