/**
 * Feature 2: live agent run. The test server uses FakeLLM/FakeSearch (tests/playwright.config.ts),
 * so nothing here calls Groq, OpenAlex or Wikipedia. Needs two test accounts.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts (see collab.spec.ts).')
test.describe.configure({ mode: 'serial' })
test.setTimeout(90_000)

type ActionBody = { success: boolean; data?: any; error?: string }

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

/** A creates a room on /rooms (so fetch has a same-origin page); B joins by invite. */
async function roomWithTwoMembers(a: Page, b: Page, question = 'Which vector DB should we use?') {
  await Promise.all([a.goto('/rooms'), b.goto('/rooms')])
  const created = await callAction(a, 'createRoom', { title: `Scout ${stamp} ${Math.random()}`, question })
  expect(created.success).toBe(true)
  const roomId: string = created.data.roomId
  const invite = await callAction(a, 'createInviteLink', { roomId })
  expect((await callAction(b, 'joinByInvite', { token: invite.data.token })).success).toBe(true)
  return roomId
}

test('A runs the scout; B sees the steps and the cards appear live', async ({ users }) => {
  const [a, b] = await users(2)
  const roomId = await roomWithTwoMembers(a.page, b.page)
  await Promise.all([a.page.goto(`/rooms/${roomId}`), b.page.goto(`/rooms/${roomId}`)])

  // Empty state, usage counter, button available for the researcher/owner.
  for (const page of [a.page, b.page]) {
    await expect(page.getByTestId('cards-empty')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('runs-used')).toHaveText('0 / 5 runs used')
  }

  await a.page.getByTestId('run-scout').click()

  // The button is disabled for everyone while the run is active.
  await expect(a.page.getByTestId('run-scout')).toBeDisabled()
  await expect(b.page.getByTestId('run-scout')).toBeDisabled({ timeout: 15_000 })

  // B sees steps arrive one by one without reloading.
  const bSteps = b.page.getByTestId('run-step')
  await expect(bSteps.first()).toBeVisible({ timeout: 20_000 })
  await expect(b.page.getByTestId('run-timeline')).toHaveAttribute('data-run-status', 'running')
  await expect(b.page.getByTestId('run-timeline')).toContainText('Searching papers')

  // Run finishes: all four steps done, "Done", cards on both screens.
  for (const page of [a.page, b.page]) {
    await expect(page.getByTestId('run-done')).toBeVisible({ timeout: 40_000 })
    await expect(page.getByTestId('run-step')).toHaveCount(4)
    await expect(page.getByTestId('run-step').locator('xpath=self::*[@data-status="done"]')).toHaveCount(4)
    await expect(page.getByTestId('card').first()).toBeVisible()
    await expect(page.getByTestId('card-source').first()).toHaveAttribute('href', /^https:\/\/example\.org\//)
    await expect(page.getByTestId('card-type').first()).toHaveText(/paper|background/)
    await expect(page.getByTestId('card-confidence').first()).toContainText('%')
    await expect(page.getByTestId('runs-used')).toHaveText('1 / 5 runs used')
  }
  // Lock released: the button is usable again.
  await expect(a.page.getByTestId('run-scout')).toBeEnabled()
})

test('stop ends the run between steps, saves no cards, and frees the room', async ({ users }) => {
  const [a, b] = await users(2)
  const roomId = await roomWithTwoMembers(a.page, b.page)
  await a.page.goto(`/rooms/${roomId}`)
  await a.page.getByTestId('run-scout').click()
  await expect(a.page.getByTestId('stop-run')).toBeVisible({ timeout: 15_000 })
  await a.page.getByTestId('stop-run').click()
  await expect(a.page.getByTestId('run-stopped')).toBeVisible({ timeout: 15_000 })
  await expect(a.page.getByTestId('card')).toHaveCount(0)
  // The job notices "stopped" on its next tick and releases the lock.
  await expect(a.page.getByTestId('run-scout')).toBeEnabled({ timeout: 15_000 })
})

test('a failed run shows the message and releases the lock', async ({ users }) => {
  const [a, b] = await users(2)
  const roomId = await roomWithTwoMembers(a.page, b.page, 'Anything [fake:429]')
  await a.page.goto(`/rooms/${roomId}`)
  await a.page.getByTestId('run-scout').click()
  await expect(a.page.getByTestId('run-error')).toHaveText('Rate limited, try again.', { timeout: 30_000 })
  await expect(a.page.getByTestId('run-status')).toHaveText('failed')
  await expect(a.page.getByTestId('card')).toHaveCount(0)
  await expect(a.page.getByTestId('run-scout')).toBeEnabled()
  await expect(a.page.getByTestId('runs-used')).toHaveText('1 / 5 runs used')
})

test('server refuses: viewer, second active run, client enqueue; the run limit holds', async ({ users }) => {
  const [a, b] = await users(2)
  const roomId = await roomWithTwoMembers(a.page, b.page)
  const bId = await userIdOf(b.page)

  // Viewer: refused by the server, and the UI hides the button.
  expect((await callAction(a.page, 'changeRole', { roomId, userId: bId, role: 'viewer' })).success).toBe(true)
  expect((await callAction(b.page, 'startRun', { roomId })).error).toBe('forbidden: role=viewer')
  await b.page.goto(`/rooms/${roomId}`)
  await expect(b.page.getByTestId('viewer-note')).toBeVisible({ timeout: 20_000 })
  await expect(b.page.getByTestId('run-scout')).toHaveCount(0)
  // A viewer cannot stop runs either, and a non-member cannot start one.
  expect((await callAction(b.page, 'startRun', { roomId: 'not-a-room' })).error).toMatch(/not a member/)

  // Client enqueue is refused: the job room denies every browser write.
  const enqueue = await b.page.evaluate(async (scope) => {
    const t = await fetch('/api/auth/token', { method: 'POST', credentials: 'include' }).then((r) => r.json())
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/jobs/${encodeURIComponent(scope)}?token=${t.token}`)
    const seen: string[] = []
    ws.onmessage = (e) => seen.push(String(e.data))
    await new Promise<void>((ok, bad) => { ws.onopen = () => ok(); ws.onerror = () => bad(new Error('ws failed')) })
    ws.send(JSON.stringify({ type: 'job.enqueue', payload: { requestId: 'r1', type: 'scout-run', payload: { runId: 'x', teamId: scope, question: 'q' } } }))
    await new Promise((r) => setTimeout(r, 2000))
    ws.close()
    return seen
  }, `app:test:room:${roomId}`)
  expect(enqueue.some((m) => m.includes('Write access denied'))).toBe(true)
  expect(enqueue.some((m) => m.includes('job.enqueued'))).toBe(false)

  // Owner starts a run; a second start while it is active is refused (lock).
  const first = await callAction(a.page, 'startRun', { roomId })
  expect(first.success).toBe(true)
  const second = await callAction(a.page, 'startRun', { roomId })
  expect(second.success).toBe(false)
  expect(second.error).toMatch(/already active/)
  // Two clicks at the same instant: still only one wins.
  const [x, y] = await Promise.all([callAction(a.page, 'startRun', { roomId }), callAction(a.page, 'startRun', { roomId })])
  expect([x.success, y.success]).toEqual([false, false])

  // Stop it, then use up the limit (5 runs per room by default).
  expect((await callAction(a.page, 'stopRun', { runId: first.data.runId })).success).toBe(true)
  expect((await callAction(b.page, 'stopRun', { runId: first.data.runId })).error).toMatch(/not active|forbidden/)
  let used = 1
  while (used < 5) {
    const r = await callAction(a.page, 'startRun', { roomId })
    if (!r.success) {
      expect(r.error).toMatch(/already active/) // previous job has not released the lock yet
      await a.page.waitForTimeout(400)
      continue
    }
    used++
    await callAction(a.page, 'stopRun', { runId: r.data.runId })
  }
  let limited: ActionBody = { success: true }
  for (let i = 0; i < 40 && (limited.success || /already active/.test(limited.error ?? '')); i++) {
    limited = await callAction(a.page, 'startRun', { roomId })
    if (limited.success) await callAction(a.page, 'stopRun', { runId: limited.data.runId })
    else if (/already active/.test(limited.error ?? '')) await a.page.waitForTimeout(400)
  }
  expect(limited.error).toBe('run limit reached (5 of 5 used)')
  await a.page.goto(`/rooms/${roomId}`)
  await expect(a.page.getByTestId('limit-reached')).toBeVisible({ timeout: 20_000 })
  await expect(a.page.getByTestId('runs-used')).toHaveText('5 / 5 runs used')
  await expect(a.page.getByTestId('run-scout')).toBeDisabled()
})
