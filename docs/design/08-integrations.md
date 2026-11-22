# 08 · Providers and Integrations

> **In simple words:** The agent needs an AI model and a search source. The owner's DeepSpace account has 0 credits, so for now we use the owner's own Groq key and two free search sources. The agent only talks to two small interfaces, so later we can switch to DeepSpace's Anthropic, Exa and Scholar integrations by changing a setting, with no change to the agent code.

All AI and search calls run on the **server**. Never in the browser.

## The two interfaces

```ts
// Design sketch only. No code is written in this phase.
interface LLMProvider {
  readonly name: string
  complete(req: {
    system: string
    prompt: string
    maxTokens: number
    json?: boolean            // ask for JSON output if the model supports it (T14)
    signal?: AbortSignal      // cancel / timeout
  }): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }>
}

interface SearchHit {
  title: string
  url: string                 // https only
  snippet: string             // truncated by the adapter
  sourceType: 'web' | 'paper'
  sourceName: string          // e.g. "OpenAlex", "Wikipedia"
  year?: number
}

interface SearchProvider {
  readonly name: string
  readonly kind: 'web' | 'paper'
  search(query: string, opts: { limit: number; signal?: AbortSignal }): Promise<SearchHit[]>
}
```

Rules: adapters **normalize** vendor output into these shapes. The agent, validation and cards only ever see `SearchHit` and `{ text }`. Vendor field names live in one adapter file each.

## Implementations

| Interface | Now (**[THIS BUILD]**) | Later (**[FUTURE]**, one config change) |
|---|---|---|
| `LLMProvider` | `GroqProvider`: Groq API (OpenAI-compatible, `https://api.groq.com/openai/v1`) with the owner's key | `DeepSpaceAnthropicProvider`: `anthropic/chat-completion` (Haiku) |
| `SearchProvider` (papers) | `OpenAlexProvider`: OpenAlex Works search (free) | `ScholarProvider`: `scholar/search-papers` |
| `SearchProvider` (web) | `WikipediaProvider`: Wikipedia search (free) | `ExaProvider`: `exa/search` |

### How the implementation is chosen

Two **non-secret** settings in the worker config (`wrangler.toml` `[vars]`), read by one `getProviders(env)` function:

| Setting | Values | Default |
|---|---|---|
| `LLM_PROVIDER` | `groq` / `deepspace` | `groq` |
| `SEARCH_PROVIDER` | `free` / `deepspace` | `free` |

The **secret** (`GROQ_API_KEY`; also `OPENALEX_MAILTO` for OpenAlex polite use) lives only in the DeepSpace secrets store (`npx deepspace secrets set ...`), never in `wrangler.toml`, code, `.dev.vars` committed files, or git. If the chosen provider's secret is missing, `startRun` refuses early (see [07](07-agent-run-design.md)).
*Sources: https://docs.deep.space/concepts/deployment#secrets-come-from-the-store-not-from-dev-vars, https://docs.deep.space/cli-reference/commands#secrets.*

The two settings are independent: you can use Groq with DeepSpace search, or the reverse.

## Providers used now

### `GroqProvider` (Groq)
- **Why:** plan searches, write cards as JSON, write the brief (F4).
- **How:** HTTPS call from the worker to Groq's OpenAI-compatible chat completions API (`https://api.groq.com/openai/v1`) with the owner's key in the `Authorization` header (server only). Exact base URL, model id and JSON-mode support: **T13, T14**.
- **Output:** the model text, plus token usage if returned.
- **Cost:** free tier: **rate limits, not a bill** (requests and tokens per minute/day). HTTP 429 is expected under load.
- **If it fails:** on HTTP 429 retry with short backoff (honor `retry-after`, max 2-3 tries); if still limited, show "rate limited, try again" in the run status and end the run cleanly. Other errors: retry once, then fail the run.

### `OpenAlexProvider` (papers)
- **Why:** research papers, free, no key. (OpenAlex asks polite clients to identify themselves; whether to send a contact address, and which one, is an open question for you: Q11. We will **not** commit a personal email.)
- **Input:** search text, result limit. **Output:** title, URL (landing page or DOI link), year, a short abstract if available. Exact fields: **T15**.
- **Cost:** free. Rate limits apply (TO VERIFY).

### `WikipediaProvider` (web / background facts)
- **Why:** free background and overview sources with stable URLs.
- **Input:** search text, limit. **Output:** title, page URL, short extract. Exact fields: **T15**.
- **Cost:** free. Rate limits apply.
- **Honest limit:** Wikipedia is a weaker source than the open web for "which tool should we use in 2026". Cards from it will be mostly background. This is the price of having no search credits.

## DeepSpace integrations (later)

Facts from `npx deepspace integrations info <name>` (full list: `npx deepspace integrations list`) and https://docs.deep.space/guides/external-apis.

| Integration | Replaces | Input (from `info`) | Cost (from catalog) |
|---|---|---|---|
| `anthropic/chat-completion` | `GroqProvider` | `model` (default `claude-opus-5-5`), `max_tokens`, `messages`, `system`, `temperature` | metered at actual cost plus markup; standard pricing for `claude-haiku-5-5` |
| `exa/search` | `WikipediaProvider` | `query`, `numResults`, `type`, `category`, domain and date filters | metered at actual cost plus markup |
| `scholar/search-papers` | `OpenAlexProvider` | `q`, `num`, `start`, `hl`, `as_ylo`, `as_yhi` | **$0.0325 per request** |

Called from the worker through the proxy as the app owner; billing follows `src/integrations.ts` (unlisted integrations default to developer billing). *Sources: `src/integrations.ts`, https://docs.deep.space/guides/server-actions#integration-calls---billing-routing, https://docs.deep.space/sdk-reference/worker/cron#buildcroncontext-env-owneruserid-roomid.*

**Switch checklist (when credits exist):** top up credits; set `LLM_PROVIDER=deepspace` and/or `SEARCH_PROVIDER=deepspace`; run the provider contract tests (see [10](10-testing-plan.md)); check `npx deepspace app usage`. No schema or UI change.

## Left out on purpose

| Integration | Why not |
|---|---|
| `payments` / Stripe | No paying user in this flow. |
| `fal` (images) | Decoration, no real value. |
| `email` + `cron` | Moved to [FUTURE] (watch mode) because of time. |
| `google/*` (Docs export) | [FUTURE]. Needs per-user OAuth consent. |

## How we keep cost low

1. Hard caps: Plan A 8 searches, 3 LLM calls, 12 cards per run; Plan B 2 searches, 1 LLM call. Per-room run limit of 5.
2. Free search sources; short snippets only, truncated before they reach the LLM.
3. Send the LLM the **saved** results once (the cards step), never the whole history.
4. Never re-run a step that is already saved (retry safety).
5. Record token usage per run (`runs`) so the owner can see spend. [FUTURE]: per-room dashboard (F11).
