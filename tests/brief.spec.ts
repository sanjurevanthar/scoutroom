/**
 * Feature 4: cited brief from kept cards. The test server uses fake providers
 * (SCOUTROOM_FAKE_PROVIDERS, see tests/playwright.config.ts): no real API is called.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts (see collab.spec.ts).')
test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)

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

/** A creates a room and runs the scout to completion. B joins first unless `join` is false. */
async function roomWithCards(a: Page, b: Page, join = true) {
  await Promise.all([a.goto('/rooms'), b.goto('/rooms')])
  const created = await callAction(a, 'createRoom', { title: `Brief ${stamp} ${Math.random()}`, question: 'Which vector DB should we use?' })
  expect(created.success).toBe(true)
  const roomId: string = created.data.roomId
  if (join) {
    const invite = await callAction(a, 'createInviteLink', { roomId })
    expect((await callAction(b, 'joinByInvite', { token: invite.data.token })).success).toBe(true)
  }
  expect((await callAction(a, 'startRun', { roomId })).success).toBe(true)
  await a.goto(`/rooms/${roomId}`)
  await expect(a.getByTestId('run-done')).toBeVisible({ timeout: 40_000 })
  return roomId
}

const cardIds = (page: Page) => page.getByTestId('card').evaluateAll((els) => els.map((e) => e.getAttribute('data-card-id')!))

test('A keeps a card and writes a brief; B sees it live with citations; clicking [1] highlights the card', async ({ users }) => {
  const [a, b] = await users(2)
  const roomId = await roomWithCards(a.page, b.page)
  await b.page.goto(`/rooms/${roomId}`)
  await expect(b.page.getByTestId('card').first()).toBeVisible({ timeout: 20_000 })
  const [first, second] = await cardIds(a.page)

  // Empty state, usage counter, and the button is disabled with a hint while nothing is kept.
  for (const p of [a.page, b.page]) {
    await expect(p.getByTestId('brief-empty')).toBeVisible({ timeout: 20_000 })
    await expect(p.getByTestId('briefs-used')).toHaveText('0 / 5 briefs used')
  }
  await expect(a.page.getByTestId('write-brief')).toBeDisabled()
  await expect(a.page.getByTestId('brief-hint')).toHaveText('Keep at least one card first.')

  // A keeps one card: the button turns on. Then A writes the brief.
  await a.page.locator(`[data-card-id="${first}"]`).getByTestId('vote-keep').click()
  await expect(a.page.getByTestId('write-brief')).toBeEnabled({ timeout: 15_000 })
  await a.page.getByTestId('write-brief').click()
  await expect(a.page.getByTestId('brief-writing')).toBeVisible()

  // B (no refresh) sees the brief appear, with a [1] that points at the kept card.
  await expect(b.page.getByTestId('brief')).toBeVisible({ timeout: 30_000 })
  await expect(a.page.getByTestId('brief')).toBeVisible()
  for (const p of [a.page, b.page]) {
    await expect(p.getByTestId('briefs-used')).toHaveText('1 / 5 briefs used')
    await expect(p.getByTestId('brief-paragraph').first()).toContainText('Fake brief')
    await expect(p.getByTestId('brief-stale')).toHaveCount(0)
    await expect(p.getByTestId('brief-source')).toHaveCount(1)
  }
  const cite = b.page.getByTestId('brief-cite').first()
  await expect(cite).toHaveText('[1]')
  await expect(cite).toHaveAttribute('data-card-id', first)

  // Clicking [1] highlights that card, even if a filter was hiding it.
  await b.page.getByTestId('filter-rejected').click()
  await expect(b.page.getByTestId('card')).toHaveCount(0)
  await cite.click()
  await expect(b.page.locator(`[data-card-id="${first}"][data-testid="card"]`)).toHaveAttribute('data-highlighted', 'true')
  await expect(b.page.locator(`[data-card-id="${second}"][data-testid="card"]`)).toHaveAttribute('data-highlighted', 'false')

  // B keeps another card: both see "Stale" live.
  await b.page.locator(`[data-card-id="${second}"]`).getByTestId('vote-keep').click()
  for (const p of [a.page, b.page]) await expect(p.getByTestId('brief-stale')).toBeVisible({ timeout: 15_000 })

  // Regenerating uses both kept cards, shows brief 2, and clears the Stale note.
  await b.page.getByTestId('write-brief').click()
  for (const p of [a.page, b.page]) {
    await expect(p.getByTestId('briefs-used')).toHaveText('2 / 5 briefs used', { timeout: 30_000 })
    await expect(p.getByTestId('brief')).toHaveAttribute('data-brief-seq', '2')
    await expect(p.getByTestId('brief-source')).toHaveCount(2)
    await expect(p.getByTestId('brief-stale')).toHaveCount(0)
  }
})

test('server refuses a non-member, a viewer and 0 kept cards; the 5-brief limit holds; a viewer reads but cannot write', async ({ users }) => {
  const [a, b] = await users(2)
  const roomId = await roomWithCards(a.page, b.page, false)
  const first = (await cardIds(a.page))[0]!

  // Non-member: refused.
  expect((await callAction(b.page, 'generateBrief', { roomId })).error).toBe('not a member of this room')

  const invite = await callAction(a.page, 'createInviteLink', { roomId })
  expect((await callAction(b.page, 'joinByInvite', { token: invite.data.token })).success).toBe(true)
  expect((await callAction(a.page, 'changeRole', { roomId, userId: await userIdOf(b.page), role: 'viewer' })).success).toBe(true)

  // Viewer: refused by the server. Owner with nothing kept: refused.
  expect((await callAction(b.page, 'generateBrief', { roomId })).error).toBe('forbidden: role=viewer')
  expect((await callAction(a.page, 'generateBrief', { roomId })).error).toBe('Keep at least one card first')

  // The limit: 5 succeed, the 6th is refused.
  expect((await callAction(a.page, 'castVote', { cardId: first, value: 'keep' })).success).toBe(true)
  for (let i = 1; i <= 5; i++) expect((await callAction(a.page, 'generateBrief', { roomId })).data?.seq).toBe(i)
  expect((await callAction(a.page, 'generateBrief', { roomId })).error).toBe('brief limit reached (5 of 5 used)')

  // UI: the viewer sees the latest brief and the limit, but no write button. The owner's button is off.
  await b.page.goto(`/rooms/${roomId}`)
  await expect(b.page.getByTestId('brief')).toHaveAttribute('data-brief-seq', '5', { timeout: 20_000 })
  await expect(b.page.getByTestId('briefs-used')).toHaveText('5 / 5 briefs used')
  await expect(b.page.getByTestId('brief-limit-reached')).toBeVisible()
  await expect(b.page.getByTestId('write-brief')).toHaveCount(0)
  await expect(b.page.getByTestId('brief-viewer-note')).toBeVisible()
  await a.page.goto(`/rooms/${roomId}`)
  await expect(a.page.getByTestId('brief-limit-reached')).toBeVisible({ timeout: 20_000 })
  await expect(a.page.getByTestId('write-brief')).toBeDisabled()
})
