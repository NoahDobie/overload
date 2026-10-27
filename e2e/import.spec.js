import { test, expect } from '@playwright/test'
import { freshApp, state, setState } from './helpers.js'

const upload = (page, name, body, mimeType = 'text/csv') =>
  page.locator('input[type=file]').first().setInputFiles({ name, mimeType, buffer: Buffer.from(body) })

test('CSV without muscles: filled in from the library; Excel-dated reps read back', async ({ page }) => {
  await freshApp(page, '/settings')
  const csv = 'Week,Day,DayName,Exercise,Sets,Reps\nA,1,Push,Flat Bench,3,5-Mar\nA,1,Push,DB Lat Raise,3,12-Aug\nA,1,Push,Z Twists,2,12-15\n'
  await upload(page, 'plan.csv', csv)
  await expect(page.getByText(/Muscles filled in from the exercise library for 3 exercises/)).toBeVisible()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const ex = (await state(page)).program.days[0].exercises
  expect(ex.map(e => [e.repMin, e.repMax])).toEqual([[3, 5], [8, 12], [12, 15]])
  expect(ex.map(e => e.muscles[0])).toEqual(['chest', 'deltoids', 'obliques'])
})

test('renamedFrom moves logged history to the new names', async ({ page }) => {
  await freshApp(page, '/settings')
  await setState(page, `s => Object.assign(s, {
    program: null, active: null, runs: [], bodyweight: [], settings: { unit: 'lb', blockStart: null, updatedAt: 1 },
    sessions: [{ id: 's1', dayId: 'A1', date: '2026-10-25', updatedAt: 1, entries: [{ exId: 'b', name: 'Bench Press', sets: [{ w: 250, r: 5, done: true }, { w: 250, r: 4, done: true }, { w: 250, r: 3, done: true }] }] }]
  })`)
  const file = JSON.stringify({ name: 'P', days: [{ id: 'A1', week: 'A', name: 'Push 1', exercises: [
    { name: 'Barbell Bench Press', renamedFrom: 'Bench Press', sets: 3, reps: '3-5', rir: 1, increment: 5 }
  ] }] })
  await upload(page, 'p.json', file, 'application/json')
  await expect(page.getByLabel(/Move logged history to the new names/)).toBeChecked()
  await expect(page.locator('.renames')).toContainText('Bench Press → Barbell Bench Press')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const S = await state(page)
  expect(S.sessions[0].entries[0].name).toBe('Barbell Bench Press')
  expect(JSON.stringify(S.program)).not.toContain('renamedFrom')
  await page.getByRole('link', { name: 'Today' }).click()
  await page.getByRole('button', { name: 'Push 1', exact: true }).click()
  await expect(page.locator('.preview li', { hasText: 'Barbell Bench Press' })).toContainText('250 lb · 5/5/4')
})

test('copy the AI prompt, paste a reply back, import it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await freshApp(page, '/settings')
  await page.getByText('Build with AI').click()
  await page.getByRole('button', { name: 'Copy AI prompt' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/single ```json code block/)
  await page.getByRole('button', { name: 'Paste program' }).click()
  await page.getByLabel('Program JSON').fill('Here is your plan:\n```json\n{ "name": "AI Upper Lower", "unit": "lb", "block": { "build": 4, "deload": 1 }, "days": [{ "id": "A1", "name": "Upper", "exercises": [{ "name": "Barbell Bench Press", "sets": 3, "reps": "6-8" }] }] }\n```')
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByRole('dialog', { name: 'Import "AI Upper Lower"?' })).toBeVisible()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const S = await state(page)
  expect(S.program).toMatchObject({ name: 'AI Upper Lower', block: { build: 4 } })
  expect(S.program.days[0].exercises[0].muscles[0]).toBe('chest')
})

test('training settings: runs toggle and deload knobs', async ({ page }) => {
  await freshApp(page, '/settings')
  await upload(page, 'p.json', JSON.stringify({ name: 'P', runs: { enabled: false, plan: [] }, days: [{ id: 'A1', name: 'Push', exercises: [{ name: 'Bench', sets: 4, reps: '5-8', increment: 5, startWeight: 200 }] }] }), 'application/json')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByLabel(/Weekly runs/).check()
  expect((await state(page)).program.runs).toMatchObject({ enabled: true, plan: [{ name: 'Easy' }] })
  await page.getByRole('button', { name: 'Customize deload' }).click()
  await page.getByRole('button', { name: 'Less Weight %' }).click()
  await page.getByRole('button', { name: 'Less Weight %' }).click()
  await page.getByLabel('Extra RIR', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/at 90% weight, RIR \+3/)).toBeVisible()
  await page.getByRole('button', { name: 'Start deload this week' }).click()
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.locator('.preview li', { hasText: 'Bench' })).toContainText('180 lb')
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Customize deload' }).click()
  await page.getByRole('button', { name: 'Defaults' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  expect((await state(page)).program.block.liftDeload).toEqual({ setsFactor: 0.5, rirAdd: 2, weightFactor: 1 })
})
