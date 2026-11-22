/**
 * Agent-run collections (docs/design/06, 07).
 *
 * Reads: room members only (`'team'`). Writes: denied for every role; only
 * server actions and the scout-run job write, so nobody can forge a card.
 */
import type { CollectionSchema } from 'deepspace/schema'

const text = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  storage: 'text' as const,
  interpretation: 'plain' as const,
  ...extra,
})
const select = (name: string, options: string[]) => ({
  name,
  storage: 'text' as const,
  interpretation: { kind: 'select' as const, options },
})
const number = (name: string) => ({
  name,
  storage: 'number' as const,
  interpretation: 'plain' as const,
})

const noClientWrites = { create: false, update: false, delete: false } as const
const teamRead = {
  viewer: { read: 'team', ...noClientWrites },
  member: { read: 'team', ...noClientWrites },
  admin: { read: true, ...noClientWrites },
} as const

export const runsSchema: CollectionSchema = {
  name: 'runs',
  columns: [
    text('teamId', { required: true }),
    text('question', { required: true }),
    select('status', ['queued', 'running', 'done', 'failed', 'stopped']),
    number('toolCallsUsed'),
    text('error'),
    text('startedBy', { required: true }),
    number('lastProgressAt'),
  ],
  teamField: 'teamId',
  permissions: teamRead,
}

export const runStepsSchema: CollectionSchema = {
  name: 'run_steps',
  columns: [
    text('teamId', { required: true }),
    text('runId', { required: true }),
    number('seq'),
    text('label', { required: true }),
    select('status', ['running', 'done', 'failed']),
    text('detail'),
  ],
  // A retried job cannot create the same step twice.
  uniqueOn: ['runId', 'seq'],
  teamField: 'teamId',
  permissions: teamRead,
}

export const cardsSchema: CollectionSchema = {
  name: 'cards',
  columns: [
    text('teamId', { required: true }),
    text('runId', { required: true }),
    text('claim', { required: true }),
    text('sourceUrl', { required: true }),
    text('sourceTitle', { required: true }),
    select('sourceType', ['paper', 'background']),
    number('confidence'),
  ],
  teamField: 'teamId',
  permissions: teamRead,
}

/** One active run per room: `uniqueOn teamId` makes a second create fail. Nobody reads it. */
export const runLocksSchema: CollectionSchema = {
  name: 'run_locks',
  columns: [text('teamId', { required: true }), text('runId', { required: true }), number('expiresAt')],
  uniqueOn: ['teamId'],
  permissions: {
    viewer: { read: false, ...noClientWrites },
    member: { read: false, ...noClientWrites },
    admin: { read: false, ...noClientWrites },
  },
}



/**
 * One vote per person per card (docs/design/06). `uniqueOn cardId+userId` makes a second vote
 * by the same person impossible; changing a vote updates the same row. Members read; only the
 * `castVote` action writes.
 */
export const votesSchema: CollectionSchema = {
  name: 'votes',
  columns: [
    text('teamId', { required: true }),
    text('cardId', { required: true }),
    text('userId', { required: true }),
    select('value', ['keep', 'reject']),
  ],
  uniqueOn: ['cardId', 'userId'],
  teamField: 'teamId',
  permissions: teamRead,
}



/**
 * Cited briefs (F4, docs/design/06). History is kept (max 5 per room); the page shows the latest.
 * `uniqueOn teamId+seq` makes the per-room limit race-proof. JSON-valued fields are stored as text.
 * Members read; only the `generateBrief` action writes.
 */
export const briefsSchema: CollectionSchema = {
  name: 'briefs',
  columns: [
    text('teamId', { required: true }),
    number('seq'),
    text('content', { required: true }),
    text('citedCardIds'),
    text('keptCardIds'),
    text('createdBy', { required: true }),
    text('model'),
  ],
  uniqueOn: ['teamId', 'seq'],
  teamField: 'teamId',
  permissions: teamRead,
}

export const runSchemas: CollectionSchema[] = [runsSchema, runStepsSchema, cardsSchema, runLocksSchema, votesSchema, briefsSchema]
