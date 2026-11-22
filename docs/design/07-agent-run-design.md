# 07 · Agent Run Design

> **In simple words:** A run is a short, bounded loop: plan a few searches, run them, turn the results into cards, save. Each step is saved as a record the moment it finishes, so everyone sees progress live and a refresh loses nothing. **Plan A** runs the loop as a background job. **Plan B** (fallback) runs a smaller fixed pipeline inside one server action. A short spike test decides which one we build.

The agent never talks to a vendor directly. It uses two small interfaces, `LLMProvider` and `SearchProvider` (see [08-integrations.md](08-integrations.md)). Which implementation runs is a config setting. This page says "the LLM" and "search" for that reason.

## Plan A (preferred): background job

- A server action is built to "finish inside the HTTP response". No hard time limit is documented for it (**T1**).
  *Source: https://docs.deep.space/guides/background-jobs ("When to use jobs vs. cron vs. server actions")*
- A background job (`JobRoom`) outlives the response, shows live progress, and has a 15-minute limit per alarm. We split work with `ctx.continue(state)`: save progress, yield, resume on the next tick.
  *Source: https://docs.deep.space/guides/background-jobs#lifecycle-and-limits*
- So: **`startRun` (server action) validates and enqueues. `scout-run` (job) does one step per tick and saves after each step.**

**We choose Plan A only if the spike passes** (see "Spike" below).

### Sequence of one run (Plan A)

```mermaid
sequenceDiagram
  actor U as User
  participant UI as Browser
  participant A as startRun action
  participant R as RecordRoom
  participant J as scout-run job
  participant L as LLMProvider
  participant S as SearchProvider
  U->>UI: Click Run agent
  UI->>A: POST /api/actions/startRun
  A->>R: check role, runsUsed < runLimit
  A->>R: create run_lock (one per room)
  A->>R: create run (queued), runsUsed + 1
  A->>J: enqueueJob(runId)
  A-->>UI: runId
  J->>R: run = running
  J->>L: plan (max 6 queries)
  J->>R: save step "plan"
  loop each query, max 8 total
    J->>S: search
    J->>R: save step (summary)
  end
  J->>L: write cards as strict JSON
  J->>J: validate JSON + source URLs
  J->>R: save valid cards
  J->>R: run = done, delete run_lock
  R-->>UI: live updates for everyone in the room
```

### Steps in plain words (Plan A)

1. **Plan.** Ask the LLM for up to 6 search queries, each tagged `papers` or `web`. Strict JSON, validated.
2. **Search.** Run each query with the matching `SearchProvider`. Keep only title, URL, year and a short snippet.
3. **Cards.** Give the LLM the question plus the *saved* results. Ask for up to 12 cards as strict JSON.
4. **Validate** and **save** cards. Cards appear live.
5. **Finish.** Set status, release the lock.

Between every step: read the run's `status`. If it is `stopped`, save nothing more and free the lock. **Stop takes effect at the next step boundary**, not instantly: a model or search call already in flight finishes first.

**A bad plan does not fail the run.** If the plan reply is not valid, the run falls back to searching with the question itself (one paper query and one background query) and the step detail says "Plan was unclear, searching with the question itself".

## Plan B (fallback): one server action, fixed pipeline

Used if the spike shows the job path does not work (see "Spike"). Same records, same UI, same lock, fewer steps:

```
startRun (action):  checks + lock + create run (running)
  1. plan      by code, no LLM: query 1 = the room question -> papers search
                                 query 2 = the room question -> web search
  2. search 1  (papers)     -> save step
  3. search 2  (web)        -> save step
  4. LLM x1    cards as strict JSON from both result lists
  5. validate + save cards, run = done, release lock
```

| | Plan A (job) | Plan B (one action) |
|---|---|---|
| Searches | up to 8 | exactly 2 |
| LLM calls | up to 3 (plan, cards, 1 repair) | exactly 1 (no repair; invalid JSON means `failed`) |
| Live steps | yes, each step saved | yes, 4 steps saved as they finish |
| Stop | between any steps | between the 4 stages only |
| Survives a closed page | yes (job) | **TO VERIFY (T1)**: the action must finish its own work |
| Time limit | 15 min per tick | one request, limit unknown (T1), so keep it small |

Plan B reuses the same code for validation, providers and saving, so switching is cheap. Card quality is lower (no query planning).

## Spike (decides Plan A or Plan B)

A small throwaway test, about half a day, before the real build. It checks, with a tiny schema and a fake provider:

