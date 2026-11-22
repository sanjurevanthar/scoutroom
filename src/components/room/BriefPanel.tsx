/**
 * The Brief section: "Write brief", the latest cited brief, a Stale note, and the live state.
 * Everything comes from live queries, so every member sees a new brief appear without a refresh.
 */
import { useState } from 'react'
import { useQuery } from 'deepspace'
import { Badge, Button } from '@/components/ui'
import { BRIEF_LIMIT, FOCUS_CARD_EVENT, keptCardIds, parseJson, sameSet } from '@/lib/brief'
import type { BriefParagraph, BriefRecord } from '@/lib/brief'
import { roomsApi } from '@/lib/rooms-api'
import type { RoomRole } from '@/lib/room-types'
import type { CardRecord } from '@/lib/run-types'
import type { VoteRecord } from '@/lib/votes'

export function BriefPanel({ roomId, role }: { roomId: string; role: RoomRole | undefined }) {
  const briefs = useQuery<BriefRecord>('briefs', { where: { teamId: roomId } })
  const cards = useQuery<CardRecord>('cards', { where: { teamId: roomId } })
  const votes = useQuery<VoteRecord>('votes', { where: { teamId: roomId } })
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canWrite = role === 'owner' || role === 'researcher'
  const loading = briefs.status === 'loading' || cards.status === 'loading' || votes.status === 'loading'
  const loadError = briefs.status === 'error' ? briefs.error : cards.status === 'error' ? cards.error : votes.status === 'error' ? votes.error : null

  const all = [...briefs.records].sort((a, b) => a.data.seq - b.data.seq)
  const used = all.length
  const latest = all[all.length - 1]
  const limitReached = used >= BRIEF_LIMIT

  const keptNow = keptCardIds(
    cards.records.map((c) => c.recordId),
    votes.records.map((v) => v.data),
  )
  const noKept = keptNow.length === 0
  const paragraphs = parseJson<BriefParagraph[]>(latest?.data.content, [])
  const cited = parseJson<string[]>(latest?.data.citedCardIds, [])
  const keptThen = parseJson<string[]>(latest?.data.keptCardIds, [])
  const stale = !!latest && !sameSet(keptNow, keptThen)
  const cardById = new Map(cards.records.map((c) => [c.recordId, c.data]))

  async function write() {
    setWriting(true)
    setError(null)
    const res = await roomsApi.generateBrief(roomId)
    setWriting(false)
    if (!res.success) setError(res.error)
  }

  const focusCard = (id: string) => window.dispatchEvent(new CustomEvent(FOCUS_CARD_EVENT, { detail: id }))
  const marker = (id: string) => cited.indexOf(id) + 1

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-label="Brief" data-testid="brief-panel">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Brief</h2>
        {canWrite ? (
          <Button onClick={write} disabled={writing || noKept || limitReached || loading} data-testid="write-brief">
            {writing ? 'Writing brief...' : latest ? 'Write a new brief' : 'Write brief'}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="brief-viewer-note">Viewers can read the brief but not write it.</p>
        )}
        <span className="text-sm text-muted-foreground" data-testid="briefs-used">
          {used} / {BRIEF_LIMIT} briefs used
        </span>
        {limitReached && <Badge variant="warning" data-testid="brief-limit-reached">Brief limit reached</Badge>}
      </div>

      {canWrite && noKept && !loading && !limitReached && (
        <p className="text-sm text-muted-foreground" data-testid="brief-hint">Keep at least one card first.</p>
      )}
      {error && <p role="alert" className="text-sm text-destructive" data-testid="brief-error">{error}</p>}
      {loadError && <p role="alert" className="text-sm text-destructive">Could not load the brief. {loadError}</p>}
      {loading && !loadError && <p className="text-sm text-muted-foreground" data-testid="brief-loading">Loading brief...</p>}
      {writing && <p className="text-sm text-muted-foreground" data-testid="brief-writing">The AI is writing the brief from the kept cards…</p>}

      {!loading && !loadError && !latest && (
        <p className="text-sm text-muted-foreground" data-testid="brief-empty">
          No brief yet. {canWrite ? 'Keep some cards, then write one.' : 'A researcher can write one once cards are kept.'}
        </p>
      )}

      {latest && (
        <div className="space-y-3" data-testid="brief" data-brief-seq={latest.data.seq}>
          {stale && (
            <p className="rounded-md border border-border bg-muted p-2 text-sm" data-testid="brief-stale">
              <Badge variant="warning">Stale</Badge> Votes changed since this brief{canWrite ? ': regenerate?' : '.'}
            </p>
          )}
          {paragraphs.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed" data-testid="brief-paragraph">
              {p.text}{' '}
              {p.citations.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => focusCard(id)}
                  className="mx-0.5 rounded px-1 text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2"
                  aria-label={`Show card ${marker(id)}`}
                  data-testid="brief-cite"
                  data-card-id={id}
                >
                  [{marker(id)}]
                </button>
              ))}
            </p>
          ))}
          <ol className="space-y-1 border-t border-border pt-3 text-sm" aria-label="Sources" data-testid="brief-sources">
            {cited.map((id, i) => {
              const card = cardById.get(id)
              return (
                <li key={id} className="flex gap-2" data-testid="brief-source">
                  <span className="w-6 shrink-0 text-muted-foreground">[{i + 1}]</span>
                  {card ? (
                    <span>
                      {card.claim}{' '}
                      <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                        {card.sourceTitle}
                      </a>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">This card is no longer available.</span>
                  )}
                </li>
              )
            })}
          </ol>
          <p className="text-xs text-muted-foreground">
            Brief {latest.data.seq} · written from {keptThen.length} kept {keptThen.length === 1 ? 'card' : 'cards'} by {latest.data.model || 'AI'}
          </p>
        </div>
      )}
    </section>
  )
}
