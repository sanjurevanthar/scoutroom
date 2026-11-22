/** Invite link target. The protected layout signs the visitor in first, then this joins them. */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { roomsApi } from '@/lib/rooms-api'

export default function JoinPage() {
  const { token: linkCode } = useParams()
  const code = linkCode ?? ''
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    roomsApi.joinByInvite(code).then((res) => {
      if (res.success) navigate(`/rooms/${res.data.roomId}`, { replace: true })
      else setError(res.error)
    })
  }, [code, navigate])

  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      {error ? (
        <>
          <p role="alert" className="text-destructive">{error}</p>
          <Link to="/rooms" className="mt-4 inline-block underline">Go to your rooms</Link>
        </>
      ) : (
        <p className="text-muted-foreground">Joining room...</p>
      )}
    </div>
  )
}
