/** Deterministic providers for tests. They never touch the network. */
import { RateLimitedError } from './types'
import type { ChatMessage, JsonSchemaSpec, LLMProvider, LLMResult, SearchHit, SearchProvider, SourceKind } from './types'
import { defaultSleep } from './http'

export const FAKE_FAIL_MARKER = '[fake:fail]'
export const FAKE_RATE_LIMIT_MARKER = '[fake:429]'
/** A call that stalls for FAKE_HANG_MS, like a stuck provider, then answers normally. */
export const FAKE_HANG_MARKER = '[fake:hang]'
export const FAKE_HANG_MS = 12_000

export type FakeResponder = (messages: ChatMessage[], schema?: JsonSchemaSpec) => string | Promise<string>

/** Pulls the `{"sources":[...]}` block the cards prompt embeds, so fake cards cite real given URLs. */
function sourcesFrom(messages: ChatMessage[]): { url: string; title: string }[] {
  const user = messages.find((m) => m.role === 'user')?.content ?? ''
  const match = user.match(/<sources>\s*([\s\S]*?)\s*<\/sources>/)
  if (!match) return []
  try {
    return JSON.parse(match[1]!) as { url: string; title: string }[]
  } catch {
    return []
  }
}

export const defaultFakeResponder: FakeResponder = async (messages, schema) => {
  const everything = messages.map((m) => m.content).join('\n')
  if (everything.includes(FAKE_HANG_MARKER)) await defaultSleep(FAKE_HANG_MS)
  if (everything.includes(FAKE_RATE_LIMIT_MARKER)) throw new RateLimitedError()
  if (everything.includes(FAKE_FAIL_MARKER)) throw new Error('fake failure')
  if (schema?.name === 'plan') {
    return JSON.stringify({
      paperQueries: ['fake paper query one', 'fake paper query two'],
      backgroundQuery: 'fake background query',
    })
  }
  if (schema?.name === 'brief') {
    // Cites the real card ids the prompt gave it: first card in paragraph 1, the rest in paragraph 2.
    const user = messages.find((m) => m.role === 'user')?.content ?? ''
    const block = user.match(/<cards>\s*([\s\S]*?)\s*<\/cards>/)?.[1]
    const cards: { id: string; claim: string }[] = block ? JSON.parse(block) : []
    const rest = cards.slice(1)
    return JSON.stringify({
      paragraphs: [
        { text: `Fake brief: the team kept ${cards.length} card(s). ${cards[0]?.claim ?? ''}`, citations: cards.slice(0, 1).map((c) => c.id) },
        ...(rest.length ? [{ text: 'Fake brief: further kept evidence supports this.', citations: rest.map((c) => c.id) }] : []),
      ],
    })
  }
  const sources = sourcesFrom(messages)
  return JSON.stringify({
    cards: sources.slice(0, 4).map((s, i) => ({
      claim: `Fake finding ${i + 1}: ${s.title}`,
      sourceUrl: s.url,
      confidence: 0.8,
    })),
  })
}

export class FakeLLM implements LLMProvider {
  readonly name = 'fake'
  readonly model = 'fake'
  readonly calls: ChatMessage[][] = []
  constructor(
    private readonly respond: FakeResponder = defaultFakeResponder,
    /** Slows each call so a second browser can watch the steps arrive. */
    private readonly delayMs = 0,
  ) {}

  async complete(messages: ChatMessage[], schema?: JsonSchemaSpec): Promise<LLMResult> {
    this.calls.push(messages)
    if (this.delayMs) await defaultSleep(this.delayMs)
    return { text: await this.respond(messages, schema), usage: { promptTokens: 10, completionTokens: 10 } }
  }
}

export class FakeSearch implements SearchProvider {
  readonly name = 'fake'
  readonly queries: string[] = []
  constructor(
    readonly kind: SourceKind,
    private readonly delayMs = 0,
    private readonly results?: SearchHit[],
  ) {}

  async search(query: string): Promise<SearchHit[]> {
    this.queries.push(query)
    if (this.delayMs) await defaultSleep(this.delayMs)
    if (query.includes(FAKE_FAIL_MARKER)) throw new Error('fake search failure')
    if (this.results) return this.results
    const slug = encodeURIComponent(query.toLowerCase().replace(/\s+/g, '-'))
    return [1, 2].map((n) => ({
      title: `${this.kind === 'paper' ? 'Paper' : 'Article'} ${n} about ${query}`,
      url: `https://example.org/${this.kind}/${slug}/${n}`,
      snippet: `Fake ${this.kind} snippet ${n} for ${query}.`,
      sourceType: this.kind,
      sourceName: this.kind === 'paper' ? 'FakePapers' : 'FakeWiki',
      year: this.kind === 'paper' ? 2024 : undefined,
    }))
  }
}
