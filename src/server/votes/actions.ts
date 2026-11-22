/** castVote: owner and researcher only, for cards in a room the caller belongs to. */
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../../worker'
import type { CardRecord } from '../../lib/run-types'
import { isVoteValue } from '../../lib/votes'
import type { VoteRecord } from '../../lib/votes'
import { fail, failFrom, isFail, requireMember } from '../rooms/access'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** params: { cardId, value: 'keep' | 'reject' | null }. null removes the caller's vote. */
export const castVote: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const cardId = str(params.cardId)
  const value = params.value ?? null
  if (!cardId) return fail('cardId is required')
  if (value !== null && !isVoteValue(value)) return fail('value must be keep, reject or null')

  // The room comes from the card, never from the caller: a client cannot vote into a room by claiming it.
  const card = await tools.get<CardRecord>('cards', cardId)
  if (!card.success) return fail('card not found')
  const teamId = card.data.record.data.teamId

  const member = await requireMember(tools, teamId, userId)
  if (isFail(member)) return member
  if (member.role !== 'owner' && member.role !== 'researcher') return fail(`forbidden: role=${member.role}`)

  const existing = async () => {
    const res = await tools.query<VoteRecord>('votes', { where: { cardId, userId }, limit: 1 })
    return res.success ? res.data.records[0] : undefined
  }
  const mine = await existing()

  if (value === null) {
    if (mine) {
      const removed = await tools.remove('votes', mine.recordId)
      if (!removed.success) return failFrom(removed, 'could not remove the vote')
    }
    return { success: true, data: { cardId, value: null } }
  }

  if (mine) {
    if (mine.data.value !== value) {
      const updated = await tools.update('votes', mine.recordId, { value })
      if (!updated.success) return failFrom(updated, 'could not change the vote')
    }
    return { success: true, data: { cardId, value } }
  }

  const created = await tools.create('votes', { teamId, cardId, userId, value } satisfies VoteRecord)
  if (created.success) return { success: true, data: { cardId, value } }

  // Two clicks at once: uniqueOn refused the second create. The vote exists now, so update it.
  const raced = await existing()
  if (raced) {
    const updated = await tools.update('votes', raced.recordId, { value })
    if (updated.success) return { success: true, data: { cardId, value } }
  }
  return failFrom(created, 'could not save the vote')
}

export const voteActions: Record<string, ActionHandler<Env>> = { castVote }
