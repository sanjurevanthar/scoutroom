import { useState } from 'react'
import { Button, useToast } from '@/components/ui'
import { inviteUrl, roomsApi } from '@/lib/rooms-api'

/** Owner only. Gets (or makes) the invite link and copies it. */
export function InviteButton({ roomId }: { roomId: string }) {
  const { success, error } = useToast()
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)

  async function copy() {
    setBusy(true)
    const res = await roomsApi.createInviteLink(roomId)
    setBusy(false)
    if (!res.success) return error('Could not create invite link', res.error)
    const url = inviteUrl(res.data.token)
    setLink(url)
    try {
      await navigator.clipboard.writeText(url)
      success('Invite link copied', 'Anyone with the link joins as a researcher.')
    } catch {
      success('Invite link ready', 'Copy it from the box below.')
    }
  }

  return (
    <div className="space-y-2">
      <Button size="sm" onClick={copy} disabled={busy} data-testid="copy-invite">
        {busy ? 'Creating link...' : 'Copy invite link'}
      </Button>
      {link && (
        <input
          readOnly
          value={link}
          aria-label="Invite link"
          data-testid="invite-link"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
        />
      )}
    </div>
  )
}
