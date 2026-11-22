/** Shared by the worker and the pages. No runtime imports. Rule: docs/design/07 "Card decision rule". */
export type VoteValue = 'keep' | 'reject'
export type CardStatus = 'kept' | 'rejected' | 'undecided'

export type VoteRecord = {
  teamId: string
  cardId: string
  userId: string
  value: VoteValue
}

export const isVoteValue = (v: unknown): v is VoteValue => v === 'keep' || v === 'reject'

/**
 * The ONE place the rule lives.
 * KEPT when keeps > rejects AND keeps >= 1; REJECTED when rejects > keeps; otherwise UNDECIDED.
 */
export function cardStatus(keeps: number, rejects: number): CardStatus {
  if (keeps > rejects && keeps >= 1) return 'kept'
  if (rejects > keeps) return 'rejected'
  return 'undecided'
}

export interface Tally {
  keeps: number
  rejects: number
  status: CardStatus
  /** The given user's own vote, if any. */
  mine: VoteValue | null
}

/** Counts one card's votes. Pass the votes for that card only. */
export function tally(votes: readonly Pick<VoteRecord, 'userId' | 'value'>[], myUserId?: string | null): Tally {
  let keeps = 0
  let rejects = 0
  let mine: VoteValue | null = null
  for (const v of votes) {
    if (v.value === 'keep') keeps += 1
    else if (v.value === 'reject') rejects += 1
    if (myUserId && v.userId === myUserId) mine = v.value
  }
  return { keeps, rejects, status: cardStatus(keeps, rejects), mine }
}
