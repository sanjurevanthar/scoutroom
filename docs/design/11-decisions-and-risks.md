# 11 · Decisions, Risks and Open Questions

> **In simple words:** This page lists the main choices we made and why, what could go wrong with a plan B, the facts I could not confirm (TO VERIFY), and the answers you already gave. The biggest tradeoff: with no DeepSpace credits, AI and search sit behind provider interfaces that use your Groq key (free tier) and free sources. The core still uses DeepSpace.

## The main tradeoff

> **No DeepSpace credits, so AI and search sit behind provider interfaces using free sources; the core uses DeepSpace primitives; switching to DeepSpace integrations is a config change.**

| | What we gain | What we give up |
|---|---|---|
| Provider interfaces (`LLMProvider`, `SearchProvider`) | We can build and demo now. Switching to DeepSpace `anthropic`, `exa`, `scholar` later is two config values (`LLM_PROVIDER`, `SEARCH_PROVIDER`). | One more layer to write and test. Fewer "built-in DeepSpace" points for AI and search. |
| Free sources (OpenAlex, Wikipedia) | No search cost. | Weaker web coverage than Exa; many cards will be papers or background facts. |
| Owner's Groq key (free tier) | Works today, no bill. | Rate limits (HTTP 429) instead of cost; the owner must still guard the key (see D10). |
| DeepSpace for everything else | Auth, RBAC, records, live sync, presence, jobs, secrets, deploy, logs, tests stay real DeepSpace. | None. |

## Answers you gave (now in the docs)

| # | Your answer | Where it landed |
|---|---|---|
| Q1 | Job if the spike confirms T2-T6; else one action with a fixed pipeline. Document both. | [07](07-agent-run-design.md) (Plan A, Plan B, Spike) |
| Q2 | `LLMProvider` (Groq now, DeepSpace Haiku later) and `SearchProvider` (OpenAlex + Wikipedia now, Exa + Scholar later), chosen by env setting. | [08](08-integrations.md), D8 |
| Q3 | Default run limit 5 per room. | [06](06-data-model.md), [07](07-agent-run-design.md) |
| Q4 | Owner's AI key pays. Recorded as a tradeoff. | D10 below |
| Q5 | Invites by link. | D7 |
| Q6 | One question per room; re-runs allowed within the limit. | [06](06-data-model.md), [07](07-agent-run-design.md) |
| Q7 | Kept = keeps > rejects AND keeps >= 1. | [07](07-agent-run-design.md), [06](06-data-model.md) |
| Q8 | Owner and researchers can stop a run. | [03](03-roles-and-permissions.md) |
| Q9 | Yes, cut F4 (brief) first if time runs short. | [01](01-product-overview.md) |
| Q10 | Yes, seed a demo room on Sunday. | [10](10-testing-plan.md) |

## Decisions (short ADRs)

### D1 · A bounded, visible agent, not a fully autonomous one
- **Decision:** the agent follows a fixed loop (plan, search, cards) with hard caps. Every step is shown. Humans vote on the results.
- **Why:** cheaper (known maximum cost), more trustworthy (you can see what it did), safer against prompt injection, and humans stay in control.
- **Tradeoff:** less "magic". It cannot decide to dig deeper alone. [FUTURE] "Challenge a card" adds this under human control.

### D2 · Per-room roles stored as data, enforced by server actions
- **Decision:** `team_members` holds each person's room role. Reads use DeepSpace's `'team'` rule; every write is a server action that checks the role.
- **Why:** DeepSpace roles are app-wide (`viewer/member/admin`), not per room. *Source: `/concepts/permissions#roles`.*
- **Tradeoff:** more action code; no direct client writes. The upside: one clear place for every rule.

### D3 · One shared `RecordRoom` for the app, rooms are records
- **Decision:** all rooms live in the app's main scope (`app:<APP_ID>`), separated by `teamId`.
- **Why:** simplest; matches the scaffold. *Source: `/concepts/data-model#scopes`.* One scope per room isolates better but needs app-owned authorization for each.
- **Tradeoff:** all rooms share one Durable Object (a scale limit; fine for a demo).

### D4 · Plan A: background job enqueued only by the server. Plan B: one fixed-pipeline action
- **Decision:** prefer a job (live progress, retry, 15-min limit per tick). Deny all client writes on the job room so only `startRun` can enqueue. If the spike fails T4 or T6, fall back to Plan B (plan by code, 2 searches, 1 LLM call). Both are documented in [07](07-agent-run-design.md).
- **Why:** the scaffold's default lets any member enqueue from the browser, which would bypass our checks. *Source: `/guides/background-jobs`.*
- **Tradeoff:** the spike costs about half a day; Plan B has lower card quality.

