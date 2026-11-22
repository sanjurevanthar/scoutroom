/** Shared by the worker and the pages. No runtime imports. */
export type RoomRole = 'owner' | 'researcher' | 'viewer'
export type AssignableRole = Exclude<RoomRole, 'owner'>

export const DEFAULT_RUN_LIMIT = 5
export const TITLE_MAX = 120
export const QUESTION_MAX = 500

export interface RoomRecord {
  title: string
  question: string
  teamId: string
  ownerId: string
  runLimit: number
  runsUsed: number
}

export interface MemberRecord {
  teamId: string
  userId: string
  role: RoomRole
  status: 'active' | 'removed'
}

export interface InviteRecord {
  teamId: string
  code: string
  role: AssignableRole
  expiresAt: number
  revoked: number
}