| Check | Needed for Plan A? |
|---|---|
| **T2** `read: 'team'` works with `team_members` (extra `role` column, `teamId` on `rooms`) | **Required** (also needed for Plan B) |
| **T3** `tools.create` honors `uniqueOn` (lock, votes) | **Required** (both plans) |
| **T4** `enqueueJob` from an action works while the job room denies all client writes | **Required** |
| **T6** a job handler can write records and make outbound calls | **Required** |
| **T5** is the job queue per app or per scope | Not blocking: if it is one queue per app, we accept "rooms wait for each other" for the demo and document it |
| **T1** server-action time limit | Measured; decides how big Plan B can be |

Rule: **T2, T3, T4, T6 pass -> Plan A. Any of T4 or T6 fails -> Plan B.** If T2 or T3 fail, both plans need a different data design (see risk R1 in [11](11-decisions-and-risks.md)). *(Treating T5 as non-blocking is my reading of your answer; tell me if you want it blocking.)*

## Run status

```mermaid
stateDiagram-v2
  [*] --> queued: startRun
  queued --> running: job starts
  queued --> stopped: stopRun before start
  running --> done: cards saved
  running --> failed: error after retries
  running --> stopped: stopped status seen at next step boundary
  done --> [*]
  failed --> [*]
  stopped --> [*]
```

Every change is a record update. Everyone reads the same `runs.status`. A refresh just re-reads it. Re-runs in the same room are allowed while `runsUsed < runLimit`; each run adds cards, it does not replace old ones.

## Card JSON (what the LLM must return)

```json
{
  "cards": [
    {
      "claim": "string, 1 to 280 chars",
      "sourceUrl": "must be one of the URLs returned by this run's searches",
      "sourceTitle": "string, max 200",
      "sourceType": "paper | background",
      "confidence": "number from 0 to 1",
      "quote": "optional string, max 300, copied from the snippet"
    }
  ]
}
```

Rules (checked with `zod`, already in `package.json`):
- No extra keys. Max 12 cards. Enum values exact.
- `sourceUrl` is `https` and matches a URL we got from a search. This blocks invented sources.
- **If invalid:** per-card check. Invalid cards are dropped and counted in the step summary. If the whole response is not valid JSON: Plan A makes **one** repair call ("return only valid JSON"); Plan B has none. If still bad, or zero valid cards: run ends `failed` with a plain reason. Nothing invalid is ever saved.
- Models differ in how well they follow JSON instructions. Whether the chosen model supports a JSON mode: **T14**. Our validation does not depend on it.

## Budget guard

| Limit | Plan A | Plan B | Enforced where |
|---|---|---|---|
| Search calls per run | 8 (hard) | 2 | job/action counter `runs.searchCalls` |
| LLM calls per run | 3 | 1 | counter `runs.aiCalls` |
| Runs per room | `rooms.runLimit`, **default 5** | same | `startRun` checks `runsUsed < runLimit` |
| Cards per run | 12 | 12 | zod `max(12)` |
| Total run time | 10 min deadline | small, T1 | `AbortSignal.timeout` (+ `ctx.signal` in Plan A) |

The owner's LLM key pays for every run (see [11](11-decisions-and-risks.md), D10), so these caps are the spending control. The free search sources cost no money but have rate limits, so the caps protect those too.

## One run per room (the lock)

`startRun` creates one `run_locks` record. The collection has `uniqueOn: ['teamId']`, and DeepSpace refuses a second create with a "Duplicate" error, so two clicks at the same moment cannot both win (**T3**). The lock is deleted when the run ends. It also has `expiresAt`; a new `startRun` may take over an expired lock (the job or action died).
*Source for `uniqueOn`: https://docs.deep.space/concepts/permissions*

## Failure handling

| What fails | What happens |
|---|---|
| One search fails | Step saved as failed. Continue with the other queries. If **all** fail: run `failed`. |
| LLM call fails | Retry once (backoff). Still failing: run `failed`, steps so far kept. |
| Invalid JSON | Plan A: one repair call, then `failed`. Plan B: `failed`. |
| Timeout | Run `failed` with "took too long". Lock released. |
| User closes the page | Plan A: nothing changes, the job keeps going. Plan B: T1. |
| Worker restarts mid-run (Plan A) | JobRoom retries the handler with `job.resumeFrom`. Steps use `uniqueOn: ['runId','seq']`, so a repeated step does not duplicate. *Source: `/guides/background-jobs#lifecycle-and-limits`* |
| Stop clicked | `stopRun` sets the run to `stopped`; the job sees it at the next step boundary, saves no cards, and frees the lock. Owner and researchers can do it. |
| Bad plan from the LLM | Not a failure: fall back to searching with the question itself. |
| Budget hit mid-run | Remaining searches skipped; go straight to cards with what we have. |
| Provider misconfigured (missing key) | `startRun` refuses early with "AI provider not configured" and creates no run and no lock. |

