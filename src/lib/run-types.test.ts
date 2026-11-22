import { describe, expect, it } from 'vitest'
import { DEFAULT_STALE_RUN_MS, isRunStale, staleRunMs } from './run-types'

const NOW = 1_000_000
const STALE = 3000

describe('isRunStale', () => {
  it('fresh queued/running run is not stale', () => {
    expect(isRunStale({ status: 'running', lastProgressAt: NOW - 1000 }, NOW, STALE)).toBe(false)
    expect(isRunStale({ status: 'queued', lastProgressAt: NOW }, NOW, STALE)).toBe(false)
  })
  it('queued/running run with an old heartbeat is stale', () => {
    expect(isRunStale({ status: 'running', lastProgressAt: NOW - 5000 }, NOW, STALE)).toBe(true)
    expect(isRunStale({ status: 'queued', lastProgressAt: NOW - 5000 }, NOW, STALE)).toBe(true)
  })
  it('done, failed and stopped runs are never stale', () => {
    for (const status of ['done', 'failed', 'stopped'] as const) {
      expect(isRunStale({ status, lastProgressAt: NOW - 999_999 }, NOW, STALE)).toBe(false)
    }
  })
  it('edge: exactly at the threshold is not stale; one ms past it is', () => {
    expect(isRunStale({ status: 'running', lastProgressAt: NOW - STALE }, NOW, STALE)).toBe(false)
    expect(isRunStale({ status: 'running', lastProgressAt: NOW - STALE - 1 }, NOW, STALE)).toBe(true)
  })
  it('a run with no heartbeat (old record) is never judged stale', () => {
    expect(isRunStale({ status: 'running' }, NOW, STALE)).toBe(false)
  })
})

describe('staleRunMs', () => {
  it('uses the setting, else the 3-minute default', () => {
    expect(staleRunMs('3000')).toBe(3000)
    expect(staleRunMs(undefined)).toBe(DEFAULT_STALE_RUN_MS)
    expect(staleRunMs('abc')).toBe(DEFAULT_STALE_RUN_MS)
    expect(staleRunMs('0')).toBe(DEFAULT_STALE_RUN_MS)
    expect(DEFAULT_STALE_RUN_MS).toBe(180_000)
  })
})
