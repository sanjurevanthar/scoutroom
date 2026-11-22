import { useState } from 'react'
import { Badge, Button, useToast } from '@/components/ui'
import { roomsApi } from '@/lib/rooms-api'
import type { AssignableRole, RoomRole } from '@/lib/room-types'

export interface MemberRow {
  userId: string
  name: string
  role: RoomRole
  online: boolean
}

interface MemberListProps {
  roomId: string
  members: MemberRow[]
  myId: string
  isOwner: boolean
}


const ROLE_OPTIONS: AssignableRole[] = ['researcher', 'viewer']

export function MemberList({ roomId, members, myId, isOwner }: MemberListProps) {
  const { error } = useToast()
  const [pending, setPending] = useState<string | null>(null)

  async function run(userId: string, action: () => ReturnType<typeof roomsApi.removeMember>) {
    setPending(userId)
    const res = await action()
    setPending(null)
    if (!res.success) error('Could not update member', res.error)
  }

  return (
    <ul className="divide-y divide-border" data-testid="member-list">
      {members.map((m) => {
        const canEdit = isOwner && m.role !== 'owner' && m.userId !== myId
        return (
          <li key={m.userId} className="flex items-center gap-2 py-2 text-sm" data-testid="member-row">
            <span
              aria-label={m.online ? 'online' : 'offline'}
              className={`size-2 rounded-full ${m.online ? 'bg-success' : 'bg-muted-foreground/40'}`}
            />
            <span className="flex-1 truncate">
              {m.name}
              {m.userId === myId && <span className="text-muted-foreground"> (you)</span>}
            </span>
            {canEdit ? (
              <>
                <select
                  aria-label={`Role for ${m.name}`}
                  value={m.role}
                  disabled={pending === m.userId}
                  onChange={(e) =>
                    run(m.userId, () => roomsApi.changeRole(roomId, m.userId, e.target.value as AssignableRole))
                  }
                  className="rounded-md border border-border bg-background px-1 py-0.5 text-xs"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending === m.userId}
                  onClick={() => run(m.userId, () => roomsApi.removeMember(roomId, m.userId))}
                >
                  Remove
                </Button>
              </>
            ) : (
              <Badge variant={m.role === 'owner' ? 'default' : 'secondary'} data-testid="member-role">
                {m.role}
              </Badge>
            )}
          </li>
        )
      })}
    </ul>
  )
}