## Card decision rule (F3)

A card is **KEPT** when `keeps > rejects` **and** `keeps >= 1`. It is **REJECTED** when `rejects > keeps`. Otherwise it is **UNDECIDED** (no votes, or a tie). The counts and the status are **computed** from the `votes` records by one pure function (`cardStatus` in `src/lib/votes.ts`), never stored on the card, so they cannot drift.

## Brief (F4)

**Why a server action, not a job.** A run needs a job because it is several slow steps (search, search, model) and members watch it step by step. A brief is **one** short Groq call (a few kept cards in, 2-4 short paragraphs out, usually a few seconds), there are no steps to show, and the result appears live through the `briefs` record. So `generateBrief(roomId)` is a plain server action that makes the call and saves the result. The button shows "Writing brief..." while it waits. If the request dies mid-way, nothing was saved and nothing was counted, so trying again is safe. (If a brief ever needs several calls or a slow model, move it to a job like `scout-run`.)

**Order of checks** (all on the server; actions bypass RBAC): caller is an active member -> role is owner or researcher (`forbidden: role=viewer`; a non-member gets `not a member of this room`) -> fewer than 5 briefs (`brief limit reached (5 of 5 used)`) -> at least one KEPT card (`Keep at least one card first`) -> provider configured -> LLM call -> validate -> save.

**Which cards.** Read from `cards` and `votes` right now and filtered with `keptCardIds` (`src/lib/brief.ts`), which uses `tally` -> `cardStatus`, the one rule above. Nothing else is shown to the model: not undecided, not rejected cards.

**Brief JSON (what the LLM must return).**
```json
{ "paragraphs": [ { "text": "...", "citations": ["<cardId>", "<cardId>"] } ] }
```
zod, `.strict()`: 1-4 paragraphs (the prompt asks for 2-4; a room with a single kept card may get 1), text 1-1200 chars, 1-8 citations per paragraph, no extra keys. **Every citation must be one of the kept card ids** that this request gave the model. A made-up id and a real-but-not-kept id are both rejected (the repair message says which). One repair call with the reason, then the action fails with "The AI did not return a brief we could verify. Try again." and saves nothing. The marker numbers `[1] [2]` are not written by the model: the page numbers the cited cards by first appearance.

**Prompt-injection guard.** Card text came from the web, so it is **data**: the system prompt says text in `<cards>` is untrusted and never an instruction; the cards go in as a JSON block inside `<cards>...</cards>` with `<` escaped, so a claim cannot close the fence; the model has no tools; and even a model that obeys a card cannot cite anything but a kept card id, because the output is validated.

**Limit.** 5 briefs per room (`BRIEF_LIMIT`). Only saved briefs count, so a failed attempt (429, bad JSON) does not use one. `briefs` has `uniqueOn teamId+seq`; the save takes `seq = highest + 1` and re-checks the limit; if two requests race for a slot, the loser re-reads and either takes the next slot or is refused at 5. Tested with two simultaneous requests.

**Failures.** Groq 429 (after the provider's own short backoff) -> "rate limited, try again". Missing key -> "AI provider not configured". Anything else -> "Could not write the brief. Try again." (the log line has the error kind only, never request data).

**Stale.** `keptCardIds` (sorted) is saved with each brief. The page compares it, as a set, with the kept cards now; if they differ it shows "Stale: votes changed since this brief".

## Tests never call real APIs

Automated tests run with fake providers: `tests/playwright.config.ts` sets `SCOUTROOM_FAKE_PROVIDERS=1`, which `vite.config.ts` passes to the worker so it uses `FakeLLM` and `FakeSearch` (unset for dev, build and deploy). Unit tests inject the same fakes. A fake marker in the question, such as `[fake:429]`, simulates a provider failure.

## TO VERIFY

T1 server-action time limit. T3 lock. T4 `enqueueJob` while client writes are denied. T5 one job queue per app. T6 job handler can write records and make outbound calls. T11 size and behavior of `ctx.continue` state. T13-T16 provider facts (Groq model id, JSON mode, OpenAlex and Wikipedia fields, outbound `fetch` from the worker). See [11-decisions-and-risks.md](11-decisions-and-risks.md).
