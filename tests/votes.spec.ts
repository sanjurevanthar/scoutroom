/**
 * Feature 3: team votes on cards. The test server uses fake providers
 * (SCOUTROOM_FAKE_PROVIDERS, see tests/playwright.config.ts): no real API is called.
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

/** A creates a room and runs the scout to completion. B joins first unless `join` is false. */
async function roomWithCards(a: Page, b: Page, join = true) {
  await Promise.all([a.goto('/rooms'), b.goto('/rooms')])
  const created = await callAction(a, 'createRoom', { title: `Votes ${stamp} ${Math.random()}`, question: 'Which vector DB should we use?' })
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

const firstCardId = (page: Page) => page.getByTestId('card').first().getAttribute('data-card-id').then((id) => id!)

test('A and B vote on one card; counts and status update live for both, and a changed vote shows', async ({ users }) => {
  const [a, b] = await users(2)
  const roomId = await roomWithCards(a.page, b.page)
  await b.page.goto(`/rooms/${roomId}`)
  const cardId = await firstCardId(a.page)
  const cardOn = (p: Page) => p.locator(`[data-card-id="${cardId}"]`)
  const expectCard = async (counts: string, status: string) => {
    for (const p of [a.page, b.page]) {
      await expect(cardOn(p).getByTestId('vote-counts')).toHaveText(counts, { timeout: 15_000 })
      await expect(cardOn(p).getByTestId('card-status')).toHaveText(status)
    }
  }

  // Nobody has voted: undecided, both can vote.
  await expect(cardOn(b.page).getByTestId('card-status')).toHaveText('Undecided', { timeout: 20_000 })
  await expectCard('👍 0 · 👎 0', 'Undecided')
  await expect(a.page.getByTestId('filter-all')).toContainText('All (')

  // A keeps: both see 1-0, Kept. A's button is highlighted, B's is not.
  await cardOn(a.page).getByTestId('vote-keep').click()
  await expectCard('👍 1 · 👎 0', 'Kept')
  await expect(cardOn(a.page).getByTestId('vote-keep')).toHaveAttribute('aria-pressed', 'true')
  await expect(cardOn(b.page).getByTestId('vote-keep')).toHaveAttribute('aria-pressed', 'false')

  // B rejects: a tie, so Undecided.
  await cardOn(b.page).getByTestId('vote-reject').click()
  await expectCard('👍 1 · 👎 1', 'Undecided')

  // B changes the vote to keep: A sees 2-0, Kept (the vote was replaced, not added).
  await cardOn(b.page).getByTestId('vote-keep').click()
  await expectCard('👍 2 · 👎 0', 'Kept')
  await expect(cardOn(b.page).getByTestId('vote-reject')).toHaveAttribute('aria-pressed', 'false')

  // Filter tabs count live: this card is the only Kept one.
  await expect(a.page.getByTestId('filter-kept')).toContainText('Kept (1)')
  await a.page.getByTestId('filter-kept').click()
  await expect(a.page.getByTestId('card')).toHaveCount(1)
  await a.page.getByTestId('filter-rejected').click()
  await expect(a.page.getByTestId('card')).toHaveCount(0)
  await expect(a.page.getByTestId('filter-empty')).toBeVisible()
  await a.page.getByTestId('filter-all').click()

  // Clicking your own vote again undoes it; both back to 1-0 after B undoes.
  await cardOn(b.page).getByTestId('vote-keep').click()
  await expectCard('👍 1 · 👎 0', 'Kept')
  // A undoes too: nobody's vote is left.
  await cardOn(a.page).getByTestId('vote-keep').click()
  await expectCard('👍 0 · 👎 0', 'Undecided')

  // Only rejects: Rejected.
  await cardOn(a.page).getByTestId('vote-reject').click()
  await expectCard('👍 0 · 👎 1', 'Rejected')
  await expect(a.page.getByTestId('filter-rejected')).toContainText('Rejected (1)')
})

test('server refuses a viewer and a non-member; a person cannot vote twice', async ({ users }) => {
  const [a, b] = await users(2)
  // B is NOT a member yet.
  const roomId = await roomWithCards(a.page, b.page, false)
  const cardId = await firstCardId(a.page)

  // Non-member: refused, and nothing was written.
  expect((await callAction(b.page, 'castVote', { cardId, value: 'keep' })).error).toBe('not a member of this room')
  expect((await callAction(b.page, 'castVote', { cardId: 'no-such-card', value: 'keep' })).error).toBe('card not found')

  const invite = await callAction(a.page, 'createInviteLink', { roomId })
  expect((await callAction(b.page, 'joinByInvite', { token: invite.data.token })).success).toBe(true)

  // Bad input is refused.
  expect((await callAction(a.page, 'castVote', { cardId, value: 'maybe' })).success).toBe(false)

  // Viewer: refused by the server, and the UI shows counts but no buttons.
  expect((await callAction(a.page, 'changeRole', { roomId, userId: await userIdOf(b.page), role: 'viewer' })).success).toBe(true)
  expect((await callAction(b.page, 'castVote', { cardId, value: 'keep' })).error).toBe('forbidden: role=viewer')
  await b.page.goto(`/rooms/${roomId}`)
  await expect(b.page.getByTestId('card').first()).toBeVisible({ timeout: 20_000 })
  await expect(b.page.getByTestId('vote-counts').first()).toBeVisible()
  await expect(b.page.getByTestId('card-status').first()).toBeVisible()
  await expect(b.page.getByTestId('vote-keep')).toHaveCount(0)
  await expect(b.page.getByTestId('vote-reject')).toHaveCount(0)

  // Double voting: the same vote repeated, and two at the same instant, still count once.
  const card = a.page.locator(`[data-card-id="${cardId}"]`)
  expect((await callAction(a.page, 'castVote', { cardId, value: 'keep' })).success).toBe(true)
  expect((await callAction(a.page, 'castVote', { cardId, value: 'keep' })).success).toBe(true)
  await expect(card.getByTestId('vote-counts')).toHaveText('👍 1 · 👎 0', { timeout: 15_000 })
  await callAction(a.page, 'castVote', { cardId, value: null })
  const both = await Promise.all([
    callAction(a.page, 'castVote', { cardId, value: 'keep' }),
    callAction(a.page, 'castVote', { cardId, value: 'reject' }),
  ])
  expect(both.every((r) => r.success)).toBe(true)
  await a.page.waitForTimeout(1500)
  const text = (await card.getByTestId('vote-counts').textContent()) ?? ''
  expect(['👍 1 · 👎 0', '👍 0 · 👎 1']).toContain(text.trim())
})
