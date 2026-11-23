/**
 * The scout pipeline, one step per tick (docs/design/07).
 *
 *   plan -> papers -> background -> cards (validate, save, finish)
 *
 * `runTick` does exactly one step, saves it as a run_steps record, and returns
 * the state for the next tick (the job passes it to ctx.continue). It returns
 * null when the run is finished. It has no DeepSpace imports: the store and the
 * providers are injected, so unit tests run it with fakes and memory.
 */
import { MAX_TOOL_CALLS } from '../../lib/run-types'
import type { Providers, SearchHit } from '../../providers/types'
import { CreditsExhaustedError, ProviderConfigError, ProviderError, RateLimitedError } from '../../providers/types'
import { parseCards, parsePlan } from './cards'
import type { Plan } from './cards'
import { CARDS_SCHEMA, PLAN_SCHEMA, cardsMessages, planMessages, repairMessages } from './prompts'
import { isTerminal } from './store'
import type { RunStore } from './store'

export type StepName = 'plan' | 'papers' | 'background' | 'cards'

export interface RunState {
  runId: string
  teamId: string
  question: string
  step: StepName
  toolCalls: number
  plan?: Plan
  hits: SearchHit[]
}

export interface PipelineDeps {
  providers: Providers
  store: RunStore
  signal?: AbortSignal
}

export function initialState(runId: string, teamId: string, question: string): RunState {
  return { runId, teamId, question, step: 'plan', toolCalls: 0, hits: [] }
}

/** An error whose message is safe and clear enough to show to the user. */
export class RunFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RunFailure'
  }
}

export class BudgetExceededError extends RunFailure {
  constructor() {
    super(`The run hit its limit of ${MAX_TOOL_CALLS} tool calls. Try again.`)
    this.name = 'BudgetExceededError'
  }
}

/** Turns any error into the sentence shown on the failed run. Never includes provider internals. */
export function humanMessage(e: unknown): string {
  if (e instanceof CreditsExhaustedError) return e.message
  if (e instanceof RateLimitedError) return 'Rate limited, try again.'
  if (e instanceof ProviderError) return e.message
  if (e instanceof RunFailure) return e.message
  if (e instanceof ProviderConfigError) return 'AI provider not configured.'
  if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
    return 'A request took too long. Try again.'
  }
  return 'Something went wrong while running the scout. Try again.'
}

