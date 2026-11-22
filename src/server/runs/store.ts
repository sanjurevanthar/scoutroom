/** The pipeline's only door to the database, so tests can swap in memory. */
import type { ActionTools } from 'deepspace/worker'
import type { CardRecord, RunRecord, RunStatus, RunStepRecord, StepStatus } from '../../lib/run-types'

export interface RunStore {
  getRun(runId: string): Promise<RunRecord | null>
  updateRun(runId: string, patch: Partial<RunRecord>): Promise<void>
  /** Creates the step, or returns the one a crashed attempt already made. */
  beginStep(runId: string, teamId: string, seq: number, label: string): Promise<string>
  finishStep(stepId: string, status: StepStatus, detail: string): Promise<void>
  /** Replaces any cards this run saved before (a retried save never duplicates). */
  saveCards(runId: string, teamId: string, cards: Omit<CardRecord, 'teamId' | 'runId'>[]): Promise<void>
  /** Releases the room's lock, but only if this run holds it. */
  releaseLock(teamId: string, runId: string): Promise<void>
}

export class ToolsRunStore implements RunStore {
  constructor(private readonly tools: ActionTools) {}

  async getRun(runId: string) {
    const res = await this.tools.get<RunRecord>('runs', runId)
    return res.success ? res.data.record.data : null
  }

  async updateRun(runId: string, patch: Partial<RunRecord>) {
    const res = await this.tools.update('runs', runId, patch)
    if (!res.success) throw new Error(`could not update run: ${res.error}`)
  }

  async beginStep(runId: string, teamId: string, seq: number, label: string) {
    const data: RunStepRecord = { teamId, runId, seq, label, status: 'running', detail: '' }
    const created = await this.tools.create('run_steps', data)
    if (created.success) return created.data.recordId
    const existing = await this.tools.query('run_steps', { where: { runId, seq }, limit: 1 })
    const row = existing.success ? existing.data.records[0] : undefined
    if (!row) throw new Error(`could not create step: ${created.error}`)
    await this.tools.update('run_steps', row.recordId, { status: 'running', detail: '' })
    return row.recordId
  }

  async finishStep(stepId: string, status: StepStatus, detail: string) {
    await this.tools.update('run_steps', stepId, { status, detail })
  }

  async saveCards(runId: string, teamId: string, cards: Omit<CardRecord, 'teamId' | 'runId'>[]) {
    await this.tools.deleteWhere('cards', { runId })
    for (const c of cards) {
      const res = await this.tools.create('cards', { ...c, teamId, runId })
      if (!res.success) throw new Error(`could not save card: ${res.error}`)
    }
  }

  async releaseLock(teamId: string, runId: string) {
    const held = await this.tools.query<{ runId: string }>('run_locks', { where: { teamId }, limit: 1 })
    const row = held.success ? held.data.records[0] : undefined
    if (row && (row.data as { runId?: string }).runId === runId) await this.tools.remove('run_locks', row.recordId)
  }
}

export const isTerminal = (s: RunStatus) => s === 'done' || s === 'failed' || s === 'stopped'
