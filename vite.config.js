import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // e2e/ is Playwright's (npm run e2e)
  test: { environment: 'node', include: ['src/**/*.test.js'] }
})
