/**
 * MANUAL, spends DeepSpace credits. Skipped unless SCOUTROOM_REAL=1. One scout run + one brief through the
 * real DeepSpace integrations (~3 credits). Prints the cards and the brief.
 *   SCOUTROOM_REAL=1 npx deepspace test run e2e --grep "real integrations"
 */
import { test, expect } from 'deepspace/testing'
import type { Page } from '@playwright/test'

test.skip(process.env.SCOUTROOM_REAL !== '1', 'Manual: spends real DeepSpace credits (set SCOUTROOM_REAL=1).')
test.setTimeout(240_000)

async function callAction(page: Page, name: string, params: Record<string, unknown>) {
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

test('real integrations: one run and one brief', async ({ users }) => {
  const [a] = await users(1)
  const page = a.page
  await page.goto('/rooms')
  const created = await callAction(page, 'createRoom', { title: `Real ${Date.now()}`, question: 'How are retrieval-augmented generation systems evaluated?' })
  expect(created.success).toBe(true)
  const roomId: string = created.data.roomId
  const started = await callAction(page, 'startRun', { roomId })
  console.log('startRun', JSON.stringify(started))
  expect(started.success).toBe(true)
  await page.goto(`/rooms/${roomId}`)
  await expect(page.getByTestId('run-timeline')).toHaveAttribute('data-run-status', /done|failed/, { timeout: 150_000 })
  console.log('STEPS', await page.getByTestId('run-step').allInnerTexts())
  console.log('RUN STATUS', await page.getByTestId('run-timeline').getAttribute('data-run-status'))
  await expect(page.getByTestId('run-done')).toBeVisible()
  const cards = await page.getByTestId('card').allInnerTexts()
  console.log('CARDS', JSON.stringify(cards, null, 1))

  const keeps = page.getByTestId('vote-keep')
  await keeps.nth(0).click()
  await keeps.nth(1).click()
  await expect(page.getByTestId('write-brief')).toBeEnabled({ timeout: 15_000 })
  await page.getByTestId('write-brief').click()
  await expect(page.getByTestId('brief')).toBeVisible({ timeout: 90_000 })
  console.log('BRIEF', await page.getByTestId('brief').innerText())
})
