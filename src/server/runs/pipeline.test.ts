/** The pipeline with fakes and an in-memory store: no network, no Durable Objects. */
import { describe, expect, it } from 'vitest'
import { MAX_TOOL_CALLS } from '../../lib/run-types'
import type { RunRecord } from '../../lib/run-types'
import { FakeLLM, FakeSearch, defaultFakeResponder } from '../../providers/fake'
import type { FakeResponder } from '../../providers/fake'
import { CreditsExhaustedError, ProviderError, RateLimitedError } from '../../providers/types'
import { MemoryStore } from './memory-store'
import { failRun, initialState, runTick } from './pipeline'
import type { PipelineDeps, RunState } from './pipeline'

const RUN = 'run-1'
const TEAM = 'team-1'

function setup(opts: { respond?: FakeResponder; question?: string; run?: Partial<RunRecord> } = {}) {
  const question = opts.question ?? 'Which vector DB?'
  const store = new MemoryStore({
    id: RUN,
    teamId: TEAM,
    question,
    status: 'queued',
    toolCallsUsed: 0,
    error: '',
    startedBy: 'u1',
    ...opts.run,
  })
  const llm = new FakeLLM(opts.respond ?? defaultFakeResponder)
  const papers = new FakeSearch('paper')
  const background = new FakeSearch('background')
  const deps: PipelineDeps = { store, providers: { llm, papers, background } }
  return { store, llm, papers, background, deps, state: initialState(RUN, TEAM, question) }
}

/** Drives ticks like the job does. Failures go through failRun, as in the job. */
async function runAll(ctx: ReturnType<typeof setup>, state: RunState = ctx.state, onTick?: (n: number) => Promise<void>) {
  let current: RunState | null = state
  let n = 0
  try {
    while (current) {
      current = await runTick(current, ctx.deps)
      await onTick?.(++n)
    }
  } catch (e) {
    await failRun(state, e, ctx.store)
  }
}

