import { test, expect } from '@playwright/test'
import { freshApp, buildFrom, state, setState } from './helpers.js'

test('switching to kg converts logged and planned weights', async ({ page }) => {
  const dialogs = []
  page.on('dialog', d => { dialogs.push(d.message()); d.accept() })
  await buildFrom(page, 'Full body')
  await setState(page, `s => {
    s.sessions = [{ id: 's1', dayId: 'A1', date: '2026-10-25', updatedAt: 1, entries: [{ exId: 'barbell-squat', name: 'Barbell Squat', sets: [{ w: 225, r: 8, done: true }, { w: 225, r: 8, done: true }, { w: 225, r: 8, done: true }] }] }]
    s.bodyweight = [{ id: 'w', date: '2026-10-25', weight: 180, updatedAt: 1 }]
  }`)
  await page.goto('/settings')
  await page.getByRole('radio', { name: 'kg' }).click()
  expect(dialogs.at(-1)).toContain('225 lb becomes 102.1 kg')
  const S = await state(page)
  expect(S.settings.unit).toBe('kg')
  expect(S.sessions[0].entries[0].sets[0].w).toBe(102.1)
  expect(S.bodyweight[0].weight).toBe(81.6)
  expect(S.program.days[0].exercises[0].increment).toBe(5)     // 10 lb step → 5 kg

  await page.getByRole('link', { name: 'Today' }).click()
  await page.getByRole('button', { name: 'Full Body 1', exact: true }).click()
  // 102.1 kg × 8 hit the top of 5-8, so +5 kg (the converted 10 lb step)
  await expect(page.locator('.preview li', { hasText: 'Barbell Squat' })).toContainText('105 kg')
})

test('with nothing logged, the switch just changes the label', async ({ page }) => {
  let asked = false
  page.on('dialog', d => { asked = true; d.accept() })
  await freshApp(page, '/settings')
  await page.getByRole('radio', { name: 'kg' }).click()
  expect(asked).toBe(false)
  expect((await state(page)).settings.unit).toBe('kg')
})
