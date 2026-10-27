import { defineConfig } from '@playwright/test'

// Browser tests at phone size against the dev server, using the installed Microsoft Edge (no
// browser download). Supabase points at a fake host that the tests answer themselves
// (e2e/helpers.js), so they never touch the real project.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'msedge',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    colorScheme: 'dark'
  },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://e2e.supabase.co', VITE_SUPABASE_ANON_KEY: 'e2e-anon-key' }
  }
})
