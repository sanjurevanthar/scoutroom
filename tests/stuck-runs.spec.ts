/**
 * Reliability issue 1 (docs/design/13): a crashed/hung run must not block the room.
 * The test server uses fake providers and STALE_RUN_MS=3000 (vite.config.ts). A question containing
 * [fake:hang] makes every model call stall for 12 s, like a stuck provider. Run: npm run check:reliability
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts (see collab.spec.ts).')
test.describe.configure({ mode: 'serial' })
test.setTimeout(90_000)

type ActionBody = { success: boolean; data?: any; error?: string }
const STALE_WAIT_MS = 3_600 // a little over STALE_RUN_MS (3000)

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

const userIdOf = (page: Page) =>
  page.evaluate(async () => {
    const t = await fetch('/api/auth/token', { method: 'POST', credentials: 'include' }).then((r) => r.json())
    return JSON.parse(atob(t.token.split('.')[1])).sub as string
  })

const stamp = Date.now()

async function roomWithTwoMembers(a: Page, b: Page, question: string) {
  await Promise.all([a.goto('/rooms'), b.goto('/rooms')])
  const created = await callAction(a, 'createRoom', { title: `Stuck ${stamp} ${Math.random()}`, question })
  expect(created.success).toBe(true)
  const roomId: string = created.data.roomId
  const invite = await callAction(a, 'createInviteLink', { roomId })
  expect((await callAction(b, 'joinByInvite', { token: invite.data.token })).success).toBe(true)
  return roomId
}

test('stuck runs a) a hung run is reaped after STALE_RUN_MS: a new run starts and the old one is failed', async ({ users }) => {
  const [a, b] = await users(2)
  const roomId = await roomWithTwoMembers(a.page, b.page, 'Hangs forever [fake:hang]')

  const first = await callAction(a.page, 'startRun', { roomId })
  expect(first.success).toBe(true)

  // Right away the run is alive (fresh heartbeat): a second start is refused.
  expect((await callAction(a.page, 'startRun', { roomId })).error).toMatch(/already active/)

  // The call hangs, so no progress is written. After STALE_RUN_MS the room is free again.
  await a.page.waitForTimeout(STALE_WAIT_MS)
  const second = await callAction(a.page, 'startRun', { roomId })
  expect(second.success).toBe(true)
  expect(second.data.runId).not.toBe(first.data.runId)

  // The old run is no longer active (it was marked failed: "Run stopped responding: marked as failed").
  expect((await callAction(a.page, 'stopRun', { runId: first.data.runId })).error).toBe('this run is not active')
  await callAction(a.page, 'stopRun', { runId: second.data.runId })
})

test('stuck runs b) a slow but progressing run is NOT reaped', async ({ users }) => {
  const [a, b] = await users(2)
  const roomId = await roomWithTwoMembers(a.page, b.page, 'Slow but fine question')
  await a.page.goto(`/rooms/${roomId}`)
  await a.page.getByTestId('run-scout').click()
  await expect(a.page.getByTestId('run-step').first()).toBeVisible({ timeout: 20_000 })

  // Past the stale threshold, but every step reports progress: the room stays locked.
  await a.page.waitForTimeout(STALE_WAIT_MS)
  expect((await callAction(a.page, 'startRun', { roomId })).error).toMatch(/already active/)
  await expect(a.page.getByTestId('run-timeline')).toHaveAttribute('data-run-status', 'running')

  // The run was never touched and finishes normally.
  await expect(a.page.getByTestId('run-done')).toBeVisible({ timeout: 40_000 })
  await expect(a.page.getByTestId('card').first()).toBeVisible()
  await expect(a.page.getByTestId('run-status')).toHaveText('done')
})

test('stuck runs c) two startRuns at once on a stale room: only one new run wins', async ({ users }) => {
  const [a, b] = await users(2)
  const roomId = await roomWithTwoMembers(a.page, b.page, 'Hangs forever [fake:hang]')
  expect((await callAction(a.page, 'startRun', { roomId })).success).toBe(true)
  await a.page.waitForTimeout(STALE_WAIT_MS)

  const [x, y] = await Promise.all([callAction(a.page, 'startRun', { roomId }), callAction(b.page, 'startRun', { roomId })])
  expect([x.success, y.success].filter(Boolean)).toHaveLength(1)
  const loser = x.success ? y : x
  expect(loser.error).toMatch(/already active/)
  const winner = x.success ? x : y
  await callAction(a.page, 'stopRun', { runId: winner.data.runId })
})

test('stuck runs d) a viewer still cannot start a run, even on a stale room', async ({ users }) => {
  const [a, b] = await users(2)
  const roomId = await roomWithTwoMembers(a.page, b.page, 'Hangs forever [fake:hang]')
  const bId = await userIdOf(b.page)
  expect((await callAction(a.page, 'changeRole', { roomId, userId: bId, role: 'viewer' })).success).toBe(true)

  const first = await callAction(a.page, 'startRun', { roomId })
  expect(first.success).toBe(true)
  await a.page.waitForTimeout(STALE_WAIT_MS)

  expect((await callAction(b.page, 'startRun', { roomId })).error).toBe('forbidden: role=viewer')
  // The viewer's refused attempt reaped nothing: the stuck run is still the active one.
  const stop = await callAction(a.page, 'stopRun', { runId: first.data.runId })
  expect(stop.success).toBe(true)
})
