import { describe, expect, it } from 'vitest'
import type { SearchHit } from '../../providers/types'
import { parseCards, parsePlan } from './cards'

const hits: SearchHit[] = [
  { title: 'Paper A', url: 'https://doi.org/a', snippet: 's', sourceType: 'paper', sourceName: 'OpenAlex', year: 2024 },
  { title: 'Wiki B', url: 'https://en.wikipedia.org/wiki/B', snippet: 's', sourceType: 'background', sourceName: 'Wikipedia' },
  { title: 'Paper C', url: 'https://doi.org/c', snippet: 's', sourceType: 'paper', sourceName: 'OpenAlex' },
]
const card = (sourceUrl: string, extra: Record<string, unknown> = {}) => ({ claim: 'A claim', sourceUrl, confidence: 0.9, ...extra })
const reply = (cards: unknown[]) => JSON.stringify({ cards })

describe('parseCards', () => {
  it('accepts valid cards and takes title and type from our hit, not the model', () => {
    const r = parseCards(reply([card(hits[0]!.url), card(hits[1]!.url), card(hits[2]!.url)]), hits)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cards[0]).toMatchObject({ sourceTitle: 'Paper A', sourceType: 'paper', confidence: 0.9 })
    expect(r.cards[1]).toMatchObject({ sourceType: 'background' })
  })

  it('caps background (Wikipedia) confidence below paper confidence', () => {
    const r = parseCards(reply([card(hits[0]!.url), card(hits[1]!.url, { confidence: 0.99 }), card(hits[2]!.url)]), hits)
    expect(r.ok && r.cards[1]!.confidence).toBe(0.6)
  })

  it('rejects text that is not JSON', () => {
    expect(parseCards('Sure! Here are your cards', hits)).toEqual({ ok: false, error: 'the reply was not valid JSON' })
  })

  it('rejects a made-up URL', () => {
    const r = parseCards(reply([card(hits[0]!.url), card('https://made-up.example/paper'), card(hits[2]!.url)]), hits)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/not one of the provided sources/)
  })

  it('rejects a lookalike URL (http instead of https, trailing slash)', () => {
    for (const url of ['http://doi.org/a', 'https://doi.org/a/']) {
      expect(parseCards(reply([card(url), card(hits[1]!.url), card(hits[2]!.url)]), hits).ok).toBe(false)
    }
  })

  it.each([
    ['extra key on a card', [card(hits[0]!.url, { source: 'x' }), card(hits[1]!.url), card(hits[2]!.url)]],
    ['confidence above 1', [card(hits[0]!.url, { confidence: 1.5 }), card(hits[1]!.url), card(hits[2]!.url)]],
    ['empty claim', [card(hits[0]!.url, { claim: '' }), card(hits[1]!.url), card(hits[2]!.url)]],
    ['claim over 280 chars', [card(hits[0]!.url, { claim: 'x'.repeat(281) }), card(hits[1]!.url), card(hits[2]!.url)]],
    ['too few cards', [card(hits[0]!.url)]],
    ['too many cards', Array.from({ length: 7 }, () => card(hits[0]!.url))],
  ])('rejects %s', (_name, cards) => {
    expect(parseCards(reply(cards), hits).ok).toBe(false)
  })

  it('rejects extra top-level keys and a missing cards array', () => {
    expect(parseCards(JSON.stringify({ cards: [], note: 'hi' }), hits).ok).toBe(false)
    expect(parseCards('{}', hits).ok).toBe(false)
  })

  it('needs fewer cards when we had fewer sources', () => {
    expect(parseCards(reply([card(hits[0]!.url)]), [hits[0]!]).ok).toBe(true)
  })
})

describe('parsePlan', () => {
  it('accepts 1-2 paper queries and one background query', () => {
    expect(parsePlan('{"paperQueries":["vector databases","ann search"],"backgroundQuery":"vector database"}')).not.toBeNull()
  })
  it('rejects bad shapes', () => {
    expect(parsePlan('nope')).toBeNull()
    expect(parsePlan('{"paperQueries":["a","b","c"],"backgroundQuery":"x"}')).toBeNull()
    expect(parsePlan('{"paperQueries":["valid query"],"backgroundQuery":"valid","extra":1}')).toBeNull()
  })
})
