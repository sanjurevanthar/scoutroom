# 08 · Providers and Integrations

> **In simple words:** The agent needs an AI model and a search source. It uses the DeepSpace integrations `anthropic/chat-completion` and `exa/search`, paid from the owner's credits. A third one, `scholar/search-papers`, is built and ready but not in use. The agent only talks to two small interfaces, so a free fallback (Groq, OpenAlex, Wikipedia) can be selected by changing a setting.

All AI and search calls run on the **server**. Never in the browser.

## The two interfaces

```ts
// src/providers/types.ts (simplified)
interface LLMProvider {
  readonly name: string
  readonly model?: string
  complete(messages: ChatMessage[], schema?: JsonSchemaSpec, signal?: AbortSignal): Promise<{ text: string; usage?: {...} }>
}

interface SearchHit {
  title: string
  url: string                 // https only
  snippet: string             // truncated by the adapter
  sourceType: 'paper' | 'background'
  sourceName: string          // e.g. "Exa", "Google Scholar"
  year?: number
}

interface SearchProvider {
  readonly name: string
  readonly kind: 'paper' | 'background'
  readonly maxQueries?: number   // cost control: queries per run
  search(query: string, signal?: AbortSignal): Promise<SearchHit[]>
}
```

Rules: adapters **normalize** vendor output into these shapes. The agent, validation and cards only ever see `SearchHit` and `{ text }`. Vendor field names live in one adapter file each. Exa results are saved as `background` (general web) or `paper` (research-paper mode); there is no separate "web" type, so no schema or UI change was needed, and background cards keep their lower confidence cap (60%).

## Implementations

| Interface | Default: DeepSpace integrations | Free fallback (external providers, not DeepSpace integrations) |
|---|---|---|
| `LLMProvider` | `DeepSpaceAnthropicProvider`: `anthropic/chat-completion`, model `claude-haiku-5-5` | `GroqProvider`: Groq API with the owner's key |
| `SearchProvider` (papers) | `ExaSearch` in paper mode: `exa/search` with `category: "research paper"` | `OpenAlexSearch`: OpenAlex Works search |
| `SearchProvider` (web) | `ExaSearch` in background mode: `exa/search` | `WikipediaSearch`: Wikipedia search |

`ScholarSearch` (`scholar/search-papers`) is **built and contract-tested but not in use**: DeepSpace's Scholar provider returned "Your account has run out of searches" (502, billing released) during the build. Two integrations are in use, one is built and ready. Select it with `SEARCH_PROVIDER = "deepspace-scholar"` once it works again.

### How the implementation is chosen

Non-secret settings in the worker config (`wrangler.toml` `[vars]`), read by `getProviders(env, tools.integration)`:

| Setting | Values | Production |
|---|---|---|
| `LLM_PROVIDER` | `deepspace` / `groq` / `fake` (tests) | `deepspace` (value in `wrangler.toml`; if a setting is unset, the code falls back to `groq`) |
| `SEARCH_PROVIDER` | `deepspace` / `deepspace-scholar` / `free` / `fake` (tests) | `deepspace` (value in `wrangler.toml`; if unset, the code falls back to `free`) |
| `DEEPSPACE_LLM_MODEL` | any model id `anthropic/chat-completion` accepts | unset (default `claude-haiku-5-5`) |

The two settings are independent (for example Claude through DeepSpace with free search). The DeepSpace adapters need **no secret**. Only the free fallback needs one (`GROQ_API_KEY`, set with `npx deepspace secrets set`, never in `wrangler.toml`, code or git). If the chosen provider cannot be built, `startRun` refuses early (see [07](07-agent-run-design.md)).

## How the adapters call DeepSpace

Server actions and background jobs both get `tools.integration(endpoint, body)` from `createActionTools` (`src/server/action-routes.ts`). The scout job and `generateBrief` pass it to the adapters as an `IntegrationCall`, so no browser code is involved. Billing follows `src/integrations.ts`: unlisted integrations bill the **app owner** (`APP_OWNER_JWT`), which is what a background job needs because it has no caller token. *Sources: https://docs.deep.space/guides/external-apis#calling-from-your-worker, https://docs.deep.space/sdk-reference/worker/server-actions#integration-billing, https://docs.deep.space/guides/background-jobs.*

| Integration | Used for | Input we send | Cost |
|---|---|---|---|
| `anthropic/chat-completion` | plan, cards, brief | `model`, `max_tokens` 4000, `temperature` 0.2, `system` (with the JSON Schema hint), `messages` | metered at actual cost plus markup (a 2-call run is a fraction of a credit) |
| `exa/search` | papers and background | `query`, `numResults` 3, `type: "auto"`, `contents.text.maxCharacters` 500, `category: "research paper"` for papers | about $0.009 per search (measured) |
| `scholar/search-papers` | papers (optional) | `q`, `num` 5 | $0.0325 per request, so one query per run |

### Cost per run

Measured on a real run: 2 Claude calls, 3 Exa searches (2 paper queries, 1 background), about **3 credits** (100 credits = $1). A Claude call costs about 0.05 credit (7 calls cost $0.0031 in `npx deepspace app usage`), so a brief is about 0.05 credit; Exa cost $0.06 for 7 searches, about 0.9 credit each. With `deepspace-scholar` a run is about 4 credits (one Scholar query, one Exa search, two Claude calls). Check spend with `npx deepspace app usage`.

### Errors

| Situation | What the user sees |
|---|---|
| Insufficient credits (HTTP 402) | "Out of DeepSpace credits. Ask the app owner to add credits, then try again." The run or brief fails; a search step does not treat it as a normal failed search. |
| Provider error (for example 502) | "The AI service / Paper search / Web search is unavailable right now. Try again in a minute." Provider text is never shown. |
| Rate limited (429) | "Rate limited, try again." |
| One search fails, others work | The run continues and the step says how many searches failed. If no source at all is found, the run fails. |

There is no silent fallback to another provider: a failure is shown as a failure.

## Free fallback providers

External services, not DeepSpace integrations. Use them with `LLM_PROVIDER = "groq"` and `SEARCH_PROVIDER = "free"`.

- **`GroqProvider`:** Groq's OpenAI-compatible API, JSON mode, `openai/gpt-oss-20b`, owner's `GROQ_API_KEY` (server only). Free tier, so rate limits instead of a bill: 429 is retried with short backoff (honours `retry-after`), then "rate limited, try again".
- **`OpenAlexSearch`:** research papers, free, no key needed (an optional key raises the limits).
- **`WikipediaSearch`:** background facts with stable URLs. A weaker source than the open web, so cards are mostly background.

## Left out on purpose

| Integration | Why not |
|---|---|
| `payments` / Stripe | No paying user in this flow. |
| `fal` (images) | Decoration, no real value. |
| `email` + `cron` | Moved to [FUTURE] (watch mode) because of time. |
| `google/*` (Docs export) | [FUTURE]. Needs per-user OAuth consent. |

## How we keep cost low

1. Hard caps: 8 tool calls per run (a normal run uses 6), 3 to 6 cards per run, a per-room run limit of 5. Scholar, the pricier search, gets one query per run.
2. Haiku, the cheapest Claude model on the integration; short snippets only, truncated before they reach the LLM.
3. Send the LLM the **saved** results once (the cards step), never the whole history.
4. Never re-run a step that is already saved (retry safety).
5. Record token usage per run (`runs`) so the owner can see spend. [FUTURE]: per-room dashboard (F11).
