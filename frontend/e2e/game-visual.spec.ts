import { expect, test, type Page } from '@playwright/test'

type Scenario = 'default' | 'take-gems' | 'purchase' | 'discard'

const openFixture = async (page: Page, scenario: Scenario): Promise<void> => {
  const applicationSockets: string[] = []
  page.on('websocket', socket => {
    const path = new URL(socket.url()).pathname
    if (path === '/ws' || path.startsWith('/ws/')) applicationSockets.push(socket.url())
  })
  await page.goto(`/visual-fixture.html?scenario=${scenario}`)
  await expect(page.locator('html')).toHaveAttribute('data-visual-fixture-ready', scenario)
  expect(applicationSockets).toEqual([])
}

test('renders the deterministic game baseline', async ({ page }) => {
  await openFixture(page, 'default')
  await expect(page.getByRole('heading', { name: '游戏版图', exact: true })).toBeVisible()
  await expect(page.locator('.player-card')).toHaveCount(2)
  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth)
  await expect(page).toHaveScreenshot('game-default.png', { fullPage: true })
})

test.describe('mobile dialog baselines', () => {
  test('@mobile-dialog captures the current take-gems dialog', async ({ page }) => {
    await openFixture(page, 'take-gems')
    await expect(page.locator('.dialog-content')).toBeVisible()
    await expect(page).toHaveScreenshot('take-gems-dialog.png', { fullPage: true })
  })

  test('@mobile-dialog captures the current purchase payment dialog', async ({ page }) => {
    await openFixture(page, 'purchase')
    await expect(page.locator('.dialog-header h3')).toHaveText('购买发展卡')
    await expect(page).toHaveScreenshot('purchase-dialog.png', { fullPage: true })
  })

  test('@mobile-dialog captures the mandatory discard dialog', async ({ page }) => {
    await openFixture(page, 'discard')
    await expect(page.locator('.dialog-header h3')).toHaveText('丢弃宝石')
    await expect(page).toHaveScreenshot('discard-dialog.png', { fullPage: true })
  })
})
