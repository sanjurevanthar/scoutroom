/**
 * The board: run button + usage, live step timeline, and the card grid.
 * Everything comes from live queries, so every member watches a run as it happens.
 */
import { useState } from 'react'
import { useQuery } from 'deepspace'
import { Badge, Button, EmptyState } from '@/components/ui'
import { roomsApi } from '@/lib/rooms-api'
import type { RoomRecord, RoomRole } from '@/lib/room-types'
import type { CardRecord, RunRecord, RunStepRecord } from '@/lib/run-types'

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

  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const canRun = role === 'owner' || role === 'researcher'
  const active = latest?.data.status === 'queued' || latest?.data.status === 'running'
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
      {cards.records.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="card-grid">
          {cards.records.map((c) => (
            <li key={c.recordId} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4" data-testid="card">
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
