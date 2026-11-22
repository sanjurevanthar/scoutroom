/** The two interfaces the agent depends on (docs/design/08). Vendor details stay in one adapter file each. */
export type SourceKind = 'paper' | 'background'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Describes the JSON the model must return. Providers pass it on as a hint; our zod check is the real gate. */
export interface JsonSchemaSpec {
  name: string
  schema: Record<string, unknown>
}

export interface LLMResult {
  text: string
  usage?: { promptTokens: number; completionTokens: number }
}

export interface LLMProvider {
  readonly name: string
  complete(messages: ChatMessage[], schema?: JsonSchemaSpec, signal?: AbortSignal): Promise<LLMResult>
}

export interface SearchHit {
  title: string
  /** https only. */
  url: string
  /** Plain text, already truncated. */
  snippet: string
  sourceType: SourceKind
  sourceName: string
  year?: number
}

export interface SearchProvider {
  readonly name: string
  readonly kind: SourceKind
  search(query: string, signal?: AbortSignal): Promise<SearchHit[]>
}

export interface Providers {
  llm: LLMProvider
  papers: SearchProvider
  background: SearchProvider
}

/** Groq (or any LLM) is throttling us after our backoff. Message is shown to users. */
export class RateLimitedError extends Error {
  constructor() {
    super('rate limited, try again')
    this.name = 'RateLimitedError'
  }
}

/** A provider is selected but its secret is missing. */
export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderConfigError'
  }
}
