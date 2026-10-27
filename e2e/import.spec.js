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
