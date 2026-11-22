/** Client for the room server actions. Every call goes through /api/actions/:name. */
import { getAuthToken } from 'deepspace'
import type { AssignableRole } from './room-types'
import type { VoteValue } from './votes'

export type ActionResponse<T> = { success: true; data: T } | { success: false; error: string }

export async function callAction<T>(
  name: string,
  params: Record<string, unknown>,
): Promise<ActionResponse<T>> {
  try {
    const token = await getAuthToken()
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    if (res.status === 401) return { success: false, error: 'Please sign in again.' }
    return (await res.json()) as ActionResponse<T>
  } catch {
    return { success: false, error: 'Could not reach the server. Check your connection.' }
  }
}

export const roomsApi = {
  createRoom: (title: string, question: string) =>
    callAction<{ roomId: string }>('createRoom', { title, question }),
  createInviteLink: (roomId: string) => callAction<{ token: string }>('createInviteLink', { roomId }),
  joinByInvite: (token: string) => callAction<{ roomId: string }>('joinByInvite', { token }),
  changeRole: (roomId: string, userId: string, role: AssignableRole) =>
    callAction<{ userId: string }>('changeRole', { roomId, userId, role }),
  removeMember: (roomId: string, userId: string) =>
    callAction<{ userId: string }>('removeMember', { roomId, userId }),
  startRun: (roomId: string) => callAction<{ runId: string }>('startRun', { roomId }),
  stopRun: (runId: string) => callAction<{ runId: string }>('stopRun', { runId }),
  generateBrief: (roomId: string) => callAction<{ briefId: string; seq: number }>('generateBrief', { roomId }),
  castVote: (cardId: string, value: VoteValue | null) =>
    callAction<{ cardId: string; value: VoteValue | null }>('castVote', { cardId, value }),
}

export const inviteUrl = (token: string) => `${window.location.origin}/join/${token}`
