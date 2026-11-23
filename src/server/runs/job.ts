/** The `scout-run` job: one pipeline step per tick, state carried by ctx.continue. */
import type { ActionTools, Job, JobContext } from 'deepspace/worker'
import { getProviders } from '../../providers'
import type { ProviderEnv } from '../../providers'
import { failRun, initialState, runTick } from './pipeline'
import type { RunState } from './pipeline'
import { ToolsRunStore } from './store'

export const SCOUT_JOB = 'scout-run'
const TICK_GAP_MS = 50

export interface ScoutPayload {
  runId: string
  teamId: string
  question: string
}

export async function runScoutJob(job: Job, ctx: JobContext, env: ProviderEnv, tools: ActionTools): Promise<void> {
  const payload = job.payload as ScoutPayload
  const state = (job.resumeFrom as RunState | undefined) ?? initialState(payload.runId, payload.teamId, payload.question)
  const store = new ToolsRunStore(tools)
  try {
    const next = await runTick(state, { providers: getProviders(env, tools.integration), store, signal: ctx.signal })
    if (next) ctx.continue(next, { afterMs: TICK_GAP_MS })
  } catch (e) {
    // Log the kind of error only: provider messages are ours, but never log request data.
    console.error(`[scout-run] run=${payload.runId} step=${state.step} ${e instanceof Error ? e.name : 'error'}`)
    await failRun(state, e, store)
  }
}
