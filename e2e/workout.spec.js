import { test, expect } from '@playwright/test'
import { buildFrom, state } from './helpers.js'

async function startWorkout(page, template = 'Push / Pull') {
  await buildFrom(page, template)
  await page.getByRole('link', { name: 'Today' }).click()
  await page.getByRole('button', { name: 'Start workout' }).click()
  await page.waitForURL('**/workout')
}

/** Move the app's clock: shift the saved workout's times back by `hours`. */
async function age(page, hours) {
  await page.evaluate(h => {
    const s = JSON.parse(localStorage.getItem('overload_v1')), a = s.state.active
    for (const k of ['startedAt', 'touchedAt', 'lastSetAt']) if (a[k]) a[k] -= h * 3600e3
    localStorage.setItem('overload_v1', JSON.stringify(s))
  }, hours)
}

test.describe('narrow phone', () => {
  test.use({ viewport: { width: 360, height: 800 } })
  test('weight up to 999, reps up to 99, everything fits', async ({ page }) => {
    await startWorkout(page)
    const w = page.getByLabel('set 1 weight', { exact: true }).first(), r = page.getByLabel('set 1 reps', { exact: true }).first()
    await w.fill(''); await w.pressSequentially('1250'); await expect(w).toHaveValue('999')
    await page.getByRole('button', { name: 'More set 1 weight' }).first().click(); await expect(w).toHaveValue('999')
    await r.fill(''); await r.pressSequentially('150'); await expect(r).toHaveValue('99')
    await w.fill(''); await w.pressSequentially('247,5'); await r.click(); await expect(w).toHaveValue('247.5')
    expect(await page.evaluate(() => [...document.querySelectorAll('.stp input')].every(i => i.scrollWidth <= i.clientWidth + 1))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
})

test('back goes to Today and stays there', async ({ page }) => {
  await startWorkout(page, 'Full body')
  await page.getByRole('button', { name: 'Back' }).tap()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Workout in progress')).toBeVisible()
  await page.getByRole('link', { name: 'History' }).click()
  await page.getByRole('link', { name: 'Today' }).click()
  await page.waitForTimeout(300)
  await expect(page).toHaveURL(/\/$/)
})

test('reopening goes straight back into a recent workout', async ({ page }) => {
  await startWorkout(page)
  await page.getByRole('button', { name: 'Done set 1' }).first().click()
  await page.getByLabel('set 2 reps', { exact: true }).first().fill('7')
  await page.goto('/')
  await page.waitForURL('**/workout')
  await expect(page.getByRole('button', { name: 'Undo set 1' }).first()).toBeVisible()
  await expect(page.getByLabel('set 2 reps', { exact: true }).first()).toHaveValue('7')
  await page.goto('/history')
  await page.waitForTimeout(300)
  await expect(page).toHaveURL(/\/history$/)
})

test('an untouched workout asks to save or discard', async ({ page }) => {
  await startWorkout(page)
  await page.getByRole('button', { name: 'Done set 1' }).first().click()
  const prompt = page.getByRole('dialog', { name: 'Unfinished workout' })

  await age(page, 5)
  await page.goto('/')
  await expect(prompt).toContainText(/You started Push A on .* and didn't finish it\. 1 of \d+ sets are ticked\./)
  await prompt.getByRole('button', { name: 'Keep going' }).click()
  await page.waitForURL('**/workout')
  await page.goto('/')
  await page.waitForURL('**/workout')                        // keep going counted as activity
  await expect(prompt).toHaveCount(0)

  // returning to the app (still in memory) after hours
  await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 6 * 3600e3 })
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await prompt.getByRole('button', { name: 'Save what you logged' }).click()
  const S = await state(page)
  expect(S.active).toBeNull()
  expect(S.sessions).toHaveLength(1)
  expect(S.sessions[0].durationMin).toBeLessThan(5)             // ends at the last ticked set

  await page.reload()                                          // real clock again
  await page.getByRole('button', { name: 'Start workout' }).click()
  await page.waitForURL('**/workout')
  await age(page, 5)
  await page.goto('/')
  await expect(prompt.getByRole('button', { name: 'Save what you logged' })).toHaveCount(0)
  await prompt.getByRole('button', { name: 'Discard workout' }).click()
  expect((await state(page)).sessions).toHaveLength(1)
})

test('add an exercise for today, skip another, finish without the unchecked warning', async ({ page }) => {
  await startWorkout(page, 'Full body')
  const before = (await state(page)).active.entries.length
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByPlaceholder(/Search/).fill('Hammer Curl')
  await page.getByRole('button', { name: /^Dumbbell Hammer Curl Biceps/ }).click()
  const card = page.locator('.card.ex').last()
  await expect(card).toContainText('Dumbbell Hammer Curl')
  await card.getByRole('button', { name: 'Done set 1' }).click()
  // Skip every program exercise except the first, tick one set of it, then finish
  for (let i = before - 1; i >= 1; i--) await page.locator('.card.ex').nth(i).getByRole('button', { name: 'Skip today' }).click()
  await expect(page.locator('.card.ex.skipped')).toHaveCount(before - 1)
  const first = page.locator('.card.ex').first()
  const sets = await first.locator('.set').count()
  for (let i = 1; i <= sets; i++) await first.getByRole('button', { name: `Done set ${i}` }).click()
  // Two of the curl's three sets are unticked: only those are warned about
  page.once('dialog', d => { expect(d.message()).toMatch(/^2 sets not checked off/); d.accept() })
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page.waitForURL(/\/$/)
  const S = await state(page)
  expect(S.sessions[0].entries).toHaveLength(2)
  expect(S.sessions[0].entries[1]).toMatchObject({ name: 'Dumbbell Hammer Curl', muscles: ['biceps', 'forearm'] })
  expect(S.program.days.flatMap(d => d.exercises).some(e => e.name === 'Dumbbell Hammer Curl' && e.id === S.sessions[0].entries[1].exId)).toBe(false)
})