### D5 · Atomic lock with `uniqueOn`
- **Decision:** `run_locks` with `uniqueOn: ['teamId']` instead of "read a flag, then write".
- **Why:** two quick clicks can both pass a read-then-write check. The Durable Object enforces uniqueness (T3).

### D6 · Source allowlist and strict JSON
- **Decision:** a card's URL must come from our own search results; zod validates every card.
- **Why:** stops invented sources and some injection. **Tradeoff:** a good link the model "knows" but search did not return is dropped.

### D7 · Invites by link, not user search
- **Why:** no need to list or email users; fewer privacy issues. **Tradeoff:** anyone with the link can join until it expires or is revoked.

### D8 · Provider interfaces for AI and search
- **Decision:** the agent depends on `LLMProvider` and `SearchProvider` only. Implementations are chosen by `LLM_PROVIDER` and `SEARCH_PROVIDER` (non-secret settings). The key lives in the DeepSpace secrets store.
- **Why:** DeepSpace credits are 0 today; interfaces let us build now and switch later without touching the agent.
- **Tradeoff:** extra code and a contract-test suite; a small risk that the DeepSpace adapters differ from the free ones in output shape (T9 for DeepSpace, T15 for free sources). Adapters normalize to `SearchHit`.

### D9 · Spike before the real build
- **Decision:** a half-day throwaway test of T2, T3, T4, T6 (and measure T1, T5) decides Plan A vs Plan B (rule in [07](07-agent-run-design.md)).
- **Why:** these facts are not in the docs, and a wrong guess would cost far more than half a day.

### D10 · The owner's AI key pays for all runs
- **Decision:** every run uses the owner's Groq key (`GROQ_API_KEY`) (one shared key in the secrets store).
- **Why:** simplest and works now; researchers need no accounts or keys.
- **Tradeoff:** the owner carries all cost and the key is a high-value secret. Controls: run limit (5 per room), hard caps per run, secret only in the store, never logged, and free-tier rate limits (Groq returns 429; no spending limit needed). If a room is abused, the owner can lower `runLimit` to 0 or rotate the key.

## Risks and plan B

| # | Risk | Likelihood | Plan B |
|---|---|---|---|
| R1 | `team` reads do not work with our `team_members` shape (T2) | medium | Use `collaboratorsField` (JSON array of user ids) on each record; or one `RecordRoom` scope per room. |
| R2 | Job queue runs one job at a time for the **whole app** (T5) | medium | Accept for the demo; else a job room per ScoutRoom or shorter steps. |
| R3 | Job path fails the spike (T4, T6) | medium | Plan B: one action, fixed pipeline. |
| R4 | Groq model does not return clean JSON (T14) | medium | zod validation; repair call (Plan A); stricter prompt; fall back to a different model id. |
| R5 | Free sources give weak or irrelevant results | high | Show results transparently in steps; humans vote; switch to Exa + Scholar when credits exist. |
| R6 | Free API rate limits or downtime (OpenAlex: shared $0.10/day per IP without a key, about 100 requests; Wikipedia) | high | Retry once, skip the failed query, keep going; demo from the seeded room. |
| R7 | Groq key leaks, or free-tier rate limits (429) stall runs | low | Secrets store only; 429 retry/backoff and "rate limited, try again" status; redaction + pre-commit scan; rotate key. |
| R8 | Deadline (Sunday night) | high | Cut F4 first. Then simplify invites to one researcher link. Demo from a seeded room. |
| R9 | AI returns weak or empty cards | medium | Repair call (Plan A); show "no usable cards" with the steps. |
| R10 | Prompt injection works partly | medium | Humans vote; LLM has no tools; URL allowlist (see 09). |
| R11 | Lock stays stuck after a crash | low | `expiresAt` rescue in `startRun`. |

## Spike results (session 02, branch `spike/verify`, local `deepspace test run`)

**Decision: GO (job design, Plan A).** Every "must" test passed: a job handler can call OpenAlex, Wikipedia and Groq, write records, and be enqueued only by a server action while all client enqueues are denied. The lock and role gate also work. Remaining unknowns (T1, T11) do not block Plan A because the job path avoids the action time limit.

Groq model chosen: **`openai/gpt-oss-20b`** (from `GET /models`: small and fast, 131k context, free tier, JSON mode worked). Alternatives listed: `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`. Groq calls used: 3 of ~5.

