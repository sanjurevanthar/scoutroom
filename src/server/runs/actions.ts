/** startRun and stopRun. Both check the caller's room role first: actions bypass RBAC. */
import { enqueueJob } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../../worker'
import { ACTIVE_STATUSES, RUN_LOCK_TTL_MS } from '../../lib/run-types'
import type { RunRecord } from '../../lib/run-types'
import type { RoomRecord } from '../../lib/room-types'
import { getProviders } from '../../providers'
import { fail, failFrom, isFail, requireMember } from '../rooms/access'
import type { Fail } from '../rooms/access'
import { SCOUT_JOB } from './job'
import type { ScoutPayload } from './job'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Each room gets its own job queue, so one room's run never waits for another's. */
export const jobScope = (env: Env, roomId: string) => `app:${env.DEEPSPACE_APP_ID}:room:${roomId}`

async function requireRunner(
  tools: Parameters<ActionHandler<Env>>[0]['tools'],
  roomId: string,
  userId: string,
): Promise<true | Fail> {
  const m = await requireMember(tools, roomId, userId)
  if (isFail(m)) return m
  return m.role === 'owner' || m.role === 'researcher' ? true : fail(`forbidden: role=${m.role}`)
}

export const startRun: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const roomId = str(params.roomId)
  const allowed = await requireRunner(tools, roomId, userId)
  if (isFail(allowed)) return allowed

  // Refuse early, before any lock or run exists, if the AI provider has no key.
  try {
    getProviders(env)
  } catch {
    return fail('AI provider not configured')
  }

  // One active run per room: the lock is the gate. `uniqueOn teamId` makes a second create fail.
  const runId = crypto.randomUUID()
  const lockData = { teamId: roomId, runId, expiresAt: Date.now() + RUN_LOCK_TTL_MS }
  let lock = await tools.create('run_locks', lockData)
  if (!lock.success) {
    // A dead job leaves a stale lock; take it over only once it has expired.
    const held = await tools.query<{ expiresAt: number }>('run_locks', { where: { teamId: roomId }, limit: 1 })
    const row = held.success ? held.data.records[0] : undefined
    if (row && (row.data as { expiresAt: number }).expiresAt < Date.now()) {
      await tools.remove('run_locks', row.recordId)
      lock = await tools.create('run_locks', lockData)
    }
    if (!lock.success) return fail('a run is already active in this room')
  }
  const release = () => tools.deleteWhere('run_locks', { teamId: roomId, runId })

  // Limit check happens under the lock, so two clicks cannot both squeeze past it.
  const room = await tools.get('rooms', roomId)
  if (!room.success) {
    await release()
    return fail('room not found')
  }
  const { runLimit, runsUsed, question } = room.data.record.data as unknown as RoomRecord
  if (runsUsed >= runLimit) {
    await release()
    return fail(`run limit reached (${runsUsed} of ${runLimit} used)`)
  }

  const created = await tools.create(
    'runs',
    { teamId: roomId, question, status: 'queued', toolCallsUsed: 0, error: '', startedBy: userId } satisfies RunRecord,
    runId,
  )
  if (!created.success) {
    await release()
    return failFrom(created, 'could not create run')
  }
  await tools.update('rooms', roomId, { runsUsed: runsUsed + 1 })

  try {
    const payload: ScoutPayload = { runId, teamId: roomId, question }
    await enqueueJob(env.JOB_ROOMS, jobScope(env, roomId), SCOUT_JOB, payload, { maxAttempts: 2, enqueuedBy: userId })
  } catch {
    // Nothing ran, so give the run back.
    await tools.update('runs', runId, { status: 'failed', error: 'Could not start the run. Try again.' })
    await tools.update('rooms', roomId, { runsUsed })
    await release()
    return fail('could not start the run, try again')
  }
  return { success: true, data: { runId } }
}

export const stopRun: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const runId = str(params.runId)
  const found = await tools.get<RunRecord>('runs', runId)
  if (!found.success) return fail('run not found')
  const run = found.data.record.data

  const allowed = await requireRunner(tools, run.teamId, userId)
  if (isFail(allowed)) return allowed
  if (!ACTIVE_STATUSES.includes(run.status)) return fail('this run is not active')

  const updated = await tools.update('runs', runId, { status: 'stopped' })
  if (!updated.success) return failFrom(updated, 'could not stop the run')
  // A running job frees the lock itself when it sees "stopped". A run still queued has no job
  // watching yet, so free the room now (only if this run holds the lock).
  if (run.status === 'queued') await tools.deleteWhere('run_locks', { teamId: run.teamId, runId })
  return { success: true, data: { runId } }
}

export const runActions: Record<string, ActionHandler<Env>> = { startRun, stopRun }
