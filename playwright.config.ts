import { defineConfig, devices } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'

// Use a locally provided Chromium when the matching Playwright build is not
// installed (e.g. sandboxes with a pre-installed browser). CI installs its own.
function localChromium(): string | undefined {
  if (process.env.CI) return undefined
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH
  const root = '/opt/pw-browsers'
  if (!existsSync(root)) return undefined
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const exe = `${root}/${dir}/chrome-linux/chrome`
    if (existsSync(exe)) return exe
  }
  return undefined
}

const PORT = 4174

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { executablePath: localChromium() },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
