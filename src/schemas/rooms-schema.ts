/**
 * Room collections (docs/design/06).
 *
 * Reads: members of a room only, via DeepSpace's `'team'` rule. The rule needs
 * a `team_members` collection with `teamId`, `userId` and `status` columns,
 * and a `teamField` on each room collection.
 * Writes: denied for every role. All writes are server actions (src/server/rooms).
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

export const roomsSchema: CollectionSchema = {
  name: 'rooms',
  columns: [
    text('title', { required: true }),
    text('question', { required: true }),
    // Equals the room's own record id, so `'team'` can resolve membership.
    text('teamId', { required: true }),
    text('ownerId', { required: true }),
    number('runLimit'),
    number('runsUsed'),
  ],
  teamField: 'teamId',
  permissions: {
    viewer: { read: 'team', ...noClientWrites },
    member: { read: 'team', ...noClientWrites },
    admin: { read: true, ...noClientWrites },
  },
}

export const teamMembersSchema: CollectionSchema = {
  name: 'team_members',
  columns: [
    text('teamId', { required: true }),
    text('userId', { required: true, userBound: true, immutable: true }),
    select('role', ['owner', 'researcher', 'viewer']),
    select('status', ['active', 'removed']),
  ],
  uniqueOn: ['teamId', 'userId'],
  teamField: 'teamId',
  permissions: {
    viewer: { read: 'team', ...noClientWrites },
    member: { read: 'team', ...noClientWrites },
    admin: { read: true, ...noClientWrites },
  },
}

/** Invite links. Nobody but the server reads these: the token is a secret. */
export const invitesSchema: CollectionSchema = {
  name: 'invites',
  columns: [
    text('teamId', { required: true }),
    text('code', { required: true }),
    select('role', ['researcher', 'viewer']),
    number('expiresAt'),
    { name: 'revoked', storage: 'number' as const, interpretation: 'plain' as const },
  ],
  uniqueOn: ['code'],
  permissions: {
    viewer: { read: false, ...noClientWrites },
    member: { read: false, ...noClientWrites },
    admin: { read: false, ...noClientWrites },
  },
}

export const roomSchemas: CollectionSchema[] = [roomsSchema, teamMembersSchema, invitesSchema]
