/**
 * Background-job handler, invoked by AppJobRoom (worker.ts) for every job.
 * Dispatch on `job.type`. Only server code enqueues (the job room denies all
 * client writes); the one job type today is the scout run, enqueued by startRun.
 */
import type { Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { createActionTools } from './server/action-routes'
import { SCOUT_JOB, runScoutJob } from './server/runs/job'

export async function runJob(job: Job, ctx: JobContext, env: Env): Promise<void> {
  switch (job.type) {
    case SCOUT_JOB:
      // Records are written as the user who started the run (a job has no identity of its own).
      return runScoutJob(job, ctx, env, createActionTools(env, job.enqueuedBy ?? 'scout-agent', ''))
    default:
      throw new Error(`Unknown job type: ${job.type}`)
  }
}
