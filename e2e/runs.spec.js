import { test, expect } from '@playwright/test'
import { freshApp, buildFrom, state, setState, todayISO } from './helpers.js'

const runCard = page => page.locator('.card', { hasText: 'Runs this week' })

test('marking a run done asks for what you actually ran', async ({ page }) => {
  await buildFrom(page, 'Push / Pull')
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(runCard(page).locator('.run-pill')).toHaveText(['Easy6k', 'Quality8k', 'Long13k'])
  await expect(runCard(page).locator('.count')).toHaveText('0/3')

  await runCard(page).getByRole('button', { name: /^Easy/ }).click()
  await expect(page.getByRole('button', { name: 'Mark done' })).toBeDisabled()
  await expect(page.getByText('Plan: 6 km · Zone 2, conversational')).toBeVisible()
  await expect(page.getByLabel('Distance (km)')).toHaveAttribute('placeholder', 'plan 6')
  await page.getByLabel('Distance (km)').fill('6,4')
  await page.getByLabel('Minutes').fill('35')
  await page.getByLabel('Notes').fill('felt easy')
  await page.getByRole('button', { name: 'Mark done' }).click()

  await expect(runCard(page).locator('.run-pill').first()).toHaveText('Easy6.4k · 35m')
  // every card stays the same size, whether or not it shows a time
  const sizes = await runCard(page).locator('.run-pill').evaluateAll(els => els.map(e => `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`))
  expect(new Set(sizes).size).toBe(1)
  await expect(runCard(page).locator('.count')).toHaveText('1/3 · 6.4 km')
  const S = await state(page)
  expect(S.runs[0]).toMatchObject({ km: 6.4, planId: 'easy', notes: 'felt easy' })
})

test('run plan editing: rows, sheet, cap of 7, turning runs off', async ({ page }) => {
  await buildFrom(page, 'Push / Pull')
  await page.getByRole('link', { name: 'Edit program' }).click()
  const card = page.locator('.card', { has: page.getByRole('heading', { name: 'Weekly runs' }) })
  await card.scrollIntoViewIfNeeded()
  await expect(card.locator('.ed-sum').first()).toHaveText('6 km planned · Zone 2, conversational')

  // edit one: clear its distance
  await card.locator('.ed-ex', { hasText: 'Quality' }).click()
  const sheet = page.getByRole('dialog', { name: 'Run' })
  await sheet.getByLabel('Name', { exact: true }).fill('Tempo')
  await sheet.getByLabel(/Planned distance/).fill('')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(card.locator('.ed-ex', { hasText: 'Tempo' }).locator('.ed-sum')).toHaveText(/^No planned distance/)

  // add up to the cap
  for (let i = 0; i < 4; i++) {
    await card.getByRole('button', { name: 'Run', exact: true }).click()
    await page.getByRole('button', { name: 'Done' }).click()
  }
  await expect(card.getByRole('button', { name: '7 runs max' })).toBeDisabled()

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForURL('**/settings')
  const S = await state(page)
  expect(S.program.runs.plan).toHaveLength(7)
  expect(S.program.runs.plan[1]).toMatchObject({ name: 'Tempo', km: null })

  await page.getByRole('link', { name: 'Edit program' }).click()
  await page.getByLabel(/Weekly runs/).uncheck()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForURL('**/settings')
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.getByRole('link', { name: 'Build a program' })).toHaveCount(0)
  await expect(runCard(page)).toHaveCount(0)
})

test('importing a lifting-only file keeps the run plan', async ({ page }) => {
  await buildFrom(page, 'Push / Pull')
  const csv = 'Week,Day,DayName,Exercise,Sets,Reps\nA,1,Push,Flat Bench,3,5-8\n'
  await page.locator('input[type=file]').first().setInputFiles({ name: 'plan.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.getByText('No runs in this file: your current run plan is kept.')).toBeVisible()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  expect((await state(page)).program.runs.plan.map(p => p.name)).toEqual(['Easy', 'Quality', 'Long'])
})

test('older data: no run plan and runs logged in miles', async ({ page }) => {
  await buildFrom(page, 'Push / Pull')
  const today = todayISO()
  await setState(page, `s => { delete s.program.runs; s.program.runTargets = {}; s.runs = [{ id: 'old', date: '${today}', type: 'long', miles: 8, minutes: 70, notes: '', updatedAt: 1 }] }`)
  await page.goto('/')
  await expect(runCard(page).locator('.run-pill')).toHaveText(['Easy', 'Quality', 'Long12.9k · 1.2h'])
  await page.getByRole('link', { name: 'History' }).click()
  await page.getByRole('radio', { name: 'Runs' }).click()
  await expect(page.getByText(/12\.9 km · 70 min/)).toBeVisible()
})

test('run units: miles shown and typed, km stored', async ({ page }) => {
  await buildFrom(page, 'Push / Pull')
  await page.getByRole('radio', { name: 'miles' }).click()
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(runCard(page).locator('.run-pill')).toHaveText(['Easy3.7mi', 'Quality5mi', 'Long8.1mi'])
  await runCard(page).getByRole('button', { name: /^Easy/ }).click()
  await expect(page.getByText('Plan: 3.7 mi · Zone 2, conversational')).toBeVisible()
  await page.getByLabel('Distance (mi)').fill('4')
  await page.getByLabel('Hours').fill('1')
  await page.getByLabel('Minutes').fill('35')
  await page.getByRole('button', { name: 'Mark done' }).click()
  await expect(runCard(page).locator('.run-pill').first()).toHaveText('Easy4mi · 1.6h')
  await expect(runCard(page).locator('.count')).toHaveText('1/3 · 4 mi')
  await runCard(page).getByRole('button', { name: /^Easy/ }).click()
  await expect(page.getByLabel('Hours')).toHaveValue('1')
  await expect(page.getByLabel('Minutes')).toHaveValue('35')
  await page.keyboard.press('Escape')
  expect((await state(page)).runs[0]).toMatchObject({ km: 6.437, minutes: 95 })
  await page.getByRole('link', { name: 'History' }).click()
  await page.getByRole('radio', { name: 'Runs' }).click()
  await expect(page.getByText(/4 mi · 95 min/)).toBeVisible()
})
