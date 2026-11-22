/**
 * Feature 1: rooms, roles, invite links. Needs two test accounts (users(2)).
 * Server rules are tested by calling the actions directly, not through the UI.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts (see collab.spec.ts).')
test.describe.configure({ mode: 'serial' })

type ActionBody = { success: boolean; data?: any; error?: string }

/** POST /api/actions/:name as the signed-in user of this page. */
async function callAction(page: Page, name: string, params: Record<string, unknown>): Promise<ActionBody> {
  return page.evaluate(
    async ([n, p]) => {
      const t = await fetch('/api/auth/token', { method: 'POST', credentials: 'include' }).then((r) => r.json())
      const res = await fetch(`/api/actions/${n}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.token}` },
        body: JSON.stringify(p),
      })
      return res.json()
    },
    [name, params] as const,
  )
}

const stamp = Date.now()

test('A creates a room, B joins by link, both see each other live', async ({ users }) => {
  const [a, b] = await users(2)
  const title = `Vector DBs ${stamp}`

  // A creates the room through the UI.
  await a.page.goto('/rooms')
  await a.page.getByRole('button', { name: '+ New room' }).click()
  await a.page.getByLabel('Title').fill(title)
  await a.page.getByLabel('Research question').fill('Which vector DB should we use in 2026?')
  await a.page.getByRole('button', { name: 'Create' }).click()
  await expect(a.page.getByTestId('room-title')).toHaveText(title)
  await expect(a.page.getByTestId('member-row')).toHaveCount(1)
  await expect(a.page.getByTestId('member-role')).toHaveText('owner')

  // A copies the invite link.
  await a.page.getByTestId('copy-invite').click()
  const link = await a.page.getByTestId('invite-link').inputValue()
  expect(link).toMatch(/\/join\/[0-9a-f]{64}$/)

  // B opens the link, is joined as researcher, and lands in the room.
  await b.page.goto(new URL(link).pathname)
  await expect(b.page.getByTestId('room-title')).toHaveText(title, { timeout: 20_000 })

  // Both lists update live, no reload.
  for (const page of [a.page, b.page]) {
    await expect(page.getByTestId('member-row')).toHaveCount(2, { timeout: 15_000 })
  }
  await expect(b.page.getByTestId('member-row').filter({ hasText: '(you)' })).toBeVisible()

  // B shows up in A's list as online (presence).
  await expect(a.page.getByLabel('online')).toHaveCount(2, { timeout: 20_000 })

  // The rooms list shows the room to both.
  await b.page.goto('/rooms')
  await expect(b.page.getByTestId('rooms-list')).toContainText(title)
})

test('non-members cannot read a room or call its actions; roles gate owner actions', async ({ users }) => {
  const [a, b] = await users(2)
  await Promise.all([a.page.goto('/rooms'), b.page.goto('/rooms')]) // same-origin page for fetch
  const created = await callAction(a.page, 'createRoom', { title: `Private ${stamp}`, question: 'Secret?' })
  expect(created.success).toBe(true)
  const roomId: string = created.data.roomId

  // Non-member B: sees no data, and the server refuses its actions.
  await b.page.goto(`/rooms/${roomId}`)
  await expect(b.page.getByText('You are not a member of this room')).toBeVisible({ timeout: 20_000 })
  await b.page.goto('/rooms')
  await expect(b.page.getByTestId('rooms-list')).not.toContainText('Private')
  expect((await callAction(b.page, 'createInviteLink', { roomId })).error).toMatch(/not a member/)
  expect((await callAction(b.page, 'removeMember', { roomId, userId: 'x' })).success).toBe(false)

  // B joins as researcher via a real invite; owner-only actions are still refused.
  const invite = await callAction(a.page, 'createInviteLink', { roomId })
  expect(invite.success).toBe(true)
  const joined = await callAction(b.page, 'joinByInvite', { token: invite.data.token })
  expect(joined.success).toBe(true)
  expect(joined.data.role).toBe('researcher')
  // Joining again is harmless and keeps the role.
  expect((await callAction(b.page, 'joinByInvite', { token: invite.data.token })).data.role).toBe('researcher')
  // The link is stable until it expires.
  expect((await callAction(a.page, 'createInviteLink', { roomId })).data.token).toBe(invite.data.token)

  const me = await b.page.evaluate(async () => {
    const t = await fetch('/api/auth/token', { method: 'POST', credentials: 'include' }).then((r) => r.json())
    return JSON.parse(atob(t.token.split('.')[1])).sub as string
  })
  const aId = await a.page.evaluate(async () => {
    const t = await fetch('/api/auth/token', { method: 'POST', credentials: 'include' }).then((r) => r.json())
    return JSON.parse(atob(t.token.split('.')[1])).sub as string
  })

  // Owner moves B to viewer; viewer and researcher are both refused owner actions.
  for (const role of ['researcher', 'viewer'] as const) {
    expect((await callAction(a.page, 'changeRole', { roomId, userId: me, role })).success).toBe(true)
    expect((await callAction(b.page, 'createInviteLink', { roomId })).error).toBe(`forbidden: role=${role}`)
    expect((await callAction(b.page, 'changeRole', { roomId, userId: aId, role: 'viewer' })).error).toBe(`forbidden: role=${role}`)
    expect((await callAction(b.page, 'removeMember', { roomId, userId: aId })).error).toBe(`forbidden: role=${role}`)
  }

  // Owner rules: cannot remove self, cannot be demoted, bad roles rejected.
  expect((await callAction(a.page, 'removeMember', { roomId, userId: aId })).error).toMatch(/cannot remove themselves/)
  expect((await callAction(a.page, 'changeRole', { roomId, userId: aId, role: 'viewer' })).success).toBe(false)
  expect((await callAction(a.page, 'changeRole', { roomId, userId: me, role: 'owner' })).success).toBe(false)

  // Removed member loses access immediately.
  expect((await callAction(a.page, 'removeMember', { roomId, userId: me })).success).toBe(true)
  await b.page.goto(`/rooms/${roomId}`)
  await expect(b.page.getByText('You are not a member of this room')).toBeVisible({ timeout: 20_000 })
})

test('invalid and unknown invite links are refused', async ({ users }) => {
  const [a] = await users(1)
  await a.page.goto('/rooms')
  expect((await callAction(a.page, 'joinByInvite', { token: String('nope') })).error).toMatch(/not valid/)
  expect((await callAction(a.page, 'createRoom', { title: '', question: 'q' })).success).toBe(false)
  await a.page.goto('/join/doesnotexist')
  await expect(a.page.getByRole('alert')).toContainText('not valid')
})
