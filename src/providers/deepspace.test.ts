/** DeepSpace adapter contract tests. Sample responses only: no network, no credits. */
import { describe, expect, it } from 'vitest'
import anthropicSample from './fixtures/anthropic-chat.recorded.json'
import exaSample from './fixtures/exa-search.recorded.json'
import scholarSample from './fixtures/scholar-search.documented.json'
import { DeepSpaceAnthropicProvider, ExaSearch, ScholarSearch } from './deepspace'
import type { IntegrationCall } from './deepspace'
import { getProviders } from './index'
import { CreditsExhaustedError, ProviderConfigError, ProviderError, RateLimitedError } from './types'

const ok = (data: unknown): IntegrationCall => async () => ({ success: true, data })
const failing = (f: { code?: string; status?: number; error?: string }): IntegrationCall => async () => ({ success: false, ...f })
const messages = [
  { role: 'system' as const, content: 'sys' },
  { role: 'user' as const, content: 'hi' },
]

describe('DeepSpaceAnthropicProvider (anthropic/chat-completion)', () => {
  it('sends system separately, the Haiku model, and the schema hint', async () => {
    let seen: { endpoint: string; body: any } | undefined
    const llm = new DeepSpaceAnthropicProvider(async (endpoint, body) => ((seen = { endpoint, body }), { success: true, data: anthropicSample }))
    const r = await llm.complete(messages, { name: 'x', schema: { type: 'object' } })
    expect(seen!.endpoint).toBe('anthropic/chat-completion')
    expect(seen!.body.model).toBe('claude-haiku-5-5')
    expect(seen!.body.system).toContain('sys')
    expect(seen!.body.system).toContain('JSON Schema')
    expect(seen!.body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(r).toEqual({ text: '{"ok":true}', usage: { promptTokens: 27, completionTokens: 9 } })
    expect(llm.model).toBe('claude-haiku-5-5')
  })

  it('model can be overridden', () => {
    expect(new DeepSpaceAnthropicProvider(ok({}), 'claude-haiku-4-5').model).toBe('claude-haiku-4-5')
  })

  it('removes a ```json fence only', async () => {
    const llm = new DeepSpaceAnthropicProvider(ok({ content: [{ type: 'text', text: '```json\n{"a":1}\n```' }] }))
    expect((await llm.complete(messages)).text).toBe('{"a":1}')
  })

  it('402 insufficient credits -> "Out of DeepSpace credits"', async () => {
    const err = await new DeepSpaceAnthropicProvider(failing({ code: 'insufficient_credits', status: 402 })).complete(messages).catch((e) => e)
    expect(err).toBeInstanceOf(CreditsExhaustedError)
    expect(err.message).toMatch(/^Out of DeepSpace credits/)
  })

  it('other errors are a clear message that never carries provider text', async () => {
    const err = await new DeepSpaceAnthropicProvider(failing({ status: 502, error: 'secret upstream detail' })).complete(messages).catch((e) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect(err.message).not.toContain('secret')
  })

  it('429 maps to the rate-limited error; an empty reply is an error', async () => {
    await expect(new DeepSpaceAnthropicProvider(failing({ status: 429 })).complete(messages)).rejects.toBeInstanceOf(RateLimitedError)
    await expect(new DeepSpaceAnthropicProvider(ok({ content: [] })).complete(messages)).rejects.toBeInstanceOf(ProviderError)
  })
})

describe('ExaSearch (exa/search)', () => {
  it('maps recorded results to normalised background hits', async () => {
    let body: any
    const hits = await new ExaSearch(async (_e, b) => ((body = b), { success: true, data: exaSample })).search('rag evaluation')
    expect(body.query).toBe('rag evaluation')
    expect(body.numResults).toBe(3)
    expect(hits.length).toBe(exaSample.results.length)
    for (const h of hits) {
      expect(h.url.startsWith('https://')).toBe(true)
      expect(h.title.length).toBeGreaterThan(0)
      expect(h.snippet.length).toBeGreaterThan(0)
      expect(h.snippet.length).toBeLessThanOrEqual(500)
      expect(h).toMatchObject({ sourceType: 'background', sourceName: 'Exa' })
    }
    expect(hits[0]!.year).toBe(2026)
  })

  it('paper mode asks Exa for research papers and returns paper hits', async () => {
    let body: any
    const hits = await new ExaSearch(async (_e, b) => ((body = b), { success: true, data: exaSample }), 'paper').search('rag')
    expect(body.category).toBe('research paper')
    expect(hits.every((h) => h.sourceType === 'paper')).toBe(true)
    expect(new ExaSearch(ok({}), 'paper').kind).toBe('paper')
  })

  it('background mode sends no category', async () => {
    let body: any
    await new ExaSearch(async (_e, b) => ((body = b), { success: true, data: exaSample })).search('rag')
    expect(body.category).toBeUndefined()
  })

  it('drops non-https results and tolerates no results', async () => {
    const data = { results: [{ title: 'x', url: 'http://insecure.example', publishedDate: null, author: null, id: '1' }] }
    expect(await new ExaSearch(ok(data)).search('q')).toEqual([])
    expect(await new ExaSearch(ok({})).search('q')).toEqual([])
  })

  it('402 -> out of credits', async () => {
    await expect(new ExaSearch(failing({ code: 'insufficient_credits', status: 402 })).search('q')).rejects.toBeInstanceOf(CreditsExhaustedError)
  })
})

describe('ScholarSearch (scholar/search-papers)', () => {
  it('maps results to paper hits, https only, year from the summary', async () => {
    const search = new ScholarSearch(ok(scholarSample))
    const hits = await search.search('rag')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ sourceType: 'paper', sourceName: 'Google Scholar', year: 2020 })
    expect(hits[0]!.url.startsWith('https://')).toBe(true)
  })

  it('costs money per call, so the pipeline gets one query per run', () => {
    expect(new ScholarSearch(ok({})).maxQueries).toBe(1)
  })

  it('a provider failure is a clear error', async () => {
    const err = await new ScholarSearch(failing({ code: 'upstream_provider_error', status: 502 })).search('q').catch((e) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect(err.message).toBe('Paper search is unavailable right now. Try again in a minute.')
  })
})

describe('getProviders with DeepSpace', () => {
  it('default: Claude + Exa for papers and background', () => {
    const p = getProviders({ LLM_PROVIDER: 'deepspace', SEARCH_PROVIDER: 'deepspace' }, ok({}))
    expect([p.llm.name, p.papers.name, p.papers.kind, p.background.name, p.background.kind]).toEqual(['deepspace', 'exa', 'paper', 'exa', 'background'])
  })
  it('deepspace-scholar: papers come from Scholar', () => {
    const p = getProviders({ LLM_PROVIDER: 'deepspace', SEARCH_PROVIDER: 'deepspace-scholar' }, ok({}))
    expect([p.papers.name, p.background.name]).toEqual(['scholar', 'exa'])
  })
  it('needs server tools to reach the integrations', () => {
    expect(() => getProviders({ LLM_PROVIDER: 'deepspace', SEARCH_PROVIDER: 'deepspace' })).toThrow(ProviderConfigError)
  })
})
