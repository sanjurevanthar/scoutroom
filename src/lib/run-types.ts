/** Shared by the worker and the pages. No runtime imports. */
export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'stopped'
export type StepStatus = 'running' | 'done' | 'failed'
export type SourceType = 'paper' | 'background'

/** Hard budget per run: LLM calls + search calls together. */
export const MAX_TOOL_CALLS = 8
export const RUN_LOCK_TTL_MS = 15 * 60 * 1000
export const ACTIVE_STATUSES: readonly RunStatus[] = ['queued', 'running']
/** A queued/running run with no progress for this long is treated as dead (setting STALE_RUN_MS). */
export const DEFAULT_STALE_RUN_MS = 3 * 60 * 1000
export const STALE_RUN_MESSAGE = 'Run stopped responding: marked as failed'

/** Reads the STALE_RUN_MS setting; anything that is not a positive number falls back to the default. */
export function staleRunMs(setting: string | undefined): number {
  const n = Number(setting)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STALE_RUN_MS
}

/**
 * THE stale rule (docs/design/07). A run is stale when it is still queued/running and has shown no
 * progress for more than `staleMs`. Done, failed and stopped runs are never stale. A run with no
 * heartbeat yet (created before this field existed) is never stale: the old lock TTL still covers it.
 */
export function isRunStale(
  run: { status: RunStatus; lastProgressAt?: number },
  now: number,
  staleMs: number,
): boolean {
  if (!ACTIVE_STATUSES.includes(run.status)) return false
  if (typeof run.lastProgressAt !== 'number' || run.lastProgressAt <= 0) return false
  return now - run.lastProgressAt > staleMs
}

export type RunRecord = {
  teamId: string
  question: string
  status: RunStatus
  toolCallsUsed: number
  error: string
  startedBy: string
  /** Heartbeat (ms since epoch): set at start and whenever a step or tool call begins/ends. */
  lastProgressAt?: number
}

export type RunStepRecord = {
  teamId: string
  runId: string
  seq: number
  label: string
  status: StepStatus
  detail: string
}

export type CardRecord = {
  teamId: string
  runId: string
  claim: string
  sourceUrl: string
  sourceTitle: string
  sourceType: SourceType
  confidence: number
}
