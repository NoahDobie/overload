import { test, expect } from '@playwright/test'
import { freshApp, buildFrom, state, mouseDrag, touchDrag } from './helpers.js'

const dayNames = page => page.getByLabel('Day name').evaluateAll(els => els.map(e => e.value))

test('build from a template, add exercises, rename with history', async ({ page }) => {
  page.on('dialog', d => d.accept())
  await freshApp(page)
  await page.getByRole('link', { name: 'Build a program' }).click()
  await page.getByRole('button', { name: /^Upper \/ Lower/ }).click()
  await expect(page.locator('.tabbar')).toHaveCount(0)
  expect(await dayNames(page)).toEqual(['Upper 1', 'Lower 1', 'Upper 2', 'Lower 2'])
  await expect(page.getByRole('radio', { name: 'Week B' })).toHaveCount(0)

  // from the library: muscles come with it, none shown in the sheet
  const upper1 = page.locator('.card.day').first()
  await upper1.getByRole('button', { name: 'Exercise' }).click()
  await page.getByPlaceholder(/Search/).fill('face pull')
  await page.locator('.pick:not(.custom)').first().click()
  const sheet = page.getByRole('dialog', { name: 'Exercise' })
  await expect(sheet.getByText('Muscles worked')).toHaveCount(0)
  await page.getByRole('button', { name: 'More sets' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(upper1.locator('.ed-ex').last()).toContainText('4 × 8–12')

  // your own exercise: muscles matched from the name
  await upper1.getByRole('button', { name: 'Exercise' }).click()
  await page.getByPlaceholder(/Search/).fill('Tib Raise')
  await page.getByRole('button', { name: /Add “Tib Raise”/ }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForURL('**/settings')
  let S = await state(page)
  const ex = S.program.days[0].exercises
  expect(ex.at(-2).muscles).toContain('deltoids')
  expect(ex.at(-1)).toMatchObject({ name: 'Tib Raise' })
  expect(ex.at(-1).muscles).toContain('tibialis')

  // log bench, then rename it: history follows
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.locator('.hero .eyebrow')).not.toContainText('Week A')
  await page.getByRole('button', { name: 'Start workout' }).click()
  await page.getByRole('button', { name: 'Done set 1' }).first().click()
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page.goto('/program')
  await page.locator('.ed-ex', { hasText: 'Barbell Bench Press' }).first().click()
  await page.getByRole('dialog', { name: 'Exercise' }).getByLabel('Name').fill('Comp Bench')
  await expect(page.getByText(/Renamed from “Barbell Bench Press”/)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForURL('**/settings')
  S = await state(page)
  expect(S.sessions[0].entries[0].name).toBe('Comp Bench')
  expect(S.program.days[0].exercises[0].muscles[0]).toBe('chest')
})

test('A/B weeks toggle and leaving with changes', async ({ page }) => {
  await buildFrom(page, 'Upper / Lower')
  const dialogs = []
  page.on('dialog', d => { dialogs.push(d.message()); d.accept() })
  await page.getByRole('link', { name: 'Edit program' }).click()
  await page.getByLabel(/Alternate A and B weeks/).check()
  await expect(page.getByRole('radio', { name: 'Week B' })).toHaveCount(4)
  expect(await page.locator('[role=radio][aria-checked=true]').allTextContents()).toEqual(['Week A', 'Week A', 'Week B', 'Week B'])
  await page.getByRole('button', { name: 'Cancel' }).click()
  expect(dialogs.join()).toContain('Discard your changes')
})

test('drag to reorder days, exercises and runs', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('link', { name: 'Build a program' }).click()
  await page.getByRole('button', { name: /^Upper \/ Lower/ }).click()
  await expect(page.getByRole('button', { name: /Move .* (up|down)/ })).toHaveCount(0)

  // a day, with the mouse (auto-scrolls up)
  const firstTop = (await page.locator('.card.day').first().boundingBox()).y
  await page.locator('.card.day', { has: page.locator('input[value="Lower 2"]') }).scrollIntoViewIfNeeded()
  await mouseDrag(page, page.getByRole('button', { name: /Reorder Lower 2/ }), firstTop - 200, 40)
  expect(await dayNames(page)).toEqual(['Lower 2', 'Upper 1', 'Lower 1', 'Upper 2'])
  await expect(page.locator('.ed-list')).toHaveCount(4)       // days expanded again

  // an exercise, with a finger
  const upper1 = page.locator('.card.day', { has: page.locator('input[value="Upper 1"]') })
  await upper1.scrollIntoViewIfNeeded()
  const before = await upper1.locator('.ed-name').allTextContents()
  const topY = (await upper1.locator('.ed-ex').first().boundingBox()).y
  const scrolled = await page.evaluate(() => scrollY)
  await touchDrag(page, upper1.getByRole('button', { name: new RegExp('Reorder ' + before.at(-1)) }), topY - 10)
  const after = await upper1.locator('.ed-name').allTextContents()
  expect(after[0]).toBe(before.at(-1))
  expect(Math.abs(await page.evaluate(() => scrollY) - scrolled)).toBeLessThan(30)

  // arrow keys
  await upper1.getByRole('button', { name: new RegExp('Reorder ' + after[0]) }).focus()
  await page.keyboard.press('ArrowDown')
  expect((await upper1.locator('.ed-name').allTextContents())[1]).toBe(after[0])

  // a tap changes nothing
  const snap = await dayNames(page)
  await page.getByRole('button', { name: /Reorder Upper 1/ }).tap()
  await page.waitForTimeout(150)
  expect(await dayNames(page)).toEqual(snap)
  await expect(page.locator('.dragging')).toHaveCount(0)

  // runs
  await page.getByLabel(/Weekly runs/).check()
  const runs = page.locator('.card', { hasText: 'Weekly runs' })
  await runs.scrollIntoViewIfNeeded()
  const top = (await runs.locator('.ed-ex').first().boundingBox()).y
  await mouseDrag(page, runs.getByRole('button', { name: /Reorder Long/ }), top - 10, 12)
  await expect(runs.locator('.ed-name')).toHaveText(['Long', 'Easy'])

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForURL('**/settings')
  const S = await state(page)
  expect(S.program.days.map(d => d.name)).toEqual(['Lower 2', 'Upper 1', 'Lower 1', 'Upper 2'])
  expect(S.program.days[1].exercises[1].name).toBe(after[0])
  expect(S.program.runs.plan.map(r => r.name)).toEqual(['Long', 'Easy'])
})
