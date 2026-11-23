/** Provider contract: every implementation returns the normalised shapes. No real network calls. */
import { describe, expect, it } from 'vitest'
import { FakeLLM, FakeSearch } from './fake'
import { GroqProvider } from './groq'
import { getProviders } from './index'
import { OpenAlexSearch, abstractFromIndex } from './openalex'
import { ProviderConfigError, RateLimitedError } from './types'
import type { SearchHit, SearchProvider } from './types'
import { WikipediaSearch } from './wikipedia'

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })

const FAKE_KEY = 'placeholder-value-for-tests'

function expectValidHits(hits: SearchHit[], kind: SearchHit['sourceType']) {
  expect(hits.length).toBeGreaterThan(0)
  for (const h of hits) {
    expect(h.url.startsWith('https://')).toBe(true)
    expect(h.title.length).toBeGreaterThan(0)
    expect(typeof h.snippet).toBe('string')
    expect(h.sourceType).toBe(kind)
    expect(h.sourceName.length).toBeGreaterThan(0)
  }
}

describe('SearchProvider contract', () => {
  const openalex = new OpenAlexSearch({
    apiKey: FAKE_KEY,
    fetchImpl: async () =>
      json({
        results: [
          {
            id: 'https://openalex.org/W1',
            doi: 'https://doi.org/10.1/x',
            title: 'A <i>good</i> paper',
            publication_year: 2023,
            cited_by_count: 4,
            primary_location: { landing_page_url: 'https://example.org/paper', source: { display_name: 'Journal' } },
            abstract_inverted_index: { Vectors: [0], are: [1], useful: [2] },
          },
          { id: 'http://insecure.example/w2', title: 'No https anywhere' },
        ],
      }),
  })
  const wikipedia = new WikipediaSearch({
    fetchImpl: async () =>
      json({ pages: [{ key: 'Vector_database', title: 'Vector database', excerpt: 'A <span class="searchmatch">vector</span> &amp; store', description: 'Database type' }] }),
  })
  const cases: [string, SearchProvider, SearchHit['sourceType']][] = [
    ['OpenAlexSearch', openalex, 'paper'],
    ['WikipediaSearch', wikipedia, 'background'],
    ['FakeSearch (paper)', new FakeSearch('paper'), 'paper'],
    ['FakeSearch (background)', new FakeSearch('background'), 'background'],
  ]
  it.each(cases)('%s returns normalised, https-only hits', async (_n, provider, kind) => {
    expectValidHits(await provider.search('vector databases'), kind)
    expect(provider.kind).toBe(kind)
  })

  it('OpenAlex drops non-https results, strips tags, rebuilds the abstract', async () => {
    const hits = await openalex.search('q')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ title: 'A good paper', snippet: 'Vectors are useful', year: 2023, url: 'https://example.org/paper' })
  })

  it('Wikipedia builds the page URL and strips HTML from the excerpt', async () => {
    const [hit] = await wikipedia.search('q')
    expect(hit!.url).toBe('https://en.wikipedia.org/wiki/Vector_database')
    expect(hit!.snippet).toBe('Database type. A vector & store')
  })

  it('OpenAlex sends the key as api_key, and a failure never leaks it', async () => {
    let seen = ''
    const ok = new OpenAlexSearch({ apiKey: FAKE_KEY, fetchImpl: async (url) => ((seen = url), json({ results: [] })) })
    await ok.search('q')
    expect(new URL(seen).searchParams.get('api_key')).toBe(FAKE_KEY)

    const bad = new OpenAlexSearch({ apiKey: FAKE_KEY, fetchImpl: async () => new Response('x', { status: 500 }) })
    const err = await bad.search('q').catch((e: Error) => e)
    expect(String((err as Error).message)).not.toContain(FAKE_KEY)
  })

  it('abstractFromIndex handles null', () => expect(abstractFromIndex(null)).toBe(''))
})

describe('LLMProvider contract', () => {
  const messages = [
    { role: 'system' as const, content: 'sys' },
    { role: 'user' as const, content: 'hi' },
  ]

  it.each([
    ['FakeLLM', new FakeLLM()],
    [
      'GroqProvider',
      new GroqProvider({
        apiKey: FAKE_KEY,
        fetchImpl: async () => json({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 3, completion_tokens: 4 } }),
      }),
    ],
  ])('%s returns { text }', async (_n, llm) => {
    const r = await llm.complete(messages, { name: 'x', schema: {} })
    expect(typeof r.text).toBe('string')
  })

  it('Groq: JSON mode, bearer header, usage mapped', async () => {
    let init: RequestInit = {}
    const groq = new GroqProvider({
      apiKey: FAKE_KEY,
      model: 'openai/gpt-oss-20b',
      fetchImpl: async (_u, i) => ((init = i!), json({ choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 3, completion_tokens: 4 } })),
    })
    const r = await groq.complete(messages, { name: 'plan', schema: { type: 'object' } })
    const body = JSON.parse(String(init.body))
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.model).toBe('openai/gpt-oss-20b')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_KEY}`)
    expect(body.messages[0].content).toContain('JSON Schema')
    expect(r.usage).toEqual({ promptTokens: 3, completionTokens: 4 })
  })

  it('Groq: 429 backs off, then succeeds', async () => {
    const waits: number[] = []
    let n = 0
    const groq = new GroqProvider({
      apiKey: FAKE_KEY,
      sleep: async (ms) => void waits.push(ms),
      fetchImpl: async () => (++n < 3 ? new Response('', { status: 429, headers: { 'retry-after': '2' } }) : json({ choices: [{ message: { content: '{}' } }] })),
    })
    await expect(groq.complete(messages)).resolves.toMatchObject({ text: '{}' })
    expect(waits).toEqual([2000, 2000])
  })

  it('Groq: still 429 after backoff -> "rate limited, try again"', async () => {
    const groq = new GroqProvider({ apiKey: FAKE_KEY, sleep: async () => {}, fetchImpl: async () => new Response('', { status: 429 }) })
    const err = await groq.complete(messages).catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitedError)
    expect(err.message).toBe('rate limited, try again')
  })

  it('Groq: other errors do not leak the key or the response body', async () => {
    const groq = new GroqProvider({ apiKey: FAKE_KEY, fetchImpl: async () => new Response(`bad key ${FAKE_KEY}`, { status: 401 }) })
    const err = (await groq.complete(messages).catch((e: Error) => e)) as Error
    expect(err.message).toBe('Groq request failed (HTTP 401)')
  })

  it('Groq without a key is a config error', () => {
    expect(() => new GroqProvider({ apiKey: undefined })).toThrow(ProviderConfigError)
  })
})

describe('getProviders', () => {
  it('defaults to groq + free search and needs the Groq key', () => {
    expect(() => getProviders({})).toThrow('AI provider not configured')
    const p = getProviders({ GROQ_API_KEY: FAKE_KEY })
    expect([p.llm.name, p.papers.name, p.background.name]).toEqual(['groq', 'openalex', 'wikipedia'])
  })
  it('picks fakes by setting', () => {
    const fake = getProviders({ LLM_PROVIDER: 'fake', SEARCH_PROVIDER: 'fake' })
    expect(fake.llm.name).toBe('fake')
  })
  it('rejects unknown settings', () => {
    expect(() => getProviders({ LLM_PROVIDER: 'nope' })).toThrow(ProviderConfigError)
    expect(() => getProviders({ LLM_PROVIDER: 'fake', SEARCH_PROVIDER: 'nope' })).toThrow(ProviderConfigError)
  })
})
