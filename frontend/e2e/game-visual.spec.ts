import { expect, test, type Page } from '@playwright/test'

type Scenario = 'default' | 'take-gems' | 'spend-privilege' | 'purchase' | 'reserve' | 'refill' | 'discard' | 'victory'

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
  await expect(page.locator('.status[role="status"]')).toHaveAttribute('aria-live', 'polite')
  await expect(page.getByRole('textbox', { name: '聊天消息' })).toBeVisible()
  const firstBoardGem = page.locator('.game-board .gem-cell:not(:disabled)').first()
  await firstBoardGem.focus()
  await expect(firstBoardGem).toBeFocused()
  await expect(firstBoardGem).toHaveAttribute('aria-label', /第\d+行第\d+列/)
  await firstBoardGem.blur()
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
    const historyPreviewTrigger = page.getByRole('button', { name: '查看发展卡图片预览' })
    await historyPreviewTrigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: '历史图片预览' })).toBeVisible()
    await page.getByRole('button', { name: '关闭历史图片预览' }).click()
    await expect(page.getByRole('dialog', { name: '历史图片预览' })).toHaveCount(0)
    await mobilePanels.nth(2).locator('.mobile-panel-summary').click()
    const nobleDisclosure = page.getByRole('button', { name: /查看1位贵族/ }).first()
    await nobleDisclosure.click()
    await expect(nobleDisclosure).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('button', { name: '关闭贵族预览' }).click()
    await expect(nobleDisclosure).toHaveAttribute('aria-expanded', 'false')
    const mobileNav = page.locator('.mobile-game-nav')
    await expect(mobileNav).toBeVisible()
    await expect(mobileNav.getByText('轮到你', { exact: true })).toBeVisible()
    const navBounds = await mobileNav.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return { left: bounds.left, right: bounds.right, bottom: bounds.bottom }
    })
    expect(navBounds.left).toBeGreaterThanOrEqual(0)
    expect(navBounds.right).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(navBounds.bottom).toBeLessThanOrEqual(page.viewportSize()!.height)
    await page.locator('.chat-input input').focus()
    await expect(mobileNav).toBeHidden()
    await page.locator('.chat-input input').blur()
    await expect(mobileNav).toBeVisible()
    await mobileNav.getByRole('button', { name: '历史' }).click()
    await expect(page.locator('#game-history-section')).toBeInViewport()
    await mobileNav.getByRole('button', { name: '棋盘' }).click()
    await expect(page.locator('#game-board-section')).toBeInViewport()
    await mobilePanels.nth(2).locator('.mobile-panel-summary').evaluate(button => (button as HTMLButtonElement).click())
    await page.evaluate(() => window.scrollTo(0, 0))
  } else {
    await expect(page.locator('.player-card:visible')).toHaveCount(2)
    await expect(page.locator('.mobile-panel-content:visible')).toHaveCount(3)
    await expect(page.locator('.mobile-game-nav')).toBeHidden()
  }
  await expect(page).toHaveScreenshot('game-default.png', { fullPage: true })
})

test('uses a labelled neutral fallback for a broken business image', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-primary')
  await openFixture(page, 'default')
  const card = page.locator('.development-cards .card-image').first()
  const label = await card.getAttribute('alt')
  await card.evaluate(image => { (image as HTMLImageElement).src = '/images/cards/__missing-stage31__.jpg' })
  const fallback = page.locator('.development-cards .card-text-fallback').first()
  await expect(fallback).toBeVisible()
  await expect(fallback).toHaveAttribute('role', 'img')
  await expect(fallback).toHaveAttribute('aria-label', label || '发展卡')
  await expect(fallback).not.toHaveText('加载失败')
})