| ID | Status | Evidence |
|---|---|---|
| T13 outbound fetch | **CONFIRMED** | A server action (`spikeProbe`) got HTTP 200 from OpenAlex (3 results) and Wikipedia (3 results); `GROQ_API_KEY` was present on the server (never printed). `GET api.groq.com/openai/v1/models` returned 200 with 11 models. Groq pricing is not needed (free tier, rate limits only). |
| T16 same as T13 | **CONFIRMED** | Same evidence; also from inside the job handler. |
| T6 job handler | **CONFIRMED** | Job `spike-run` called OpenAlex + Wikipedia + Groq and wrote 1 `spike_cards` record (title "CTFusion: A CTF-based Benchmark for LLM Agent Evaluation", url `https://doi.org/10.48550/arxiv.2605.11504`), then released the lock. Handler writes records through the same action tools (`createActionTools`, exported from `action-routes.ts`). |
| T4 enqueue with client writes denied | **CONFIRMED** | `AppJobRoom` set to `authorizeWrite: async () => false`. Client `useJobs().enqueue` failed with `JobRoom write access denied`; server action `enqueueJob(env.JOB_ROOMS, 'app:<id>', ...)` still succeeded and the job ran. |
| T3 `uniqueOn` lock | **CONFIRMED** | Two parallel `spikeStart` calls: one `success: true`, the other `run already active (Duplicate: a record with teamId=... already exists in spike_locks)`. Lock released by the job; 0 locks left. |
| T2 role gate (server refuses viewer) | **CONFIRMED** (the action-level part) | A `viewer` in `spike_members` calling `spikeStart` got `forbidden: role=viewer`; an `owner` got through. NOT tested: `read: 'team'` rules (that was the original T2 wording; see "Still open" below). |
| T5 job queue scope | **CONFIRMED: per scope id, one job at a time per scope** | Two 6 s jobs in the same scope (`app:<id>`) ran one after the other (started 714093 and 720113 ms). Two jobs in two different scope ids ran at the same time (both started at 714118 ms). The docs agree ("Jobs still run one at a time"). The demo can use the single app scope (per your answer) or one scope per ScoutRoom later. |
| T7 `createdBy` | **CONFIRMED** | It is whatever user id the tools were created with. Action: the caller's id (`spikeSetup` record `createdBy` = caller). Job: the id we passed (the enqueuer's id in the payload; `createdBy` = that user). A job has no built-in identity, so we must pass one (for example the run owner or a fixed `agent` id). |
| T12 two test accounts | **CONFIRMED** | `npx deepspace test accounts create --email <name>@deepspace.test --name "<n>" --password-stdin --label spike`; the `users(2)` Playwright fixture signs both in. Passwords are saved locally, never printed. In a page, `getAuthToken()` gives the Bearer token for `/api/actions/:name`. |
| JSON mode | **CONFIRMED (1 run)** | `response_format: {type: 'json_object'}` on `openai/gpt-oss-20b` returned valid JSON with a `cards` array; `JSON.parse` OK; the card URL was one of the URLs we gave it (allowlist check passed). Usage: 408 prompt + 354 completion tokens in 0.4 s. One sample is not proof of reliability: keep zod validation and the repair call. No 429 seen in 3 calls. |
| T15 OpenAlex / Wikipedia fields | **CONFIRMED** | OpenAlex `/works` (with `select=`): `id, doi, title, publication_year, cited_by_count, primary_location{landing_page_url, pdf_url, is_oa, source{display_name}}`. Wikipedia `rest.php/v1/search/page`: `id, key, title, excerpt (HTML with searchmatch spans), description, thumbnail`; page URL = `https://en.wikipedia.org/wiki/<key>`. Groq response: `id, object, created, model, choices[0].message.content, choices[0].finish_reason, usage{prompt_tokens, completion_tokens, total_tokens, completion_tokens_details.reasoning_tokens}, x_groq, service_tier`. |
| T14 JSON mode on the chosen model | **CONFIRMED** | See JSON mode row. |
| T1 server-action time limit | **STILL UNKNOWN** | Not tested (local dev does not show production limits). The docs give no number for an action; they say `waitUntil` work is killed 30 s after the response, and a job alarm has a 15-minute wall time. So long work must go in the job, not an action. This is why Plan A is preferred. |
| T11 `ctx.continue` size and behavior | **STILL UNKNOWN** | The docs describe it (`resumeFrom` holds the last checkpoint; retries re-run the handler) but give no size limit. Not needed: one pass of plan, search and cards fits well inside 15 minutes. |
| T8 per-room presence API | **STILL UNKNOWN** | Not part of this spike. |
| T9 DeepSpace integration fields | **STILL UNKNOWN** (not tested: no DeepSpace credits) | Deliberately no `anthropic`, `exa` or `scholar` calls. |
| T2 original: `read: 'team'` with `team_members` | **STILL UNKNOWN** | Spike used `read: true` and a role column checked in the action. The team-read rule was not tested. |

