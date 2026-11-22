/** Room page shell: question, members with live presence, and an empty board (F2 fills it). */
import { Link, useParams } from 'react-router-dom'
import { useAuth, usePresenceRoom, useQuery, useUsers } from 'deepspace'
import { EmptyState } from '@/components/ui'
import { InviteButton } from '@/components/room/InviteButton'
import { MemberList, type MemberRow } from '@/components/room/MemberList'
import type { MemberRecord, RoomRecord } from '@/lib/room-types'

export default function RoomPage() {
  const { roomId = '' } = useParams()
  const { userId } = useAuth()
  const room = useQuery<RoomRecord>('rooms', { where: { teamId: roomId } })
  const members = useQuery<MemberRecord>('team_members', { where: { teamId: roomId } })
  const { users } = useUsers()
  const { peers } = usePresenceRoom(`room:${roomId}`)

  if (room.status === 'loading' || members.status === 'loading') {
    return <p className="p-12 text-muted-foreground">Connecting...</p>
  }
  if (room.status === 'error' || members.status === 'error') {
    return <p role="alert" className="p-12 text-destructive">Could not load this room. {room.error ?? members.error}</p>
  }
  const current = room.records[0]
  if (!current) {
    return (
      <EmptyState
        title="You are not a member of this room"
        description="Ask the owner for an invite link."
        action={{ label: 'Back to your rooms', onClick: () => (window.location.href = '/rooms') }}
      />
    )
  }

  const onlineIds = new Set([...peers.map((p) => p.userId), ...(userId ? [userId] : [])])
  const rows: MemberRow[] = members.records.map((m) => ({
    userId: m.data.userId,
    name: users.find((u) => u.id === m.data.userId)?.name || 'Member',
    role: m.data.role,
    online: onlineIds.has(m.data.userId),
  }))
  const isOwner = rows.some((r) => r.userId === userId && r.role === 'owner')

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link to="/rooms" className="text-sm text-muted-foreground hover:text-foreground">← Rooms</Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight" data-testid="room-title">{current.data.title}</h1>
      <p className="mt-1 text-muted-foreground" data-testid="room-question">{current.data.question}</p>

      <div className="mt-8 grid gap-6 md:grid-cols-[18rem_1fr]">
        <aside className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Members ({rows.length})</h2>
          <MemberList roomId={roomId} members={rows} myId={userId ?? ''} isOwner={isOwner} />
          {isOwner && <InviteButton roomId={roomId} />}
        </aside>
        <section className="rounded-lg border border-dashed border-border">
          <EmptyState title="Agent runs arrive in Feature 2" description="Evidence cards will appear here." />
        </section>
      </div>
    </div>
  )
}