test('keeps victory focus inside the named modal and makes the game inert', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-primary')
  await openFixture(page, 'victory')
  const dialog = page.getByRole('dialog', { name: '游戏结束' })
  const close = dialog.getByRole('button', { name: '知道了' })
  await expect(dialog).toBeVisible()
  await expect(close).toBeFocused()
  await expect(page.locator('main.game-main')).toHaveAttribute('inert', '')
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await close.click()
  await expect(dialog).toHaveCount(0)
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

  test('keeps direct take-gems interaction accessible without overflow', async ({ page }, testInfo) => {
    await openFixture(page, 'take-gems')
    await expect(page.locator('.dialog-content')).toBeHidden()
    const actionBar = page.getByRole('region', { name: '拿取宝石' })
    await expect(actionBar).toBeVisible()
    await expect(page.locator('.mobile-game-nav')).toBeHidden()

    const selectableGem = page.locator('[data-board-position="0-1"]')
    await expect(selectableGem).toHaveAttribute('aria-label', '选择蓝色，第1行第2列')
    await selectableGem.focus()
    await expect(selectableGem).toHaveCSS('outline-width', '3px')
    await page.keyboard.press('Enter')
    await expect(selectableGem).toHaveAttribute('aria-pressed', 'true')
    await actionBar.getByRole('button', { name: '清除' }).click()
    await page.getByRole('button', { name: '选择白色，第1行第1列', exact: true }).click()

    const boardMetrics = await page.locator('.gem-grid').evaluate(element => {
      const bounds = element.getBoundingClientRect()
      const cells = Array.from(element.querySelectorAll<HTMLElement>('.gem-cell'))
      return {
        left: bounds.left,
        right: bounds.right,
        minimumCellWidth: Math.min(...cells.map(cell => cell.getBoundingClientRect().width)),
        minimumCellHeight: Math.min(...cells.map(cell => cell.getBoundingClientRect().height))
      }
    })
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    expect(boardMetrics.left).toBeGreaterThanOrEqual(0)
    expect(boardMetrics.right).toBeLessThanOrEqual(viewport!.width)
    expect(boardMetrics.minimumCellWidth).toBeGreaterThanOrEqual(44)
    expect(boardMetrics.minimumCellHeight).toBeGreaterThanOrEqual(44)
    const pageWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }))
    expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth)
    await page.screenshot({ path: testInfo.outputPath('take-gems-direct-actual.png'), fullPage: true, animations: 'disabled' })
  })

  test('keeps direct privilege interaction inside the primary mobile viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-primary')
    await openFixture(page, 'spend-privilege')
    await expect(page.locator('.dialog-content')).toBeHidden()
    const actionBar = page.getByRole('region', { name: '花费特权' })
    await expect(actionBar).toBeVisible()
    await actionBar.getByRole('button', { name: '2', exact: true }).click()
    await page.getByRole('button', { name: '选择白色，第1行第1列', exact: true }).click()
    await page.getByRole('button', { name: '选择蓝色，第1行第2列', exact: true }).tap()
    await expect(actionBar.getByRole('button', { name: '确认' })).toBeEnabled()
    const pageWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }))
    expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth)
    await page.screenshot({ path: testInfo.outputPath('spend-privilege-direct-actual.png'), fullPage: true, animations: 'disabled' })
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

  test('keeps direct reserve interaction accessible without overflow', async ({ page }, testInfo) => {
    await openFixture(page, 'reserve')
    await expect(page.locator('.dialog-content')).toBeHidden()
    const actionBar = page.getByRole('region', { name: '保留发展卡' })
    await expect(actionBar).toBeVisible()
    await expect(actionBar.locator('.selected-gold')).toHaveText('黄金坐标 (2, 2)')
    await expect(page.locator('.mobile-game-nav')).toBeHidden()

    const marketCard = page.getByRole('button', { name: /保留发展卡：/ }).first()
    await marketCard.focus()
    await page.keyboard.press('Enter')
    await expect(marketCard).toHaveAttribute('aria-pressed', 'true')
    await marketCard.click()
    await expect(marketCard).toHaveAttribute('aria-pressed', 'false')
    if (testInfo.project.name.startsWith('mobile-')) {
      await marketCard.tap()
    } else {
      await marketCard.click()
    }
    await actionBar.getByRole('button', { name: '清除' }).click()
    await expect(marketCard).toHaveAttribute('aria-pressed', 'false')

    const deck = page.getByRole('button', { name: '保留等级3牌堆顶牌' })
    await deck.click()
    await expect(deck).toHaveAttribute('aria-pressed', 'true')
    await deck.click()
    await expect(deck).toHaveAttribute('aria-pressed', 'false')
    await marketCard.click()
    await expect(actionBar.locator('.selected-target')).toContainText('场上卡')
    await expect(actionBar.getByRole('button', { name: '确认保留' })).toBeEnabled()

    const targetsMeetMinimum = await page.locator('.gem-cell.selected, .card-item[aria-pressed="true"], .context-actions button').evaluateAll(elements =>
      elements.every(element => {
        const bounds = element.getBoundingClientRect()
        return bounds.width >= 44 && bounds.height >= 44
      }))
    expect(targetsMeetMinimum).toBe(true)
    const pageWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }))
    expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth)
    await page.screenshot({ path: testInfo.outputPath('reserve-direct-actual.png'), fullPage: true, animations: 'disabled' })
  })

  test('keeps refill confirmation inline with its privilege warning', async ({ page }, testInfo) => {
    await openFixture(page, 'refill')
    await expect(page.locator('.dialog-content')).toBeHidden()
    const actionBar = page.getByRole('region', { name: '确认补充版图' })
    await expect(actionBar).toBeVisible()
    await expect(actionBar.getByRole('alert')).toHaveText('补充版图后，对手获得特权')
    await expect(actionBar.getByRole('button', { name: '确认补盘' })).toBeEnabled()
    await expect(page.locator('.mobile-game-nav')).toBeHidden()

    const bagTarget = await page.locator('.bag-pill').evaluate(element => {
      const hitArea = getComputedStyle(element, '::before')
      return { width: Number.parseFloat(hitArea.width), height: Number.parseFloat(hitArea.height) }
    })
    expect(bagTarget.width).toBeGreaterThanOrEqual(44)
    expect(bagTarget.height).toBeGreaterThanOrEqual(44)
    const actionTargetsMeetMinimum = await actionBar.locator('button').evaluateAll(buttons =>
      buttons.every(button => {
        const bounds = button.getBoundingClientRect()
        return bounds.width >= 44 && bounds.height >= 44
      }))
    expect(actionTargetsMeetMinimum).toBe(true)
    const pageWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }))
    expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth)
    await page.screenshot({ path: testInfo.outputPath('refill-inline-actual.png'), fullPage: true, animations: 'disabled' })
  })
})
