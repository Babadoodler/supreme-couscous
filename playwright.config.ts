import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    ...devices['Pixel 7'], // mobile viewport per DESIGN.md §13
    baseURL: 'http://localhost:4173',
    // Sandboxed/dev environments can point at a system Chromium instead of
    // a Playwright-managed download.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI
  }
});
