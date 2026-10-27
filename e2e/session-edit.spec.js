import { test, expect } from '@playwright/test'
import { buildFrom, state } from './helpers.js'

test('fix a typo in a logged workout and the next target follows', async ({ page }) => {
  page.on('dialog', d => d.accept())
  await buildFrom(page, 'Full body')
  await page.getByRole('link', { name: 'Today' }).click()
  await page.getByRole('button', { name: 'Start workout' }).click()
  await page.waitForURL('**/workout')
  // squat: a typo, 2250 instead of 225
  const w = page.getByLabel('set 1 weight', { exact: true }).first()
  await w.fill('2250')
  await expect(w).toHaveValue('999')                       // capped while typing
  await w.fill('999')
  for (const n of [1, 2, 3]) await page.getByRole('button', { name: `Done set ${n}` }).first().click()
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page.waitForURL(/\/$/)

  await page.getByRole('link', { name: 'History' }).click()
  await page.locator('.lrow-h').first().click()
  await page.getByRole('link', { name: 'Edit' }).click()
  await page.waitForURL('**/session/**')
  await expect(page.locator('.tabbar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()

  for (const n of [1, 2, 3]) await page.getByLabel(`set ${n} weight`, { exact: true }).first().fill('225')
  await page.getByLabel('Date').fill('2026-10-20')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForURL('**/history')

  const S = await state(page)
  expect(S.sessions[0].date).toBe('2026-10-20')
  expect(S.sessions[0].entries[0].sets.map(s => s.w)).toEqual([225, 225, 225])
  await page.getByRole('link', { name: 'Today' }).click()
  await page.getByRole('button', { name: 'Full Body 1', exact: true }).click()
  await expect(page.locator('.preview li', { hasText: 'Barbell Squat' })).toContainText('225 lb')
})

test('cancel asks first; delete removes the workout', async ({ page }) => {
  const dialogs = []
  page.on('dialog', d => { dialogs.push(d.message()); d.accept() })
  await buildFrom(page, 'Full body')
  await page.getByRole('link', { name: 'Today' }).click()
  await page.getByRole('button', { name: 'Start workout' }).click()
  await page.getByRole('button', { name: 'Done set 1' }).first().click()
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page.getByRole('link', { name: 'History' }).click()
  await page.locator('.lrow-h').first().click()
  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Undo set 1' }).first().click()
  await page.getByRole('button', { name: 'Back' }).click()
  expect(dialogs.at(-1)).toContain('Discard your changes')
  expect((await state(page)).sessions[0].entries[0].sets[0].done).toBe(true)

  await page.locator('.lrow-h').first().click()
  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.waitForURL('**/history')
  expect((await state(page)).sessions.filter(s => !s.deleted)).toHaveLength(0)
})
