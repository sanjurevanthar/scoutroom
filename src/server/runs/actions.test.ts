/** startRun's lock and reaper with fake tools (in-memory records) and a mocked job queue. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { STALE_RUN_MESSAGE } from '../../lib/run-types'
import type { RunRecord } from '../../lib/run-types'

const enqueue = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('deepspace/worker', () => ({ enqueueJob: enqueue }))
import { startRun } from './actions'

type Row = { recordId: string; data: Record<string, any> }
const ROOM = 'room-1'
const STALE_MS = 3000

function fakeTools(failRemove = false) {
  const db: Record<string, Row[]> = {
    team_members: [
      { recordId: 'm1', data: { teamId: ROOM, userId: 'owner', role: 'owner', status: 'active' } },
      { recordId: 'm2', data: { teamId: ROOM, userId: 'view', role: 'viewer', status: 'active' } },
    ],
    rooms: [{ recordId: ROOM, data: { teamId: ROOM, question: 'Q?', runLimit: 5, runsUsed: 0 } }],
    runs: [],
    run_locks: [],
  }
  let n = 0
  const match = (r: Row, w: Record<string, unknown> = {}) => Object.entries(w).every(([k, v]) => r.data[k] === v)
  const tools = {
    async get(c: string, id: string) {
      const r = db[c]!.find((x) => x.recordId === id)
      return r ? { success: true, data: { record: r } } : { success: false, error: 'not found' }
    },
    async query(c: string, o: { where?: Record<string, unknown> } = {}) {
      return { success: true, data: { records: db[c]!.filter((r) => match(r, o.where)) } }
    },
    async create(c: string, data: Record<string, any>, id?: string) {
      if (c === 'run_locks' && db.run_locks!.some((l) => l.data.teamId === data.teamId)) return { success: false, error: 'Duplicate' }
      const recordId = id ?? `${c}-${++n}`
      db[c]!.push({ recordId, data })
      return { success: true, data: { recordId } }
    },
    async update(c: string, id: string, patch: Record<string, any>) {
      const r = db[c]!.find((x) => x.recordId === id)
      if (!r) return { success: false, error: 'not found' }
      Object.assign(r.data, patch)
      return { success: true, data: { recordId: id } }
    },
    async remove(c: string, id: string) {
      const i = db[c]!.findIndex((x) => x.recordId === id)
      if (failRemove || i < 0) return { success: false, error: 'not found' }
      db[c]!.splice(i, 1)
      return { success: true, data: {} }
    },
    async deleteWhere(c: string, w: Record<string, unknown>) {
      db[c] = db[c]!.filter((r) => !match(r, w))
      return { success: true, data: {} }
    },
  } as unknown as ActionTools
  return { tools, db }
}

const env = { LLM_PROVIDER: 'fake', SEARCH_PROVIDER: 'fake', STALE_RUN_MS: String(STALE_MS), JOB_ROOMS: {}, DEEPSPACE_APP_ID: 'a' } as never
const start = (tools: ActionTools, userId = 'owner') => startRun({ userId, params: { roomId: ROOM }, tools, env } as never) as Promise<any>

/** A room whose current run holds the lock. `lockExpiresIn` < 0 means the 15-minute TTL has passed. */
function seedRun(db: Record<string, Row[]>, run: Partial<RunRecord>, lockExpiresIn = 600_000) {
  db.runs!.push({ recordId: 'old', data: { teamId: ROOM, question: 'Q?', status: 'running', toolCallsUsed: 1, error: '', startedBy: 'owner', ...run } })
  db.run_locks!.push({ recordId: 'lock-old', data: { teamId: ROOM, runId: 'old', expiresAt: Date.now() + lockExpiresIn } })
}

beforeEach(() => enqueue.mockClear())

describe('startRun: stuck runs', () => {
  it('stale run: reaped as failed with the message, lock released, a new run starts', async () => {
    const { tools, db } = fakeTools()
    seedRun(db, { lastProgressAt: Date.now() - STALE_MS - 1000 })
    const res = await start(tools)
    expect(res.success).toBe(true)
    expect(db.runs!.find((r) => r.recordId === 'old')!.data).toMatchObject({ status: 'failed', error: STALE_RUN_MESSAGE })
    expect(db.run_locks).toHaveLength(1)
    expect(db.run_locks![0]!.data.runId).toBe(res.data.runId)
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it('fresh run is NOT reaped: refused as already active', async () => {
    const { tools, db } = fakeTools()
    seedRun(db, { lastProgressAt: Date.now() - 1000 })
    const res = await start(tools)
    expect(res).toMatchObject({ success: false, error: 'a run is already active in this room' })
    expect(db.runs![0]!.data.status).toBe('running')
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('issue 2: expired 15-minute lock but fresh progress -> still refused', async () => {
    const { tools, db } = fakeTools()
    seedRun(db, { lastProgressAt: Date.now() - 1000 }, -60_000)
    expect((await start(tools)).error).toMatch(/already active/)
    expect(db.runs![0]!.data.status).toBe('running')
  })

  it('a run that ended but left its lock behind: freed only once the TTL has passed', async () => {
    const a = fakeTools()
    seedRun(a.db, { status: 'done', lastProgressAt: Date.now() - 999_999 }, 600_000)
    expect((await start(a.tools)).error).toMatch(/already active/)
    const b = fakeTools()
    seedRun(b.db, { status: 'done', lastProgressAt: Date.now() - 999_999 }, -1000)
    expect((await start(b.tools)).success).toBe(true)
  })

  it('old run without a heartbeat falls back to the TTL rule', async () => {
    const { tools, db } = fakeTools()
    seedRun(db, {}, -1000)
    expect((await start(tools)).success).toBe(true)
  })

  it('if releasing the stale lock fails, refuses cleanly and creates no run', async () => {
    const { tools, db } = fakeTools(true)
    seedRun(db, { lastProgressAt: Date.now() - STALE_MS - 1000 })
    const res = await start(tools)
    expect(res).toMatchObject({ success: false, error: 'a run is already active in this room' })
    expect(db.runs).toHaveLength(1)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('two startRuns at once on a stale room: exactly one wins', async () => {
    const { tools, db } = fakeTools()
    seedRun(db, { lastProgressAt: Date.now() - STALE_MS - 1000 })
    const results = await Promise.all([start(tools), start(tools)])
    expect(results.filter((r) => r.success)).toHaveLength(1)
    expect(db.run_locks).toHaveLength(1)
    expect(db.runs!.filter((r) => r.data.status === 'queued')).toHaveLength(1)
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it('a viewer cannot start a run, even on a stale room', async () => {
    const { tools, db } = fakeTools()
    seedRun(db, { lastProgressAt: Date.now() - STALE_MS - 1000 })
    expect((await start(tools, 'view')).error).toBe('forbidden: role=viewer')
    expect(db.runs![0]!.data.status).toBe('running')
  })
})
