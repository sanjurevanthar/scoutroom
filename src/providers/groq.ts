import { RateLimitedError, ProviderConfigError } from './types'
import type { ChatMessage, JsonSchemaSpec, LLMProvider, LLMResult } from './types'
import { defaultSleep, withTimeout } from './http'
import type { FetchLike, Sleep } from './http'

const BASE_URL = 'https://api.groq.com/openai/v1'
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b'
const MAX_ATTEMPTS = 3
const MAX_BACKOFF_MS = 8_000
const TIMEOUT_MS = 60_000

export interface GroqOptions {
  apiKey: string | undefined
  model?: string
  fetchImpl?: FetchLike
  sleep?: Sleep
}

/**
 * Groq via its OpenAI-compatible API, JSON mode (confirmed in the spike, doc 11 T14).
 * 429: short backoff (honours retry-after, capped), then "rate limited, try again".
 * The key goes only in the Authorization header. It is never logged or put in an error.
 */
export class GroqProvider implements LLMProvider {
  readonly name = 'groq'
  private readonly apiKey: string
  private readonly model: string
  private readonly fetchImpl: FetchLike
  private readonly sleep: Sleep

  constructor(opts: GroqOptions) {
    if (!opts.apiKey) throw new ProviderConfigError('AI provider not configured')
    this.apiKey = opts.apiKey
    this.model = opts.model || DEFAULT_GROQ_MODEL
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
    this.sleep = opts.sleep ?? defaultSleep
  }

  async complete(messages: ChatMessage[], schema?: JsonSchemaSpec, signal?: AbortSignal): Promise<LLMResult> {
    const withHint: ChatMessage[] = schema
      ? [{ ...messages[0]!, content: `${messages[0]!.content}\n\nReturn ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(schema.schema)}` }, ...messages.slice(1)]
      : messages
    const body = JSON.stringify({
      model: this.model,
      messages: withHint,
      temperature: 0.2,
      max_tokens: 4000,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
    })

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await this.fetchImpl(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: withTimeout(TIMEOUT_MS, signal),
      })
      if (res.status === 429) {
        if (attempt === MAX_ATTEMPTS) throw new RateLimitedError()
        const retryAfter = Number(res.headers.get('retry-after'))
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt
        await this.sleep(Math.min(wait, MAX_BACKOFF_MS))
        continue
      }
      if (!res.ok) throw new Error(`Groq request failed (HTTP ${res.status})`)
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const text = json.choices?.[0]?.message?.content
      if (typeof text !== 'string') throw new Error('Groq returned no message')
      return {
        text,
        usage: json.usage
          ? { promptTokens: json.usage.prompt_tokens ?? 0, completionTokens: json.usage.completion_tokens ?? 0 }
          : undefined,
      }
    }
    throw new RateLimitedError()
  }
}
