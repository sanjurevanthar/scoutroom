import { describe, expect, it } from 'vitest'
import { keptCardIds, sameSet } from '../../lib/brief'
import { parseBrief } from './parse'

const KEPT = ['c1', 'c2']
const ALL = ['c1', 'c2', 'c3']
const ok = (paragraphs: unknown) => JSON.stringify({ paragraphs })

describe('parseBrief (citation validation)', () => {
  it('accepts valid paragraphs and returns the cited ids in order of first appearance', () => {
    const r = parseBrief(ok([{ text: 'A.', citations: ['c2'] }, { text: 'B.', citations: ['c1', 'c2', 'c1'] }]), KEPT, ALL)
    expect(r).toEqual({
      ok: true,
      paragraphs: [{ text: 'A.', citations: ['c2'] }, { text: 'B.', citations: ['c1', 'c2'] }],
      citedCardIds: ['c2', 'c1'],
    })
  })
  it('rejects an unknown (made-up) card id', () => {
    const r = parseBrief(ok([{ text: 'A.', citations: ['c1', 'made-up'] }]), KEPT, ALL)
    expect(r).toEqual({ ok: false, error: 'citation made-up is not a card you were given' })
  })
  it('rejects a real card that is not kept', () => {
    const r = parseBrief(ok([{ text: 'A.', citations: ['c3'] }]), KEPT, ALL)
    expect(r).toEqual({ ok: false, error: 'citation c3 is not a kept card' })
  })
  it('rejects bad JSON', () => {
    expect(parseBrief('not json {', KEPT, ALL)).toEqual({ ok: false, error: 'the reply was not valid JSON' })
  })
  it.each([
    ['wrong shape', JSON.stringify({ text: 'x' })],
    ['no paragraphs', ok([])],
    ['5 paragraphs', ok(Array.from({ length: 5 }, () => ({ text: 'x', citations: ['c1'] })))],
    ['paragraph with no citation', ok([{ text: 'x', citations: [] }])],
    ['empty text', ok([{ text: '  ', citations: ['c1'] }])],
    ['extra key', ok([{ text: 'x', citations: ['c1'], extra: 1 }])],
    ['extra top-level key', JSON.stringify({ paragraphs: [{ text: 'x', citations: ['c1'] }], note: 'hi' })],
  ])('rejects %s', (_name, text) => {
    expect(parseBrief(text, KEPT, ALL).ok).toBe(false)
  })
})

describe('keptCardIds / sameSet', () => {
  const v = (cardId: string, userId: string, value: 'keep' | 'reject') => ({ cardId, userId, value })
  it('uses the one kept rule: keeps > rejects and keeps >= 1', () => {
    const votes = [v('a', 'u1', 'keep'), v('b', 'u1', 'keep'), v('b', 'u2', 'reject'), v('c', 'u1', 'reject')]
    expect(keptCardIds(['c', 'b', 'a', 'd'], votes)).toEqual(['a'])
  })
  it('compares sets regardless of order', () => {
    expect(sameSet(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(sameSet(['a'], ['a', 'b'])).toBe(false)
  })
})
