import { expect, test, type Page } from '@playwright/test'

type Scenario = 'default' | 'take-gems' | 'purchase' | 'reserve' | 'discard'

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

test('renders the deterministic game baseline', async ({ page }, testInfo) => {
  await openFixture(page, 'default')
  await expect(page.getByRole('heading', { name: '游戏版图', exact: true })).toBeVisible()
  await expect(page.locator('.player-card')).toHaveCount(2)
  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth)
  if (testInfo.project.name.startsWith('mobile-')) {
    const tracks = await page.locator('.development-cards .cards-row').evaluateAll(rows => rows.map(row => ({
      clientWidth: row.clientWidth,
      scrollWidth: row.scrollWidth
    })))
    expect(tracks).toHaveLength(3)
    expect(tracks.every(track => track.scrollWidth >= track.clientWidth)).toBe(true)
    await expect(page.locator('.development-cards .deck-count').first()).toBeVisible()
    await expect(page.locator('.player-summary')).toHaveCount(2)
    await expect(page.locator('.player-details').first()).toHaveClass(/expanded/)
    await expect(page.locator('.player-details').nth(1)).not.toHaveClass(/expanded/)
    await expect(page.locator('.player-card:visible')).toHaveCount(1)
    const mobilePanels = page.locator('.mobile-collapsible-panel')
    await expect(mobilePanels).toHaveCount(3)
    await expect(mobilePanels.nth(0)).not.toHaveClass(/expanded/)
    await expect(mobilePanels.nth(1)).toHaveClass(/expanded/)
    await expect(mobilePanels.nth(2)).not.toHaveClass(/expanded/)
    await expect(page.locator('.chat-input')).toBeVisible()
    const panelBoundsAreValid = await page.locator('.mobile-panel-summary').evaluateAll(summaries => summaries.every(summary => {
      const bounds = summary.getBoundingClientRect()
      return bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.height >= 44
    }))
    expect(panelBoundsAreValid).toBe(true)
    await mobilePanels.nth(2).locator('.mobile-panel-summary').click()
    await expect(page.locator('.history-list')).toBeVisible()
    await mobilePanels.nth(2).locator('.mobile-panel-summary').click()
  } else {
    await expect(page.locator('.player-card:visible')).toHaveCount(2)
    await expect(page.locator('.mobile-panel-content:visible')).toHaveCount(3)
  }
  await expect(page).toHaveScreenshot('game-default.png', { fullPage: true })
})

test.describe('mobile dialog baselines', () => {
  const expectResponsiveDialog = async (page: Page, exerciseBodyScroll = false): Promise<void> => {
    const metrics = await page.locator('.dialog-content').evaluate(element => {
      const dialog = element.getBoundingClientRect()
      const body = element.querySelector<HTMLElement>('.dialog-body')
      const header = element.querySelector<HTMLElement>('.dialog-header')
      const footer = element.querySelector<HTMLElement>('.dialog-footer')
      if (!body || !header || !footer) throw new Error('dialog shell is incomplete')
      const headerBox = header.getBoundingClientRect()
      const footerBox = footer.getBoundingClientRect()
      return {
        dialog: { left: dialog.left, right: dialog.right, top: dialog.top, bottom: dialog.bottom },
        bodyClientWidth: body.clientWidth,
        bodyScrollWidth: body.scrollWidth,
        bodyClientHeight: body.clientHeight,
        bodyScrollHeight: body.scrollHeight,
        headerTop: headerBox.top,
        footerBottom: footerBox.bottom
      }
    })
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    expect(metrics.dialog.left).toBeGreaterThanOrEqual(0)
    expect(metrics.dialog.right).toBeLessThanOrEqual(viewport!.width)
    expect(metrics.dialog.top).toBeGreaterThanOrEqual(0)
    expect(metrics.dialog.bottom).toBeLessThanOrEqual(viewport!.height)
    expect(metrics.bodyScrollWidth).toBe(metrics.bodyClientWidth)
    expect(metrics.headerTop).toBeGreaterThanOrEqual(0)
    expect(metrics.footerBottom).toBeLessThanOrEqual(viewport!.height)
    await expect(page.locator('.dialog-footer')).toBeVisible()
    const pageWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }))
    expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth)

    if (exerciseBodyScroll && metrics.bodyScrollHeight > metrics.bodyClientHeight) {
      const before = await page.locator('.dialog-footer').boundingBox()
      await page.locator('.dialog-body').evaluate(element => { element.scrollTop = element.scrollHeight })
      const after = await page.locator('.dialog-footer').boundingBox()
      expect(after?.y).toBe(before?.y)
      await expect(page.locator('.dialog-header')).toBeVisible()
      await expect(page.locator('.dialog-footer')).toBeVisible()
    }
  }

  test('@mobile-dialog keeps the take-gems shell inside the viewport', async ({ page }, testInfo) => {
    await openFixture(page, 'take-gems')
    await expect(page.locator('.dialog-content')).toBeVisible()
    await expectResponsiveDialog(page)
    if (testInfo.project.name === 'mobile-primary') {
      await expect(page).toHaveScreenshot('take-gems-dialog.png', { fullPage: true })
    }
  })

  test('@mobile-dialog keeps purchase payment from overflowing', async ({ page }, testInfo) => {
    await openFixture(page, 'purchase')
    await expect(page.locator('.dialog-header h3')).toHaveText('购买发展卡')
    await expectResponsiveDialog(page)
    const payment = await page.locator('.buy-card-content').evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }))
    expect(payment.scrollWidth).toBe(payment.clientWidth)
    if (testInfo.project.name === 'mobile-primary') {
      await expect(page).toHaveScreenshot('purchase-dialog.png', { fullPage: true })
    }
  })

  test('@mobile-dialog keeps the mandatory discard footer reachable', async ({ page }, testInfo) => {
    await openFixture(page, 'discard')
    await expect(page.locator('.dialog-header h3')).toHaveText('丢弃宝石')
    await expectResponsiveDialog(page)
    if (testInfo.project.name === 'mobile-primary') {
      await expect(page).toHaveScreenshot('discard-dialog.png', { fullPage: true })
    }
  })

  test('@mobile-dialog scrolls long reserve content without moving its actions', async ({ page }, testInfo) => {
    await openFixture(page, 'reserve')
    await expect(page.locator('.dialog-header h3')).toHaveText('保留发展卡')
    await expectResponsiveDialog(page, true)
    if (testInfo.project.name === 'mobile-primary') {
      await expect(page).toHaveScreenshot('reserve-dialog.png', { fullPage: true })
    }
  })
})
