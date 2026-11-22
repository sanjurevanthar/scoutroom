import { describe, expect, it } from 'vitest'
import { cardStatus, tally } from './votes'

describe('cardStatus (the kept rule)', () => {
  it.each([
    [0, 0, 'undecided'], // no votes
    [1, 0, 'kept'],
    [2, 1, 'kept'],
    [3, 3, 'undecided'], // tie
    [1, 1, 'undecided'], // tie, even though keeps >= 1
    [0, 1, 'rejected'], // only rejects
    [0, 4, 'rejected'],
    [1, 2, 'rejected'],
    [5, 4, 'kept'], // one-vote margin is enough
  ] as const)('%i keeps, %i rejects -> %s', (k, r, expected) => {
    expect(cardStatus(k, r)).toBe(expected)
  })
})

describe('tally', () => {
  it('counts votes and finds my own', () => {
    const t = tally(
      [
        { userId: 'a', value: 'keep' },
        { userId: 'b', value: 'reject' },
        { userId: 'c', value: 'keep' },
      ],
      'b',
    )
    expect(t).toEqual({ keeps: 2, rejects: 1, status: 'kept', mine: 'reject' })
  })
  it('handles no votes and no user', () => {
    expect(tally([])).toEqual({ keeps: 0, rejects: 0, status: 'undecided', mine: null })
  })
  it('mine is null when I have not voted', () => {
    expect(tally([{ userId: 'a', value: 'keep' }], 'z').mine).toBeNull()
  })
})