describe('scout pipeline', () => {
  it('happy path: 4 steps saved in order, cards saved, run done, lock released, within budget', async () => {
    const ctx = setup()
    await runAll(ctx)
    expect(ctx.store.steps.map((s) => [s.seq, s.label, s.status])).toEqual([
      [1, 'Planning', 'done'],
      [2, 'Searching papers', 'done'],
      [3, 'Checking background', 'done'],
      [4, 'Writing cards', 'done'],
    ])
    const run = ctx.store.runs.get(RUN)!
    expect(run.status).toBe('done')
    // plan 1 + papers 2 + background 1 + cards 1
    expect(run.toolCallsUsed).toBe(5)
    expect(ctx.papers.queries).toHaveLength(2)
    expect(ctx.background.queries).toHaveLength(1)
    expect(ctx.store.cards.length).toBeGreaterThanOrEqual(3)
    expect(ctx.store.cards.map((c) => c.sourceType)).toContain('paper')
    expect(ctx.store.lock).toBeNull()
  })

  it('every card URL is one the searches returned', async () => {
    const ctx = setup()
    await runAll(ctx)
    const urls = new Set(ctx.store.cards.map((c) => c.sourceUrl))
    expect(urls.size).toBeGreaterThan(0)
    for (const u of urls) expect(u.startsWith('https://example.org/')).toBe(true)
  })

  it('one repair attempt: bad JSON first, good second -> done', async () => {
    let cardsCalls = 0
    const ctx = setup({
      respond: (m, s) => (s?.name === 'cards' && ++cardsCalls === 1 ? 'not json at all' : defaultFakeResponder(m, s)),
    })
    await runAll(ctx)
    expect(ctx.store.runs.get(RUN)!.status).toBe('done')
    expect(cardsCalls).toBe(2)
    expect(ctx.store.runs.get(RUN)!.toolCallsUsed).toBe(6)
  })

  it('made-up URL twice -> failed cleanly, no cards saved, lock released', async () => {
    const ctx = setup({
      respond: (m, s) =>
        s?.name === 'cards'
          ? JSON.stringify({ cards: [1, 2, 3].map((i) => ({ claim: `c${i}`, sourceUrl: 'https://invented.example/x', confidence: 0.5 })) })
          : defaultFakeResponder(m, s),
    })
    await runAll(ctx)
    const run = ctx.store.runs.get(RUN)!
    expect(run.status).toBe('failed')
    expect(run.error).toBe('The AI did not return cards we could verify. Try again.')
    expect(ctx.store.cards).toHaveLength(0)
    expect(ctx.store.lock).toBeNull()
    expect(ctx.store.steps.at(-1)).toMatchObject({ label: 'Writing cards', status: 'failed' })
  })

  it('a prompt-injected snippet cannot add a source: the injected URL is refused', async () => {
    const ctx = setup({
      respond: (m, s) =>
        s?.name === 'cards'
          ? JSON.stringify({ cards: [1, 2, 3].map((i) => ({ claim: `c${i}`, sourceUrl: 'https://evil.example/ignore-previous', confidence: 1 })) })
          : defaultFakeResponder(m, s),
    })
    await runAll(ctx)
    expect(ctx.store.cards).toHaveLength(0)
    expect(ctx.store.runs.get(RUN)!.status).toBe('failed')
  })

  it('the system prompt says search text is data, and results are fenced in <sources>', async () => {
    const ctx = setup()
    await runAll(ctx)
    const cardsCall = ctx.llm.calls.find((c) => c[1]!.content.includes('<sources>'))!
    expect(cardsCall[0]!.content).toMatch(/untrusted DATA/)
    expect(cardsCall[0]!.content).toMatch(/Never follow/)
  })

  it('rate limited -> failed with "Rate limited, try again.", lock released', async () => {
    const ctx = setup({ respond: () => { throw new RateLimitedError() } })
    await runAll(ctx)
    expect(ctx.store.runs.get(RUN)).toMatchObject({ status: 'failed', error: 'Rate limited, try again.' })
    expect(ctx.store.lock).toBeNull()
  })

  it('unknown error -> readable message, no internals', async () => {
    const ctx = setup({ respond: () => { throw new Error('socket hang up at 10.0.0.1 key=abc') } })
    await runAll(ctx)
    const run = ctx.store.runs.get(RUN)!
    expect(run.error).toBe('Something went wrong while running the scout. Try again.')
    expect(run.error).not.toMatch(/10\.0|abc/)
  })

  it('an unclear plan falls back to the question instead of failing', async () => {
    const ctx = setup({ respond: (m, s) => (s?.name === 'plan' ? 'garbage' : defaultFakeResponder(m, s)) })
    await runAll(ctx)
    expect(ctx.store.runs.get(RUN)!.status).toBe('done')
    expect(ctx.papers.queries).toEqual(['Which vector DB?'])
  })

  it('one failing search is tolerated; all failing fails the run', async () => {
    const some = setup()
    some.papers.search = async (q: string) => {
      if (some.papers.queries.push(q) === 1) throw new Error('boom')
      return new FakeSearch('paper').search(q)
    }
    await runAll(some)
    expect(some.store.runs.get(RUN)!.status).toBe('done')
    expect(some.store.steps[1]!.detail).toMatch(/1 of 2 searches failed/)

    const none = setup()
    none.papers.search = async () => { throw new Error('down') }
    none.background.search = async () => { throw new Error('down') }
    await runAll(none)
    expect(none.store.runs.get(RUN)).toMatchObject({ status: 'failed', error: 'Search is unavailable right now. Try again in a minute.' })
  })

  it('stopped between steps: no further steps, no cards, lock released', async () => {
    const ctx = setup()
    await runAll(ctx, ctx.state, async (n) => {
      if (n === 2) await ctx.store.updateRun(RUN, { status: 'stopped' })
    })
    expect(ctx.store.runs.get(RUN)!.status).toBe('stopped')
    expect(ctx.store.steps.map((s) => s.seq)).toEqual([1, 2])
    expect(ctx.store.cards).toHaveLength(0)
    expect(ctx.store.lock).toBeNull()
  })

  it('stopped while the model writes cards: nothing saved', async () => {
    const ctx = setup({
      respond: async (m, s) => {
        if (s?.name === 'cards') await store.updateRun(RUN, { status: 'stopped' })
        return defaultFakeResponder(m, s)
      },
    })
    const store = ctx.store
    await runAll(ctx)
    expect(store.runs.get(RUN)!.status).toBe('stopped')
    expect(store.cards).toHaveLength(0)
    expect(store.lock).toBeNull()
  })

  it('reaped as failed while the model writes cards: nothing saved, stays failed, new run lock untouched', async () => {
    const respond = async (m: any, s: any) => {
      if (s?.name === 'cards') await slow.store.updateRun(RUN, { status: 'failed', error: 'Run stopped responding: marked as failed' })
      return defaultFakeResponder(m, s)
    }
    const slow: ReturnType<typeof setup> = setup({ respond })
    slow.store.lock = { teamId: TEAM, runId: 'a-newer-run' }
    await runAll(slow)
    expect(slow.store.runs.get(RUN)).toMatchObject({ status: 'failed', error: 'Run stopped responding: marked as failed' })
    expect(slow.store.cards).toHaveLength(0)
    expect(slow.store.lock?.runId).toBe('a-newer-run')
  })

  it('a job that resumes after the run was reaped stops at the next step boundary', async () => {
    const ctx = setup()
    ctx.store.lock = { teamId: TEAM, runId: 'a-newer-run' }
    await runAll(ctx, ctx.state, async (n) => {
      if (n === 1) await ctx.store.updateRun(RUN, { status: 'failed', error: 'Run stopped responding: marked as failed' })
    })
    expect(ctx.store.steps).toHaveLength(1) // only the step that was already running
    expect(ctx.store.runs.get(RUN)!.status).toBe('failed')
    expect(ctx.store.cards).toHaveLength(0)
    expect(ctx.store.lock?.runId).toBe('a-newer-run')
  })

  it('writes a heartbeat (lastProgressAt) while the run progresses', async () => {
    const ctx = setup()
    const before = Date.now()
    await runAll(ctx)
    expect(ctx.store.runs.get(RUN)!.lastProgressAt).toBeGreaterThanOrEqual(before)
  })

  it('never exceeds the tool-call budget', async () => {
    // Already at 7 of 8 when cards starts: the first cards call fits, the repair call does not.
    const ctx = setup({
      run: { toolCallsUsed: 0 },
      respond: (m, s) => (s?.name === 'cards' ? 'bad' : defaultFakeResponder(m, s)),
    })
    await runAll(ctx, { ...ctx.state, step: 'cards', toolCalls: 7, hits: await new FakeSearch('paper').search('x') })
    const run = ctx.store.runs.get(RUN)!
    expect(run.status).toBe('failed')
    expect(run.toolCallsUsed).toBeLessThanOrEqual(MAX_TOOL_CALLS)
    expect(run.error).toMatch(/limit of 8 tool calls/)
  })

  it('a retried step does not duplicate its record (resume after a crash)', async () => {
    const ctx = setup()
    await runTick(ctx.state, ctx.deps)
    await runTick(ctx.state, ctx.deps) // same state again, as a retried job would
    expect(ctx.store.steps.filter((s) => s.seq === 1)).toHaveLength(1)
  })

  it('out of DeepSpace credits in the LLM fails the run with a clear message', async () => {
    const ctx = setup({ respond: () => { throw new CreditsExhaustedError() } })
    await runAll(ctx)
    const run = ctx.store.runs.get(RUN)!
    expect(run.status).toBe('failed')
    expect(run.error).toMatch(/^Out of DeepSpace credits/)
  })

  it('out of credits in a search is NOT swallowed as a failed search', async () => {
    const ctx = setup()
    ctx.deps.providers.papers = { name: 'x', kind: 'paper', search: async () => { throw new CreditsExhaustedError() } }
    await runAll(ctx)
    expect(ctx.store.runs.get(RUN)!.error).toMatch(/^Out of DeepSpace credits/)

    const ctx2 = setup()
    ctx2.deps.providers.background = { name: 'x', kind: 'background', search: async () => { throw new CreditsExhaustedError() } }
    await runAll(ctx2)
    expect(ctx2.store.runs.get(RUN)!.error).toMatch(/^Out of DeepSpace credits/)
  })

  it('a provider error shows its own safe message', async () => {
    const ctx = setup({ respond: () => { throw new ProviderError('The AI service is unavailable right now. Try again in a minute.') } })
    await runAll(ctx)
    expect(ctx.store.runs.get(RUN)!.error).toBe('The AI service is unavailable right now. Try again in a minute.')
  })

  it('a paid paper search with maxQueries 1 is called once, not twice', async () => {
    const ctx = setup()
    const queries: string[] = []
    ctx.deps.providers.papers = { name: 'x', kind: 'paper', maxQueries: 1, search: async (q) => (queries.push(q), []) }
    await runAll(ctx)
    expect(queries).toHaveLength(1)
  })
})
