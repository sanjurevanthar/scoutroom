/** In-memory RunStore for unit tests. */
import type { CardRecord, RunRecord, RunStepRecord, StepStatus } from '../../lib/run-types'
import type { RunStore } from './store'

export class MemoryStore implements RunStore {
  runs = new Map<string, RunRecord>()
  steps: (RunStepRecord & { id: string })[] = []
  cards: CardRecord[] = []
  lock: { teamId: string; runId: string } | null = null

  constructor(run: RunRecord & { id: string }) {
    this.runs.set(run.id, run)
    this.lock = { teamId: run.teamId, runId: run.id }
  }

  async getRun(runId: string) {
    return this.runs.get(runId) ?? null
  }
  async updateRun(runId: string, patch: Partial<RunRecord>) {
    this.runs.set(runId, { ...this.runs.get(runId)!, ...patch })
  }
  async beginStep(runId: string, teamId: string, seq: number, label: string) {
    const existing = this.steps.find((s) => s.runId === runId && s.seq === seq)
    if (existing) return existing.id
    const id = `step-${seq}`
    this.steps.push({ id, runId, teamId, seq, label, status: 'running', detail: '' })
    return id
  }
  async finishStep(stepId: string, status: StepStatus, detail: string) {
    const s = this.steps.find((x) => x.id === stepId)!
    s.status = status
    s.detail = detail
  }
  async saveCards(runId: string, teamId: string, cards: Omit<CardRecord, 'teamId' | 'runId'>[]) {
    this.cards = [...this.cards.filter((c) => c.runId !== runId), ...cards.map((c) => ({ ...c, teamId, runId }))]
  }
  async releaseLock(teamId: string, runId: string) {
    if (this.lock?.teamId === teamId && this.lock.runId === runId) this.lock = null
  }
}
