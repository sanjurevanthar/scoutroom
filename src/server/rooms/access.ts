/**
 * Role checks for room actions. Every action calls one of these before it
 * writes: actions bypass RBAC, so this is the real authorization boundary.
 * Never import action-routes here (import cycle, see docs/design/11).
 */
import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { MemberRecord, RoomRole } from '../../lib/room-types'

export type Fail = { success: false; error: string }
export const fail = (error: string): Fail => ({ success: false, error })

export interface Membership {
  recordId: string
  role: RoomRole
}

export async function findMembership(
  tools: ActionTools,
  teamId: string,
  userId: string,
): Promise<Membership | null> {
  const res = await tools.query<Record<string, unknown>>('team_members', {
    where: { teamId, userId },
    limit: 1,
  })
  if (!res.success) return null
  const row = res.data.records[0]
  if (!row) return null
  const data = row.data as unknown as MemberRecord
  if (data.status === 'removed') return null
  return { recordId: row.recordId, role: data.role }
}

/** Returns the caller's membership, or a failure ready to return from the action. */
export async function requireMember(
  tools: ActionTools,
  teamId: string,
  userId: string,
): Promise<Membership | Fail> {
  const m = await findMembership(tools, teamId, userId)
  return m ?? fail('not a member of this room')
}

export async function requireOwner(
  tools: ActionTools,
  teamId: string,
  userId: string,
): Promise<Membership | Fail> {
  const m = await requireMember(tools, teamId, userId)
  if ('success' in m) return m
  return m.role === 'owner' ? m : fail(`forbidden: role=${m.role}`)
}

export const isFail = (v: unknown): v is Fail =>
  typeof v === 'object' && v !== null && 'success' in v && (v as Fail).success === false

export function failFrom(result: ActionResult<unknown>, fallback: string): Fail {
  return fail(result.success ? fallback : result.error)
}
