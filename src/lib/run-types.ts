/** Shared by the worker and the pages. No runtime imports. */
export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'stopped'
export type StepStatus = 'running' | 'done' | 'failed'
export type SourceType = 'paper' | 'background'

/** Hard budget per run: LLM calls + search calls together. */
export const MAX_TOOL_CALLS = 8
export const RUN_LOCK_TTL_MS = 15 * 60 * 1000
export const ACTIVE_STATUSES: readonly RunStatus[] = ['queued', 'running']

export type RunRecord = {
  teamId: string
  question: string
  status: RunStatus
  toolCallsUsed: number
  error: string
  startedBy: string
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
