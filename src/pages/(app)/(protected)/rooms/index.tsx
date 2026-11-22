/** Rooms list: the rooms I belong to, plus "New room". */
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useQuery } from 'deepspace'
import { Badge, Button, EmptyState } from '@/components/ui'
import type { MemberRecord, RoomRecord } from '@/lib/room-types'

export default function RoomsPage() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  // Reads are filtered server-side by the `team` rule: only my rooms arrive.
  const rooms = useQuery<RoomRecord>('rooms', { orderBy: 'createdAt', orderDir: 'desc' })
  const members = useQuery<MemberRecord>('team_members', { where: { userId: userId ?? '' } })

  const roleOf = (roomId: string) => members.records.find((m) => m.data.teamId === roomId)?.data.role

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Your rooms</h1>
        <Button onClick={() => navigate('/rooms/new')}>+ New room</Button>
      </div>

      {rooms.status === 'loading' && <p className="text-muted-foreground">Loading rooms...</p>}
      {rooms.status === 'error' && (
        <div role="alert" className="rounded-lg border border-destructive p-4 text-sm">
          Could not load your rooms. {rooms.error}
        </div>
      )}
      {rooms.status === 'ready' && rooms.records.length === 0 && (
        <EmptyState
          title="No rooms yet"
          description="Create a room for a research question, or open an invite link from a teammate."
          action={{ label: 'New room', onClick: () => navigate('/rooms/new') }}
        />
      )}
      {rooms.status === 'ready' && rooms.records.length > 0 && (
        <ul className="space-y-2" data-testid="rooms-list">
          {rooms.records.map((r) => (
            <li key={r.recordId}>
              <Link
                to={`/rooms/${r.recordId}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:bg-secondary"
              >
                <span>
                  <span className="block font-medium">{r.data.title}</span>
                  <span className="block text-sm text-muted-foreground">{r.data.question}</span>
                </span>
                {roleOf(r.recordId) && <Badge variant="secondary">{roleOf(r.recordId)}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
