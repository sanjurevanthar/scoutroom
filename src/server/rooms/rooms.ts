/**
 * Room actions: create, invite, join, change role, remove member.
 * Each action validates input, checks the caller's role, then writes.
 */
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../../worker'
import {
  DEFAULT_RUN_LIMIT,
  QUESTION_MAX,
  TITLE_MAX,
  type AssignableRole,
  type InviteRecord,
} from '../../lib/room-types'
import { fail, failFrom, isFail, requireMember, requireOwner, findMembership } from './access'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const isAssignable = (v: unknown): v is AssignableRole => v === 'researcher' || v === 'viewer'

export const createRoom: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const title = str(params.title)
  const question = str(params.question)
  if (!title || title.length > TITLE_MAX) return fail(`title must be 1-${TITLE_MAX} characters`)
  if (!question || question.length > QUESTION_MAX) {
    return fail(`question must be 1-${QUESTION_MAX} characters`)
  }

  const roomId = crypto.randomUUID()
  const room = await tools.create(
    'rooms',
    { title, question, teamId: roomId, ownerId: userId, runLimit: DEFAULT_RUN_LIMIT, runsUsed: 0 },
    roomId,
  )
  if (!room.success) return room

  const member = await tools.create('team_members', {
    teamId: roomId,
    userId,
    role: 'owner',
    status: 'active',
  })
  if (!member.success) {
    await tools.remove('rooms', roomId) // no half-created room without an owner
    return member
  }
  return { success: true, data: { roomId } }
}

/** Returns the owner's current invite for the room, or makes one. The link stays stable until it expires. */
export const createInviteLink: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const roomId = str(params.roomId)
  const owner = await requireOwner(tools, roomId, userId)
  if (isFail(owner)) return owner

  const existing = await tools.query<Record<string, unknown>>('invites', {
    where: { teamId: roomId },
  })
  if (existing.success) {
    const now = Date.now()
    const live = existing.data.records
      .map((r) => r.data as unknown as InviteRecord)
      .find((i) => !i.revoked && i.expiresAt > now)
    if (live) return { success: true, data: { token: live.code } }
  }

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')
  const created = await tools.create('invites', {
    teamId: roomId,
    code: token,
    role: 'researcher',
    expiresAt: Date.now() + INVITE_TTL_MS,
    revoked: 0,
  })
  if (!created.success) return created
  return { success: true, data: { token } }
}

export const joinByInvite: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const token = str(params.token)
  if (!token) return fail('invite link is not valid')

  const found = await tools.query<Record<string, unknown>>('invites', {
    where: { code: token },
    limit: 1,
  })
  const invite = found.success ? (found.data.records[0]?.data as unknown as InviteRecord) : undefined
  if (!invite || invite.revoked) return fail('invite link is not valid')
  if (invite.expiresAt <= Date.now()) return fail('invite link has expired')

  // Already a member: succeed without touching their role.
  const existing = await findMembership(tools, invite.teamId, userId)
  if (existing) return { success: true, data: { roomId: invite.teamId, role: existing.role } }

  const joined = await tools.create('team_members', {
    teamId: invite.teamId,
    userId,
    role: invite.role,
    status: 'active',
  })
  if (!joined.success) return joined
  return { success: true, data: { roomId: invite.teamId, role: invite.role } }
}

export const changeRole: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const roomId = str(params.roomId)
  const targetId = str(params.userId)
  if (!isAssignable(params.role)) return fail('role must be researcher or viewer')

  const owner = await requireOwner(tools, roomId, userId)
  if (isFail(owner)) return owner
  const target = await requireMember(tools, roomId, targetId)
  if (isFail(target)) return fail('that person is not in this room')
  if (target.role === 'owner') return fail("the owner's role cannot be changed")

  const updated = await tools.update('team_members', target.recordId, { role: params.role })
  return updated.success ? { success: true, data: { userId: targetId, role: params.role } } : failFrom(updated, 'update failed')
}

export const removeMember: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const roomId = str(params.roomId)
  const targetId = str(params.userId)

  const owner = await requireOwner(tools, roomId, userId)
  if (isFail(owner)) return owner
  if (targetId === userId) return fail('the owner cannot remove themselves')
  const target = await requireMember(tools, roomId, targetId)
  if (isFail(target)) return fail('that person is not in this room')

  const removed = await tools.remove('team_members', target.recordId)
  return removed.success ? { success: true, data: { userId: targetId } } : failFrom(removed, 'remove failed')
}

export const roomActions: Record<string, ActionHandler<Env>> = {
  createRoom,
  createInviteLink,
  joinByInvite,
  changeRole,
  removeMember,
}