### New findings that change the plan
- **OpenAlex now rations by cost, not by polite email.** The response `meta.notice` says: no API key means a shared **$0.10 per day budget per IP address**; each request cost $0.001 (about 100 requests per day, 1000 "credits"); headers `x-ratelimit-remaining`, `x-ratelimit-reset` are returned. A free API key (own $1/day) is available at openalex.org/settings/api. So `OPENALEX_MAILTO` was **not set** in the secrets store (only `GROQ_API_KEY`), and the spike sent no mailto. Action for you: decide if you want an OpenAlex API key (it is emailed to the address you give; I did not register one); if yes, store it as `OPENALEX_API_KEY` via `npx deepspace secrets`. Until then, limit to 1 to 2 OpenAlex queries per run (risk R6).
- **Wikipedia needs a `User-Agent`**; we send `ScoutRoomSpike/0.1`. Excerpts contain HTML tags; strip them.
- Circular import trap: a file imported by `src/actions/index.ts` must not import `action-routes.ts` at load time (the actions map came out empty and every action returned 404). The spike used a lazy `import()`.

### Provider interfaces (sketch, on `spike/verify`: `src/providers.ts`)
```ts
interface SearchHit { title; url; snippet; sourceName; year? }
interface SearchProvider { search(query, limit?): Promise<SearchHit[]> }
interface LLMProvider { complete(messages, jsonSchema?): Promise<{ text; usage? }> }
// Now:   GroqProvider, OpenAlexSearch, WikipediaSearch
// Later: DeepSpaceAnthropicProvider, ExaSearch, ScholarSearch  (not tested: no DeepSpace credits)
```

## TO VERIFY (original list; results are in the spike table above)

| ID | What | Why it matters | How to check |
|---|---|---|---|
| T1 | Max duration of one server-action request, and whether it continues after the client disconnects | Plan B size | Spike: time a long action |
| T2 | `read: 'team'` with `team_members` that has an extra `role` column and a `teamId` on `rooms` equal to its own id | Whole read model | Spike: tiny schema, 2 users |
| T3 | `tools.create` honors `uniqueOn` (lock, votes) | Lock and vote integrity | Spike: create twice |
| T4 | `enqueueJob` from an action works when `authorizeWrite` denies all client writes | Closing the job room | Spike |
| T5 | Job queue per app vs per scope id | Rooms blocking each other | `/sdk-reference/worker/rooms#jobroom-e`; spike with two scopes |
| T6 | Job handler can write records and make outbound `fetch` calls (docs show `buildCronContext` for cron) | Core run loop | Spike |
| T7 | `createdBy` on records written by an action or job | `own` rules, audit | Spike |
| T8 | Per-room presence API (`usePresenceRoom` signature) | "Who is online" per room | `/sdk-reference/client/realtime` |
| T9 | Exact response fields of the DeepSpace integrations | Later switch only | `npx deepspace integrations invoke` once each (needs credits) |
| T11 | Size limit and behavior of `ctx.continue(state)` | Step loop | Docs + spike |
| T12 | How to create test accounts for two-user tests | Testing | `npx deepspace test accounts --help` |
| T13 | Outbound `fetch` from server code / job handler to OpenAlex, Wikipedia, Groq (Groq base URL `https://api.groq.com/openai/v1`; pick a free-tier model id) | `GroqProvider` | Spike |
| T14 | Whether the chosen Groq model supports a JSON output mode | JSON reliability | Groq docs; test |
| T15 | OpenAlex and Wikipedia response fields, rate limits, and polite-use rules | Adapters | Call each once from a script |
| T16 | Outbound `fetch` to non-DeepSpace hosts from the worker is allowed | Free providers | Spike (same as T6) |

## Answers to the open questions (session 02)

| # | Answer | Effect |
|---|---|---|
| T5 | Non-blocking. One job queue per app is fine for the demo. | R2 accepted. |
| Q11 | Yes, send OpenAlex a `mailto`, read from the env setting `OPENALEX_MAILTO` (set via `npx deepspace secrets`). Never in code or git. | `OpenAlexSearch` reads `env.OPENALEX_MAILTO`. |
| Q12 | No spending limit needed on Groq's free tier. **Risk:** rate limits (HTTP 429), handled by short retry/backoff and a "rate limited, try again" run status. | R7 updated. |
| Q13 | A single job queue is acceptable for the demo. | R2 accepted. |
| Q14 | Accept Wikipedia for now. Label its cards **"background"** with lower confidence. | Card `sourceName=Wikipedia` shows a "background" label. |
