/**
 * DeepSpace integration adapters (docs/design/08): anthropic/chat-completion, scholar/search-papers, exa/search.
 * They call the platform through the `tools.integration` function that server actions and background jobs
 * already have. The app owner pays (src/integrations.ts default). No key is involved on our side.
 */
import { isHttps, toPlainText } from './http'
import { CreditsExhaustedError, ProviderError, RateLimitedError } from './types'
import type { ChatMessage, JsonSchemaSpec, LLMProvider, LLMResult, SearchHit, SearchProvider, SourceKind } from './types'

/** The shape of `tools.integration` (ActionTools). Injected so tests run without a network. */
export type IntegrationCall = (
  endpoint: string,
  body?: unknown,
) => Promise<{ success: true; data: unknown } | { success: false; error?: string; code?: string; status?: number }>

/** Cheapest Claude Haiku on anthropic/chat-completion. Override with the DEEPSPACE_LLM_MODEL setting. */
export const DEFAULT_DEEPSPACE_MODEL = 'claude-haiku-5-5'

/** Calls one endpoint. Failure becomes a typed error with a human message. Never includes provider text. */
async function call(integrationCall: IntegrationCall, endpoint: string, body: unknown, what: string): Promise<unknown> {
  const res = await integrationCall(endpoint, body)
  if (res.success) return res.data
  if (res.code === 'insufficient_credits' || res.status === 402) throw new CreditsExhaustedError()
  if (res.status === 429 || res.code === 'rate_limited') throw new RateLimitedError()
  throw new ProviderError(`${what} is unavailable right now. Try again in a minute.`, res.code)
}

/** Models sometimes wrap JSON in a ```json fence. Remove only that wrapper; the zod check still decides validity. */
function unfence(text: string): string {
  const m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return m ? m[1]! : text.trim()
}

export class DeepSpaceAnthropicProvider implements LLMProvider {
  readonly name = 'deepspace'
  readonly model: string

  constructor(
    private readonly integrationCall: IntegrationCall,
    model?: string,
  ) {
    this.model = model || DEFAULT_DEEPSPACE_MODEL
  }

  async complete(messages: ChatMessage[], schema?: JsonSchemaSpec): Promise<LLMResult> {
    // The Messages API takes `system` separately and only user/assistant turns.
    const system = [
      ...messages.filter((m) => m.role === 'system').map((m) => m.content),
      ...(schema ? [`Return ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(schema.schema)}`] : []),
    ].join('\n\n')
    const turns = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))

    const data = (await call(
      this.integrationCall,
      'anthropic/chat-completion',
      { model: this.model, max_tokens: 4000, temperature: 0.2, system, messages: turns },
      'The AI service',
    )) as { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } }

    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
    if (!text) throw new ProviderError('The AI service returned no answer. Try again.', 'empty_reply')
    return {
      text: unfence(text),
      usage: data.usage
        ? { promptTokens: data.usage.input_tokens ?? 0, completionTokens: data.usage.output_tokens ?? 0 }
        : undefined,
    }
  }
}

const yearIn = (s: unknown): number | undefined => {
  const m = typeof s === 'string' ? s.match(/\b(19|20)\d{2}\b/g) : null
  return m ? Number(m[m.length - 1]) : undefined
}

/**
 * Papers from Google Scholar (SerpApi). Built and contract-tested, but NOT the default: DeepSpace's Scholar provider
 * returned "Your account has run out of searches" (502) on 2026-11-22. ~$0.0325 a call, so one query per run.
 * Select it with SEARCH_PROVIDER = "deepspace-scholar".
 */
export class ScholarSearch implements SearchProvider {
  readonly name = 'scholar'
  readonly kind = 'paper' as const
  readonly maxQueries = 1

  constructor(private readonly integrationCall: IntegrationCall) {}

  async search(query: string): Promise<SearchHit[]> {
    const data = (await call(this.integrationCall, 'scholar/search-papers', { q: query, num: 5 }, 'Paper search')) as {
      organic_results?: {
        title?: string
        link?: string
        snippet?: string
        publication_info?: { summary?: string }
      }[]
    }
    const hits: SearchHit[] = []
    for (const r of data.organic_results ?? []) {
      const title = typeof r.title === 'string' ? toPlainText(r.title, 200) : ''
      if (!title || !isHttps(r.link)) continue
      const summary = r.publication_info?.summary
      hits.push({
        title,
        url: r.link,
        snippet: toPlainText([r.snippet, summary].filter(Boolean).join(' '), 500) || title,
        sourceType: 'paper',
        sourceName: 'Google Scholar',
        year: yearIn(summary),
      })
    }
    return hits
  }
}

/**
 * Exa results, in two modes (same endpoint, different `category`):
 *  - "background": general web pages. Mapped to sourceType "background" (not a new "web" type): that needs no
 *    schema change, and background cards already get the lower confidence cap. See docs/design/08.
 *  - "paper": category "research paper". This is the default paper source while Scholar is unavailable.
 */
export class ExaSearch implements SearchProvider {
  readonly name = 'exa'

  constructor(
    private readonly integrationCall: IntegrationCall,
    readonly kind: SourceKind = 'background',
  ) {}

  async search(query: string): Promise<SearchHit[]> {
    const data = (await call(
      this.integrationCall,
      'exa/search',
      {
        query,
        numResults: 3,
        type: 'auto',
        ...(this.kind === 'paper' ? { category: 'research paper' } : {}),
        contents: { text: { maxCharacters: 500 } },
      },
      this.kind === 'paper' ? 'Paper search' : 'Web search',
    )) as { results?: { title?: string; url?: string; publishedDate?: string | null; text?: unknown }[] }

    const hits: SearchHit[] = []
    for (const r of data.results ?? []) {
      const title = typeof r.title === 'string' ? toPlainText(r.title, 200) : ''
      if (!title || !isHttps(r.url)) continue
      const text = typeof r.text === 'string' ? toPlainText(r.text.replace(/[#*_`>|-]+/g, ' '), 500) : ''
      hits.push({
        title,
        url: r.url,
        snippet: text || title,
        sourceType: this.kind,
        sourceName: 'Exa',
        year: yearIn(r.publishedDate),
      })
    }
    return hits
  }
}
