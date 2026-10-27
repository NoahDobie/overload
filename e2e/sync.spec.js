import { test, expect } from '@playwright/test'
import { freshApp, buildFrom, state, fakeAccount, mockSupabase, signIn, refocus, magicLink } from './helpers.js'

test('sign in by link; unknown emails are turned away', async ({ page, context }) => {
  const acct = fakeAccount()
  await mockSupabase(context, acct)
  await buildFrom(page, 'Upper / Lower')
  await page.getByPlaceholder('you@email.com').fill('stranger@example.com')
  await page.getByRole('button', { name: 'Send link' }).click()
  await expect(page.getByText('No account for this email. Ask the owner to invite you.')).toBeVisible()
  expect(acct.lastOtp.create_user).toBe(false)

  await page.getByPlaceholder('you@email.com').fill('me@example.com')
  await page.getByRole('button', { name: 'Send link' }).click()
  await expect(page.getByText('Check me@example.com for a sign-in link. Open it on this device.')).toBeVisible()
  await expect(page.getByPlaceholder('Code')).toHaveCount(0)
  await page.goto(magicLink(acct))
  await page.goto('/settings')
  await page.getByText(/^Synced /).waitFor()
  await expect(page.getByText('Signed in as')).toContainText('me@example.com')
  expect(acct.doc.program.name).toBe('Upper / Lower')
})

test('offline changes save locally and sync on reconnect; sign-out guards unsynced data', async ({ page, context }) => {
  const acct = fakeAccount()
  await mockSupabase(context, acct)
  await buildFrom(page, 'Upper / Lower')
  await signIn(page, acct)
  const pushes = acct.pushes

  await context.setOffline(true)
  await page.getByRole('link', { name: 'Today' }).click()
  await page.getByPlaceholder(/Today's weight/).fill('181.2')
  await page.getByRole('button', { name: 'Log' }).click()
  await page.waitForTimeout(2600)
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByText(/^Offline\./)).toBeVisible()
  expect(acct.pushes).toBe(pushes)
  await context.setOffline(false)
  await page.getByText(/^Synced /).waitFor({ timeout: 10_000 })
  expect(acct.doc.bodyweight.some(b => b.weight == 181.2)).toBe(true)

  // unsynced change + sign out → warned; cancel keeps you signed in
  await context.setOffline(true)
  await page.getByRole('link', { name: 'Today' }).click()
  await page.getByPlaceholder(/Today: /).fill('180')
  await page.getByRole('button', { name: 'Update' }).click()
  await page.getByRole('link', { name: 'Settings' }).click()
  let warned = ''
  page.once('dialog', d => { warned = d.message(); d.dismiss() })
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect.poll(() => warned).toContain("haven't synced")
  await expect(page.getByText('Signed in as')).toBeVisible()
  await context.setOffline(false)
  await page.getByText(/^Synced /).waitFor({ timeout: 10_000 })

  // online sign out: clears this device, account keeps everything
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByPlaceholder('you@email.com').waitFor()
  const S = await state(page)
  expect(S.program).toBeNull()
  expect(S.bodyweight).toHaveLength(0)
  expect(acct.doc.bodyweight.some(b => b.weight == 180)).toBe(true)

  await signIn(page, acct)
  expect((await state(page)).program.name).toBe('Upper / Lower')
})

test('two devices: clear program, then erase the account', async ({ browser }) => {
  const acct = fakeAccount()
  const device = async () => {
    const context = await browser.newContext()
    await mockSupabase(context, acct)
    const page = await context.newPage()
    page.on('dialog', d => (d.type() === 'prompt' ? d.accept(page.answer ?? '') : d.accept()))
    await freshApp(page)
    return { context, page }
  }
  const phone = await device(), laptop = await device()

  await phone.page.getByRole('link', { name: 'Build a program' }).click()
  await phone.page.getByRole('button', { name: /^Upper \/ Lower/ }).click()
  await phone.page.getByRole('button', { name: 'Save', exact: true }).click()
  await phone.page.waitForURL('**/settings')
  await signIn(phone.page, acct)
  await phone.page.getByRole('link', { name: 'Today' }).click()
  await phone.page.getByPlaceholder(/Today's weight/).fill('180')
  await phone.page.getByRole('button', { name: 'Log' }).click()
  await phone.page.waitForTimeout(2600)
  await signIn(laptop.page, acct)
  expect((await state(laptop.page)).program.name).toBe('Upper / Lower')

  // clear program on the phone reaches the laptop; history stays
  await phone.page.goto('/settings')
  await phone.page.getByRole('button', { name: 'Clear program' }).click()
  await phone.page.waitForTimeout(2600)
  expect(acct.doc.program).toMatchObject({ deleted: true })
  await refocus(laptop.page)
  let L = await state(laptop.page)
  expect(L.program).toBeNull()
  expect(L.bodyweight).toHaveLength(1)

  // erase refused offline and on a wrong word
  await phone.page.goto('/settings')
  phone.page.answer = 'ERASE'
  await phone.context.setOffline(true)
  await phone.page.getByRole('button', { name: 'Erase everything in my account' }).click()
  await expect(phone.page.getByText(/Nothing was erased: You're offline/)).toBeVisible()
  await phone.context.setOffline(false)
  phone.page.answer = 'nope'
  await phone.page.getByRole('button', { name: 'Erase everything in my account' }).click()
  await phone.page.waitForTimeout(300)
  expect(acct.doc.bodyweight).toHaveLength(1)

  // the laptop logs offline (before the reset), then the phone erases the account
  await laptop.page.goto('/')
  await laptop.context.setOffline(true)
  await laptop.page.getByPlaceholder(/Today: /).fill('181')
  await laptop.page.getByRole('button', { name: 'Update' }).click()
  phone.page.answer = 'ERASE'
  await phone.page.getByRole('button', { name: 'Erase everything in my account' }).click()
  await phone.page.waitForTimeout(800)
  const P = await state(phone.page)
  expect(P.bodyweight).toHaveLength(0)
  expect(acct.doc.resetAt).toBeGreaterThan(0)

  await laptop.context.setOffline(false)
  await refocus(laptop.page)
  L = await state(laptop.page)
  expect(L.bodyweight).toHaveLength(0)                      // wiped, not re-uploaded
  expect(acct.doc.bodyweight).toHaveLength(0)
})
