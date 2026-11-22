/**
 * The board: run button + usage, live step timeline, and the card grid.
 * Everything comes from live queries, so every member watches a run as it happens.
 */
import { useEffect, useState } from 'react'
import { useAuth, useQuery } from 'deepspace'
import { Badge, Button, EmptyState } from '@/components/ui'
import { FOCUS_CARD_EVENT } from '@/lib/brief'
import { roomsApi } from '@/lib/rooms-api'
import type { RoomRecord, RoomRole } from '@/lib/room-types'
import { DEFAULT_STALE_RUN_MS, isRunStale } from '@/lib/run-types'
import type { CardRecord, RunRecord, RunStepRecord } from '@/lib/run-types'
import { tally } from '@/lib/votes'
import type { CardStatus, VoteRecord } from '@/lib/votes'
import { CardVotes, STATUS_LABEL } from './CardVotes'

type Filter = 'all' | CardStatus
const FILTERS: Filter[] = ['all', 'kept', 'undecided', 'rejected']

interface ScoutBoardProps {
  roomId: string
  room: RoomRecord
  role: RoomRole | undefined
}

export function ScoutBoard({ roomId, room, role }: ScoutBoardProps) {
  const runs = useQuery<RunRecord>('runs', { where: { teamId: roomId }, orderBy: 'createdAt', orderDir: 'desc' })
  const latest = runs.records[0]
  const steps = useQuery<RunStepRecord>('run_steps', { where: { runId: latest?.recordId ?? '-' } })
  const cards = useQuery<CardRecord>('cards', { where: { teamId: roomId }, orderBy: 'createdAt', orderDir: 'desc' })

  const votes = useQuery<VoteRecord>('votes', { where: { teamId: roomId } })
  const { userId } = useAuth()
  const [filter, setFilter] = useState<Filter>('all')

  // A [n] in the brief asks us to show one card: clear the filter, scroll to it, highlight it for a while.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  useEffect(() => {
    const onFocus = (e: Event) => {
      setFilter('all')
      setHighlightId((e as CustomEvent<string>).detail)
    }
    window.addEventListener(FOCUS_CARD_EVENT, onFocus)
    return () => window.removeEventListener(FOCUS_CARD_EVENT, onFocus)
  }, [])
  useEffect(() => {
    if (!highlightId) return
    document.querySelector(`[data-card-id="${CSS.escape(highlightId)}"][data-testid="card"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setHighlightId(null), 6000)
    return () => clearTimeout(t)
  }, [highlightId])

  const [starting, setStarting] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])
  const [stopping, setStopping] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const canRun = role === 'owner' || role === 'researcher'
  const running = latest?.data.status === 'queued' || latest?.data.status === 'running'
  // A run with no progress for a few minutes is dead; startRun (the server) is the judge and will reap it.
  const stuck = !!latest && isRunStale(latest.data, now, DEFAULT_STALE_RUN_MS)
  const active = running && !stuck
  const used = room.runsUsed ?? 0
  const limit = room.runLimit ?? 0
  const limitReached = used >= limit

  async function start() {
    setStarting(true)
    setActionError(null)
    const res = await roomsApi.startRun(roomId)
    setStarting(false)
    if (!res.success) setActionError(res.error)
  }

  async function stop() {
    if (!latest) return
    setStopping(true)
    const res = await roomsApi.stopRun(latest.recordId)
    setStopping(false)
    if (!res.success) setActionError(res.error)
  }

  const orderedSteps = [...steps.records].sort((a, b) => a.data.seq - b.data.seq)
  const loading = runs.status === 'loading' || cards.status === 'loading'

  // Counts and status come from the votes, live, through the one rule in lib/votes.ts.
  const votesByCard = new Map<string, VoteRecord[]>()
  for (const v of votes.records) {
    const list = votesByCard.get(v.data.cardId) ?? []
    list.push(v.data)
    votesByCard.set(v.data.cardId, list)
  }
  const rows = cards.records.map((c) => ({ card: c, tally: tally(votesByCard.get(c.recordId) ?? [], userId) }))
  const counts: Record<Filter, number> = {
    all: rows.length,
    kept: rows.filter((r) => r.tally.status === 'kept').length,
    undecided: rows.filter((r) => r.tally.status === 'undecided').length,
    rejected: rows.filter((r) => r.tally.status === 'rejected').length,
  }
  const visible = rows.filter((r) => filter === 'all' || r.tally.status === filter)

  return (
    <section className="space-y-6" aria-label="Scout board">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
        {canRun ? (
          <Button onClick={start} disabled={starting || active || limitReached} data-testid="run-scout">
            {starting ? 'Starting...' : active ? 'Scout running...' : 'Run scout'}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="viewer-note">
            Viewers can watch runs but not start them.
          </p>
        )}
        {canRun && stuck && (
          <p className="w-full text-sm text-destructive" role="status" data-testid="run-stuck">
            This run seems stuck. Click Run scout to start a new one.
          </p>
        )}
        {canRun && active && (
          <Button variant="outline" onClick={stop} disabled={stopping} data-testid="stop-run">
            {stopping ? 'Stopping...' : 'Stop'}
          </Button>
        )}
        <span className="text-sm text-muted-foreground" data-testid="runs-used">
          {used} / {limit} runs used
        </span>
        {limitReached && (
          <Badge variant="warning" data-testid="limit-reached">Run limit reached</Badge>
        )}
        {actionError && (
          <p role="alert" className="w-full text-sm text-destructive" data-testid="action-error">
            {actionError}
          </p>
        )}
      </div>

      {latest && (
        <div className="rounded-lg border border-border bg-card p-4" data-testid="run-timeline" data-run-status={latest.data.status}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Latest run</h2>
            <Badge variant={STATUS_VARIANT[latest.data.status]} data-testid="run-status">{latest.data.status}</Badge>
          </div>
          <ol className="space-y-1.5 text-sm">
            {orderedSteps.map((s) => (
              <li key={s.recordId} className="flex gap-2" data-testid="run-step" data-status={s.data.status}>
                <span aria-hidden className="w-4 text-center">{STEP_ICON[s.data.status]}</span>
                <span>
                  {s.data.label}
                  {s.data.status === 'running' ? '…' : ''}
                  {s.data.detail && <span className="text-muted-foreground"> — {s.data.detail}</span>}
                </span>
              </li>
            ))}
            {latest.data.status === 'queued' && orderedSteps.length === 0 && (
              <li className="text-muted-foreground">Starting…</li>
            )}
            {latest.data.status === 'done' && (
              <li className="flex gap-2 font-medium" data-testid="run-done">
                <span aria-hidden className="w-4 text-center">✓</span>Done
              </li>
            )}
            {latest.data.status === 'stopped' && (
              <li className="text-muted-foreground" data-testid="run-stopped">Stopped. No cards were saved from this run.</li>
            )}
          </ol>
          {latest.data.status === 'failed' && (
            <p role="alert" className="mt-3 rounded-md border border-destructive p-3 text-sm text-destructive" data-testid="run-error">
              {latest.data.error || 'The run failed. Try again.'}
            </p>
          )}
        </div>
      )}

      {loading && <p className="text-muted-foreground">Loading cards...</p>}
      {cards.status === 'error' && (
        <p role="alert" className="text-sm text-destructive">Could not load cards. {cards.error}</p>
      )}
      {!loading && cards.status === 'ready' && cards.records.length === 0 && (
        <div className="rounded-lg border border-dashed border-border" data-testid="cards-empty">
          <EmptyState
            title="No evidence cards yet"
            description={canRun ? 'Run the scout to find papers and background for the question.' : 'Cards appear here when a researcher runs the scout.'}
          />
        </div>
      )}
      {votes.status === 'error' && (
        <p role="alert" className="text-sm text-destructive" data-testid="votes-error">
          Could not load votes. {votes.error}
        </p>
      )}
      {cards.records.length > 0 && (
        <div role="tablist" aria-label="Filter cards" className="flex flex-wrap gap-2" data-testid="card-filters">
          {FILTERS.map((f) => (
            <Button
              key={f}
              role="tab"
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              data-testid={`filter-${f}`}
            >
              {f === 'all' ? 'All' : STATUS_LABEL[f]} ({counts[f]})
            </Button>
          ))}
        </div>
      )}
      {cards.records.length > 0 && visible.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="filter-empty">
          No {filter} cards yet.
        </p>
      )}
      {visible.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="card-grid">
          {visible.map(({ card: c, tally: t }) => (
            <li
              key={c.recordId}
              className={`flex flex-col gap-2 rounded-lg border bg-card p-4 ${highlightId === c.recordId ? 'border-primary ring-2 ring-primary' : 'border-border'}`}
              data-testid="card"
              data-card-id={c.recordId}
              data-highlighted={highlightId === c.recordId ? 'true' : 'false'}
            >
              <p className="text-sm" data-testid="card-claim">{c.data.claim}</p>
              <a
                href={c.data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline-offset-2 hover:underline"
                data-testid="card-source"
              >
                {c.data.sourceTitle}
              </a>
              <div className="mt-auto flex items-center gap-2">
                <Badge variant={c.data.sourceType === 'paper' ? 'info' : 'secondary'} data-testid="card-type">
                  {c.data.sourceType}
                </Badge>
                <span className="text-xs text-muted-foreground" data-testid="card-confidence">
                  confidence {Math.round(c.data.confidence * 100)}%
                </span>
              </div>
              <CardVotes cardId={c.recordId} tally={t} canVote={canRun} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const STATUS_VARIANT = {
  queued: 'secondary',
  running: 'info',
  done: 'success',
  failed: 'destructive',
  stopped: 'warning',
} as const

const STEP_ICON = { running: '…', done: '✓', failed: '✕' } as const
