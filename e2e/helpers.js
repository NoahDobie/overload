// Shared helpers for the browser tests.

/** Open the app with empty storage. */
export async function freshApp(page, path = '/') {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto(path)
}

/** Build a program from a template (button name starts with `template`) and save it. */
export async function buildFrom(page, template) {
  await freshApp(page)
  await page.getByRole('link', { name: 'Build a program' }).click()
  await page.getByRole('button', { name: new RegExp('^' + template.replace(/[/()]/g, '\\$&')) }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForURL('**/settings')
}

/** The persisted app state. */
export const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('overload_v1')).state)

/** Edit the persisted state, then reload so the app reads it. */
export async function setState(page, fn) {
  await page.evaluate(src => {
    const s = JSON.parse(localStorage.getItem('overload_v1') || '{"version":1,"state":{}}')
    // eslint-disable-next-line no-new-func
    new Function('s', src)(s.state)
    localStorage.setItem('overload_v1', JSON.stringify(s))
  }, `(${fn})(s)`)
  await page.reload()
}

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function centre(locator) {
  const b = await locator.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** Drag with the mouse from a handle to a page y. */
export async function mouseDrag(page, handle, toY, steps = 16) {
  const { x, y } = await centre(handle)
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x, y + (toY - y) * i / steps); await page.waitForTimeout(16) }
  await page.waitForTimeout(80)
  await page.mouse.up()
  await page.waitForTimeout(80)
}

/** Drag with a real touch (like a finger on a phone) from a handle to a page y. */
export async function touchDrag(page, handle, toY, steps = 14) {
  const cdp = await page.context().newCDPSession(page)
  const { x, y } = await centre(handle)
  const pt = yy => [{ x, y: yy, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(y) })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(y + (toY - y) * i / steps) })
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(80)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(80)
}

// ---- fake Supabase -------------------------------------------------------------------

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')

/**
 * A fake Supabase account. Pass the same account to several browser contexts to act as
 * several signed-in devices. account.doc is the server copy; account.pushes counts uploads.
 * account.knownEmails decides which emails may sign in; signIn() follows the emailed link.
 */
export function fakeAccount(email = 'me@example.com') {
  const user = { id: '33333333-3333-3333-3333-333333333333', email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email, role: 'authenticated', aud: 'authenticated', exp })}.sig`
  return { user, jwt, exp, doc: null, pushes: 0, knownEmails: new Set([email]), lastOtp: null }
}

export async function mockSupabase(context, account) {
  await context.route(/e2e\.supabase\.co\//, async route => {
    const req = route.request(), url = new URL(req.url())
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname.endsWith('/auth/v1/otp')) {
      account.lastOtp = req.postDataJSON()
      if (!account.knownEmails.has(account.lastOtp.email)) return json(422, { code: 422, error_code: 'otp_disabled', msg: 'Signups not allowed for otp' })
      return json(200, {})
    }
    if (url.pathname.endsWith('/auth/v1/user')) return json(200, account.user)
    if (url.pathname.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204 })
    if (url.pathname.endsWith('/rest/v1/user_state')) {
      if (req.method() === 'GET') return json(200, account.doc ? [{ doc: account.doc }] : [])
      if (req.method() === 'POST') {
        const doc = req.postDataJSON().doc
        if (JSON.stringify(doc).length > 1048576) return json(400, { code: '23514', message: 'new row for relation "user_state" violates check constraint "doc_max_1mb"' })
        account.pushes++
        account.doc = doc
        return route.fulfill({ status: 201, body: '' })
      }
    }
    return json(404, {})
  })
}

/** The link in the sign-in email: back to the app with the session in the URL hash. */
export const magicLink = account =>
  `/#access_token=${account.jwt}&expires_at=${account.exp}&expires_in=3600&refresh_token=r&token_type=bearer&type=magiclink`

/** Request a link through Settings, then open it, as tapping it in the email does. */
export async function signIn(page, account) {
  await page.goto('/settings')
  await page.getByPlaceholder('you@email.com').fill(account.user.email)
  await page.getByRole('button', { name: 'Send link' }).click()
  await page.getByText(/for a sign-in link/).waitFor()
  await page.goto(magicLink(account))
  await page.goto('/settings')
  await page.getByText(/^Synced /).waitFor()
}

/** What switching back to the app does: run a sync. */
export async function refocus(page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(700)
}
