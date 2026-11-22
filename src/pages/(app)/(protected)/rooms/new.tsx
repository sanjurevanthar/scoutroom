/** Create room: title + research question. The creator becomes the owner. */
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Label, Textarea } from '@/components/ui'
import { QUESTION_MAX, TITLE_MAX } from '@/lib/room-types'
import { roomsApi } from '@/lib/rooms-api'

export default function NewRoomPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await roomsApi.createRoom(title, question)
    if (!res.success) {
      setBusy(false)
      return setError(res.error)
    }
    navigate(`/rooms/${res.data.roomId}`)
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-5 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">New room</h1>
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} maxLength={TITLE_MAX} required onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="question">Research question</Label>
        <Textarea id="question" value={question} maxLength={QUESTION_MAX} rows={4} required onChange={(e) => setQuestion(e.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => navigate('/rooms')}>Cancel</Button>
        <Button type="submit" disabled={busy || !title.trim() || !question.trim()}>
          {busy ? 'Creating...' : 'Create'}
        </Button>
      </div>
    </form>
  )
}
