/** Keep / Reject buttons, live counts and the status badge for one card. */
import { useState } from 'react'
import { Badge, Button } from '@/components/ui'
import { roomsApi } from '@/lib/rooms-api'
import type { CardStatus, Tally, VoteValue } from '@/lib/votes'

export const STATUS_LABEL: Record<CardStatus, string> = { kept: 'Kept', rejected: 'Rejected', undecided: 'Undecided' }
const STATUS_VARIANT = { kept: 'success', rejected: 'destructive', undecided: 'secondary' } as const

interface CardVotesProps {
  cardId: string
  tally: Tally
  canVote: boolean
}

export function CardVotes({ cardId, tally, canVote }: CardVotesProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function vote(value: VoteValue) {
    setPending(true)
    setError(null)
    // Clicking your current vote again undoes it.
    const res = await roomsApi.castVote(cardId, tally.mine === value ? null : value)
    setPending(false)
    if (!res.success) setError('Voting failed, try again.')
  }

  return (
    <div className="flex flex-col gap-2" data-testid="card-votes">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[tally.status]} data-testid="card-status" data-status={tally.status}>
          {STATUS_LABEL[tally.status]}
        </Badge>
        <span className="text-sm" data-testid="vote-counts" aria-label={`${tally.keeps} keep, ${tally.rejects} reject`}>
          👍 {tally.keeps} · 👎 {tally.rejects}
        </span>
        {canVote && (
          <span className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant={tally.mine === 'keep' ? 'default' : 'outline'}
              aria-pressed={tally.mine === 'keep'}
              disabled={pending}
              onClick={() => vote('keep')}
              data-testid="vote-keep"
            >
              Keep
            </Button>
            <Button
              size="sm"
              variant={tally.mine === 'reject' ? 'destructive' : 'outline'}
              aria-pressed={tally.mine === 'reject'}
              disabled={pending}
              onClick={() => vote('reject')}
              data-testid="vote-reject"
            >
              Reject
            </Button>
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="vote-error">
          {error}
        </p>
      )}
    </div>
  )
}
