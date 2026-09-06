import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    timezoneId: 'Asia/Shanghai',
    locale: 'zh-CN',
    colorScheme: 'light',
    reducedMotion: 'reduce'
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide'
    }
  },
  projects: [
    { name: 'mobile-narrow', use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
    { name: 'mobile-primary', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'mobile-wide', use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', grepInvert: /@mobile-dialog/, use: { viewport: { width: 1440, height: 900 } } }
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/visual-fixture.html',
    reuseExistingServer: false,
    timeout: 120_000
  }
})