const STEP_ORDER: StepName[] = ['plan', 'papers', 'background', 'cards']
const STEP_LABEL: Record<StepName, string> = {
  plan: 'Planning',
  papers: 'Searching papers',
  background: 'Checking background',
  cards: 'Writing cards',
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

/** Runs one step. Returns the next state, or null when the run has ended. */
export async function runTick(state: RunState, deps: PipelineDeps): Promise<RunState | null> {
  const { store, providers, signal } = deps
  const run = await store.getRun(state.runId)
  if (!run || isTerminal(run.status)) {
    // Stopped between steps: nothing more to do except free the room.
    await store.releaseLock(state.teamId, state.runId)
    return null
  }
  // Heartbeat: a step starting (and ending, below) tells startRun this run is alive.
  if (run.status === 'queued') await store.updateRun(state.runId, { status: 'running', lastProgressAt: Date.now() })
  else await store.updateRun(state.runId, { lastProgressAt: Date.now() })

  let toolCalls = Math.max(state.toolCalls, run.toolCallsUsed)
  const spend = async () => {
    if (toolCalls >= MAX_TOOL_CALLS) throw new BudgetExceededError()
    toolCalls += 1
    await store.updateRun(state.runId, { toolCallsUsed: toolCalls, lastProgressAt: Date.now() })
  }

  const seq = STEP_ORDER.indexOf(state.step) + 1
  const stepId = await store.beginStep(state.runId, state.teamId, seq, STEP_LABEL[state.step])
  let next: RunState = { ...state, toolCalls }
  let detail = ''

  try {
    switch (state.step) {
      case 'plan': {
        await spend()
        const reply = await providers.llm.complete(planMessages(state.question), PLAN_SCHEMA, signal)
        const plan = parsePlan(reply.text)
        // A bad plan is not worth failing the run: search with the question itself.
        const used: Plan = plan ?? { paperQueries: [state.question.slice(0, 200)], backgroundQuery: state.question.slice(0, 200) }
        detail = plan
          ? `${plural(used.paperQueries.length, 'paper query', 'paper queries')} + 1 background query`
          : 'Plan was unclear, searching with the question itself'
        next = { ...next, step: 'papers', plan: used }
        break
      }
      case 'papers': {
        const queries = state.plan?.paperQueries.slice(0, providers.papers.maxQueries ?? 2) ?? [state.question]
        let failed = 0
        const hits = [...state.hits]
        for (const q of queries) {
          await spend()
          try {
            hits.push(...(await providers.papers.search(q, signal)))
          } catch (e) {
            if (e instanceof BudgetExceededError || e instanceof CreditsExhaustedError) throw e
            failed += 1
          }
        }
        const found = dedupe(hits).length
        detail = `${plural(found, 'paper')} found` + (failed ? `, ${failed} of ${queries.length} searches failed` : '')
        next = { ...next, step: 'background', hits: dedupe(hits), plan: state.plan }
        break
      }
      case 'background': {
        await spend()
        let failed = false
        const hits = [...state.hits]
        try {
          hits.push(...(await providers.background.search(state.plan?.backgroundQuery ?? state.question, signal)))
        } catch (e) {
          if (e instanceof CreditsExhaustedError) throw e
          failed = true
        }
        const all = dedupe(hits)
        if (all.length === 0) {
          throw new RunFailure(
            failed
              ? 'Search is unavailable right now. Try again in a minute.'
              : 'No sources were found for this question. Try rewording it.',
          )
        }
        detail = `${plural(all.length - state.hits.length, 'background article')} found` + (failed ? ' (lookup failed)' : '')
        next = { ...next, step: 'cards', hits: all }
        break
      }
      case 'cards': {
        await spend()
        const messages = cardsMessages(state.question, state.hits)
        let reply = await providers.llm.complete(messages, CARDS_SCHEMA, signal)
        let parsed = parseCards(reply.text, state.hits)
        if (!parsed.ok) {
          await spend() // the one repair attempt
          reply = await providers.llm.complete(repairMessages(messages, reply.text, parsed.error), CARDS_SCHEMA, signal)
          parsed = parseCards(reply.text, state.hits)
        }
        if (!parsed.ok) throw new RunFailure('The AI did not return cards we could verify. Try again.')

        // Stopped (or reaped as stuck) while the model was thinking: save nothing.
        const latest = await store.getRun(state.runId)
        if (!latest || isTerminal(latest.status)) {
          await store.finishStep(stepId, 'done', 'Stopped before saving')
          await store.releaseLock(state.teamId, state.runId)
          return null
        }
        await store.saveCards(state.runId, state.teamId, parsed.cards)
        await store.updateRun(state.runId, { status: 'done', toolCallsUsed: toolCalls })
        await store.finishStep(stepId, 'done', plural(parsed.cards.length, 'card') + ' saved')
        await store.releaseLock(state.teamId, state.runId)
        return null
      }
    }
  } catch (e) {
    await store.finishStep(stepId, 'failed', humanMessage(e)).catch(() => {})
    throw e
  }

  await store.finishStep(stepId, 'done', detail)
  await store.updateRun(state.runId, { lastProgressAt: Date.now() }).catch(() => {})
  return next
}

function dedupe(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>()
  return hits.filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true)))
}

/** Marks the run failed with a readable message and frees the room. Never throws. */
export async function failRun(state: Pick<RunState, 'runId' | 'teamId'>, error: unknown, store: RunStore): Promise<void> {
  try {
    const run = await store.getRun(state.runId)
    // Never overwrite a run that already ended (stopped, or reaped as stuck with its own message).
    if (run && !isTerminal(run.status)) {
      await store.updateRun(state.runId, { status: 'failed', error: humanMessage(error) })
    }
  } finally {
    await store.releaseLock(state.teamId, state.runId).catch(() => {})
  }
}
