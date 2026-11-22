import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
// Files imported here must never import server/action-routes at load time:
// that creates an import cycle and the actions map comes out empty (404s).
import { roomActions } from '../server/rooms/rooms'
import { runActions } from '../server/runs/actions'
import { voteActions } from '../server/votes/actions'

export const actions: Record<string, ActionHandler<Env>> = { ...roomActions, ...runActions, ...voteActions }
