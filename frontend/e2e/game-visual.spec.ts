import { expect, test, type Locator, type Page } from '@playwright/test'

type Scenario = 'default' | 'take-gems' | 'spend-privilege' | 'purchase' | 'reserve' | 'refill' | 'extra-token' | 'steal-token' | 'wildcard' | 'noble' | 'discard' | 'victory' | 'pending' | 'unknown'

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

// 程序滚动后浏览器 scroll anchoring 异步收敛：连续两帧 scrollY 采样不变视为沉降完成
const settleScroll = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => new Promise<boolean>(resolve => {
    const last = window.scrollY
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY === last)))
  }), undefined, { polling: 'raf' })
}

test('renders the deterministic game baseline', async ({ page }, testInfo) => {
  await openFixture(page, 'default')
  await expect(page.getByRole('heading', { name: '游戏版图', exact: true })).toBeVisible()
  await expect(page.locator('.status[role="status"]')).toHaveAttribute('aria-live', 'polite')
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
    await expect(page.locator('.player-details').first()).not.toHaveClass(/expanded/)
    await expect(page.locator('.player-details').nth(1)).not.toHaveClass(/expanded/)
    await expect(page.locator('.player-card:visible')).toHaveCount(0)
    const mobilePanels = page.locator('.mobile-collapsible-panel')
    await expect(mobilePanels).toHaveCount(2)
    await expect(mobilePanels.nth(0)).toHaveClass(/expanded/)
    await expect(mobilePanels.nth(1)).not.toHaveClass(/expanded/)
    await expect(page.locator('.history-list')).toBeVisible()
    await expect(page.locator('.chat-input')).toBeHidden()
    const panelBoundsAreValid = await page.locator('.mobile-panel-summary').evaluateAll(summaries => summaries.every(summary => {
      const bounds = summary.getBoundingClientRect()
      return bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.height >= 44
    }))
    expect(panelBoundsAreValid).toBe(true)
    const historyPreviewTrigger = page.getByRole('button', { name: '查看发展卡图片预览' })
    await historyPreviewTrigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: '历史图片预览' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '历史图片预览' })).toHaveCount(0)
    await page.locator('.player-details').first().locator('.player-summary').click()
    const nobleDisclosure = page.getByRole('button', { name: /查看1位贵族/ }).first()
    await nobleDisclosure.click()
    await expect(nobleDisclosure).toHaveAttribute('aria-expanded', 'true')
    await page.locator('body').click({ position: { x: 4, y: 4 } })
    await expect(nobleDisclosure).toHaveAttribute('aria-expanded', 'false')
    await page.locator('.player-details').first().locator('.player-summary').click()
    const mobileNav = page.locator('.mobile-game-nav')
    await expect(mobileNav).toBeVisible()
    await expect(mobileNav.getByText('你的回合', { exact: true })).toBeVisible()
    const navBounds = await mobileNav.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return { left: bounds.left, right: bounds.right, bottom: bounds.bottom }
    })
    expect(navBounds.left).toBeGreaterThanOrEqual(0)
    expect(navBounds.right).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(navBounds.bottom).toBeLessThanOrEqual(page.viewportSize()!.height)
    await mobilePanels.nth(1).locator('.mobile-panel-summary').click()
    await expect(page.getByRole('textbox', { name: '聊天消息' })).toBeVisible()
    await page.locator('.chat-input input').focus()
    await expect(mobileNav).toBeHidden()
    await page.locator('.chat-input input').blur()
    await expect(mobileNav).toBeVisible()
    await mobilePanels.nth(1).locator('.mobile-panel-summary').click()
    await mobileNav.getByRole('button', { name: '历史' }).click()
    await expect(page.locator('#game-history-section')).toBeInViewport()
    await mobileNav.getByRole('button', { name: '版图' }).click()
    await expect(page.locator('#game-board-section')).toBeInViewport()
    await page.evaluate(() => window.scrollTo(0, 0))
  } else {
    await expect(page.getByRole('textbox', { name: '聊天消息' })).toBeVisible()
    await expect(page.locator('.player-card:visible')).toHaveCount(2)
    await expect(page.locator('.mobile-panel-content:visible')).toHaveCount(2)
    await expect(page.locator('.mobile-game-nav')).toBeHidden()
  }
  if (testInfo.project.use.browserName === 'chromium') {
    await expect(page).toHaveScreenshot('game-default.png', { fullPage: true })
  }
})

test('de-emphasizes empty cells, hints the send key and sizes the shell with dvh', async ({ page }) => {
  await page.goto('/visual-fixture.html?scenario=default&board=gap')
  await expect(page.locator('html')).toHaveAttribute('data-visual-fixture-ready', 'default')

  // 空格文案视觉淡化但保留 DOM 与按钮 aria 语义；淡化不改变格子几何
  const emptyCells = page.locator('.empty-cell')
  await expect(emptyCells).toHaveCount(3)
  await expect(page.locator('.gem-cell:not(.has-gem)').first()).toHaveAttribute('aria-label', /空位置，第\d+行第\d+列/)
  const emptyOpacity = await emptyCells.first().evaluate(element => getComputedStyle(element).opacity)
  expect(emptyOpacity).toBe('0.38')
  const cellSizes = await page.evaluate(() => {
    const empty = document.querySelector('.gem-cell:not(.has-gem)')!.getBoundingClientRect()
    const filled = document.querySelector('.gem-cell.has-gem')!.getBoundingClientRect()
    return { empty: { width: empty.width, height: empty.height }, filled: { width: filled.width, height: filled.height } }
  })
  // 网格轨道宽存在跨浏览器亚像素舍入（Firefox 实测差约 1.5e-5px），按容差比对
  expect(Math.abs(cellSizes.empty.width - cellSizes.filled.width)).toBeLessThan(0.5)
  expect(Math.abs(cellSizes.empty.height - cellSizes.filled.height)).toBeLessThan(0.5)

  // 聊天输入提示虚拟键盘回车键为「发送」
  await expect(page.locator('.chat-input input')).toHaveAttribute('enterkeyhint', 'send')

  // 外壳高度使用 100dvh（保留 100vh 回退行），计算高度与视口一致
  const shell = await page.evaluate(() => {
    const texts: string[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) texts.push(rule.cssText)
    }
    const all = texts.join('\n')
    const hasDvh = (selector: string) => new RegExp(`${selector}[^{]*\\{[^}]*100dvh`).test(all)
    return {
      bodyDvh: hasDvh('body'),
      appDvh: hasDvh('#app'),
      containerDvh: hasDvh('\\.game-container'),
      bodyMin: getComputedStyle(document.body).minHeight,
      appMin: getComputedStyle(document.getElementById('app')!).minHeight,
      containerMin: getComputedStyle(document.querySelector('.game-container')!).minHeight,
      innerHeight: window.innerHeight
    }
  })
  expect(shell.bodyDvh).toBe(true)
  expect(shell.appDvh).toBe(true)
  expect(shell.containerDvh).toBe(true)
  expect(shell.bodyMin).toBe(`${shell.innerHeight}px`)
  expect(shell.appMin).toBe(`${shell.innerHeight}px`)
  expect(shell.containerMin).toBe(`${shell.innerHeight}px`)
})

test('keeps responsive board cells and gem images square', async ({ page }) => {
  await openFixture(page, 'default')

  const geometry = await page.locator('.gem-cell.has-gem').evaluateAll(cells => cells.map(cell => {
    const image = cell.querySelector<HTMLImageElement>('.gem-image')
    if (!image) throw new Error('filled gem cell is missing its image')
    const cellBounds = cell.getBoundingClientRect()
    const imageBounds = image.getBoundingClientRect()
    return {
      cellWidth: cellBounds.width,
      cellHeight: cellBounds.height,
      imageWidth: imageBounds.width,
      imageHeight: imageBounds.height
    }
  }))

  expect(geometry).toHaveLength(25)
  for (const item of geometry) {
    expect(Math.abs(item.cellWidth - item.cellHeight)).toBeLessThan(0.5)
    expect(Math.abs(item.imageWidth - item.imageHeight)).toBeLessThan(0.5)
    expect(item.imageWidth).toBeLessThanOrEqual(item.cellWidth)
    expect(item.imageHeight).toBeLessThanOrEqual(item.cellHeight)
  }
})

// 嵌套圆角同心回归：内层圆角 = 外层圆角 - 外层边框 - 间距（默认场景贵族卡不可选：1px 边框 + 4px padding）
test('keeps nested rounded rectangles concentric', async ({ page }) => {
  await openFixture(page, 'default')
  const geometry = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`${selector} is missing`)
      const style = getComputedStyle(element)
      return {
        radius: Number.parseFloat(style.borderTopLeftRadius),
        border: Number.parseFloat(style.borderTopWidth),
        padding: Number.parseFloat(style.paddingLeft)
      }
    }
    return {
      gemGrid: read('.gem-grid'),
      gemCell: read('.gem-grid .gem-cell'),
      cardItem: read('.card-item'),
      cardImage: read('.card-item .card-image'),
      deckItem: read('.deck-item'),
      deckImage: read('.deck-item .deck-image'),
      nobleItem: read('.noble-item'),
      nobleImage: read('.noble-item .noble-image')
    }
  })
  const expectConcentric = (outer: { radius: number; border: number; padding: number }, inner: { radius: number }) => {
    expect(inner.radius).toBe(outer.radius - outer.border - outer.padding)
  }
  expect(geometry.gemGrid.radius).toBe(20)
  expectConcentric(geometry.gemGrid, geometry.gemCell)
  expectConcentric(geometry.cardItem, geometry.cardImage)
  expectConcentric(geometry.deckItem, geometry.deckImage)
  expectConcentric(geometry.nobleItem, geometry.nobleImage)
  expect(geometry.cardImage.radius).toBe(9)
  expect(geometry.deckImage.radius).toBe(9)
  expect(geometry.nobleImage.radius).toBe(9)
  expect(geometry.gemCell.radius).toBe(11)
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

test('keeps the local mobile summary globally pinned with colored bonuses', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-primary')
  await openFixture(page, 'default')
  const localSummary = page.locator('.player-details.is-local-player > .player-summary')
  const localDetails = page.locator('.player-details.is-local-player')
  const normalContentInset = await localDetails.evaluate(element => {
    const outer = element.getBoundingClientRect()
    const name = element.querySelector('.player-summary-name')!.getBoundingClientRect()
    return Math.round(name.left - outer.left)
  })
  const headerBottom = async () => page.evaluate(() =>
    Math.round(document.querySelector<HTMLElement>('.game-header')!.getBoundingClientRect().bottom))
  const pinnedHeaderBottom = await headerBottom()
  await page.locator('.player-summary-sticky-anchor').evaluate((anchor, headerHeight) => {
    window.scrollTo(0, window.scrollY + anchor.getBoundingClientRect().top - headerHeight + 100)
  }, pinnedHeaderBottom)
  await expect(localSummary).toHaveClass(/is-globally-stuck/)
  expect(await localSummary.evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(await headerBottom())
  expect(await localSummary.evaluate(element => getComputedStyle(element).borderLeft)).toBe('5px solid rgb(8, 127, 153)')
  expect(await localSummary.evaluate(element => getComputedStyle(element).borderTopLeftRadius)).toBe('0px')
  expect(await localSummary.evaluate(element => getComputedStyle(element).borderTopRightRadius)).toBe('0px')
  const stuckContentInset = await localSummary.evaluate(element => {
    const outer = element.getBoundingClientRect()
    const name = element.querySelector('.player-summary-name')!.getBoundingClientRect()
    return Math.round(name.left - outer.left)
  })
  expect(stuckContentInset).toBe(normalContentInset)
  await expect(localSummary).toHaveAttribute('aria-label', '展开本地玩家的详情')
  await expect(localSummary.locator('.player-summary-disclosure .ui-icon')).toHaveCount(1)
  await localSummary.click()
  await expect(localDetails).toHaveClass(/expanded/)
  await expect(localSummary).toHaveAttribute('aria-label', '收起本地玩家的详情')
  await expect(localSummary).not.toHaveClass(/is-globally-stuck/)
  const expandedDetailsPosition = await localDetails.evaluate(element => {
    const summary = element.querySelector<HTMLElement>('.player-summary')
    const card = element.querySelector<HTMLElement>('.player-card')
    if (!summary || !card) throw new Error('expanded player details are incomplete')
    return {
      detailsTop: Math.round(card.getBoundingClientRect().top),
      summaryBottom: Math.round(summary.getBoundingClientRect().bottom)
    }
  })
  expect(expandedDetailsPosition.detailsTop - expandedDetailsPosition.summaryBottom).toBe(0)
  await localSummary.click()
  await expect(localDetails).not.toHaveClass(/expanded/)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(localSummary).toHaveClass(/is-globally-stuck/)
  expect(await localSummary.evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(await headerBottom())
  const navigatedByBottomNav = await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('.mobile-game-nav button[aria-label="版图"]')
    button?.click()
    return Boolean(button)
  })
  expect(navigatedByBottomNav).toBe(true)
  await expect(page.locator('#game-board-section')).toBeInViewport()
  const navTargetGeometry = await page.evaluate(() => {
    const summary = document.querySelector<HTMLElement>('.player-summary.is-globally-stuck')
    const board = document.querySelector<HTMLElement>('#game-board-section')
    if (!summary || !board) throw new Error('sticky summary or board target is missing')
    return {
      summaryBottom: Math.round(summary.getBoundingClientRect().bottom),
      boardTop: Math.round(board.getBoundingClientRect().top)
    }
  })
  expect(navTargetGeometry.boardTop - navTargetGeometry.summaryBottom).toBeGreaterThanOrEqual(12)

  const bonuses = localSummary.locator('.player-summary-bonus')
  await expect(bonuses).toHaveCount(5)
  const colors = await bonuses.evaluateAll(elements => elements.map(element => ({
    color: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor,
    border: getComputedStyle(element).borderColor
  })))
  // bonus 文字色与边框色一致；白色加深为石板灰 #6c747d，黑色特例保持 #333333
  expect(colors.every(item => item.background === 'rgba(0, 0, 0, 0)')).toBe(true)
  expect(colors.map(item => item.border)).toEqual([
    'rgb(108, 116, 125)',
    'rgb(4, 86, 168)',
    'rgb(8, 165, 73)',
    'rgb(238, 0, 36)',
    'rgb(0, 0, 0)'
  ])
  expect(colors.map(item => item.color)).toEqual([
    'rgb(108, 116, 125)',
    'rgb(4, 86, 168)',
    'rgb(8, 165, 73)',
    'rgb(238, 0, 36)',
    'rgb(51, 51, 51)'
  ])
  expect(await localSummary.evaluate(element => getComputedStyle(element).overflow)).toBe('hidden')
  expect(await localDetails.evaluate(element => getComputedStyle(element).borderLeftColor)).toBe('rgb(8, 127, 153)')
  expect(await localDetails.evaluate(element => getComputedStyle(element).borderLeftWidth)).toBe('5px')
  const opponentSummary = page.locator('.player-details:not(.is-local-player) > .player-summary')
  expect(await opponentSummary.locator('..').evaluate(element => getComputedStyle(element).borderLeftColor)).toBe('rgb(201, 104, 8)')
  expect(await localSummary.locator('.player-summary-gem').first().evaluate(element => getComputedStyle(element).display)).toBe('flex')
  expect(await localSummary.locator('.player-summary-gems').evaluate(element => getComputedStyle(element).columnGap)).toBe('10px')
  const measuredGaps = await localSummary.locator('.player-summary-gems').evaluate(element => {
    const groups = [...element.querySelectorAll('.player-summary-gem')]
    const blueBonus = groups[1].querySelector('.player-summary-bonus').getBoundingClientRect()
    const blueTokens = groups[1].querySelectorAll('.player-summary-token')
    if (blueTokens.length < 2) throw new Error('fixture needs two blue tokens')
    const firstBlueToken = blueTokens[0].getBoundingClientRect()
    const secondBlueToken = blueTokens[1].getBoundingClientRect()
    const lastBlueToken = blueTokens[blueTokens.length - 1].getBoundingClientRect()
    const greenBonus = groups[2].querySelector('.player-summary-bonus').getBoundingClientRect()
    return {
      bonusToToken: Math.round(firstBlueToken.left - blueBonus.right),
      tokenToToken: Math.round(secondBlueToken.left - firstBlueToken.right),
      tokenToNextBonus: Math.round(greenBonus.left - lastBlueToken.right)
    }
  })
  expect(measuredGaps).toEqual({ bonusToToken: 3, tokenToToken: 3, tokenToNextBonus: 10 })

  // 特权/分数/皇冠/token 四组：图标与数字组内垂直居中，组间距 12px，token 总量含全部 14 枚
  const primaryGeometry = await localSummary.locator('.player-summary-primary').evaluate(element => {
    const groups = [...element.querySelectorAll<HTMLSpanElement>(':scope > span')]
    const firstIcon = groups[0].querySelector('.ui-icon')!.getBoundingClientRect()
    const firstNumber = groups[0].querySelector('b')!.getBoundingClientRect()
    return {
      count: groups.length,
      centerDelta: Math.abs((firstIcon.top + firstIcon.bottom) / 2 - (firstNumber.top + firstNumber.bottom) / 2),
      gaps: groups.slice(1).map((group, index) => Math.round(
        group.getBoundingClientRect().left - groups[index].getBoundingClientRect().right)),
      tokenLabel: groups[3]?.getAttribute('aria-label')
    }
  })
  expect(primaryGeometry.count).toBe(4)
  expect(primaryGeometry.centerDelta).toBeLessThanOrEqual(1)
  expect(primaryGeometry.gaps).toEqual([12, 12, 12])
  expect(primaryGeometry.tokenLabel).toBe('token 14/10')
})

test('removes the redundant turn frame inside expanded mobile player details', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-primary')
  // 展开详情并入外层容器：回合态只保留与摘要的 1px 分隔线，无描边、圆角与光环
  const expectFramelessActiveCard = async (details: Locator) => {
    await expect(details).toHaveClass(/expanded/)
    const activeCard = details.locator('.player-card.active-turn')
    await expect(activeCard).toBeVisible()
    const frame = await activeCard.evaluate(element => {
      const style = getComputedStyle(element)
      return {
        borderTop: style.borderTop,
        borderRightWidth: style.borderRightWidth,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftWidth: style.borderLeftWidth,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow
      }
    })
    expect(frame).toEqual({
      borderTop: '1px solid rgb(216, 208, 194)',
      borderRightWidth: '0px',
      borderBottomWidth: '0px',
      borderLeftWidth: '0px',
      borderRadius: '0px',
      boxShadow: 'none'
    })
  }

  await openFixture(page, 'default')
  const localDetails = page.locator('.player-details.is-local-player')
  await localDetails.locator('.player-summary').click()
  await expectFramelessActiveCard(localDetails)
  await localDetails.locator('.player-summary').click()
  await expect(localDetails).not.toHaveClass(/expanded/)

  await page.goto('/visual-fixture.html?scenario=default&turn=opponent')
  await expect(page.locator('html')).toHaveAttribute('data-visual-fixture-ready', 'default')
  const opponentDetails = page.locator('.player-details:not(.is-local-player)')
  await opponentDetails.locator('.player-summary').click()
  await expectFramelessActiveCard(opponentDetails)
})

test('keeps the bag disclosure compact and shows noble names only after selection', async ({ page }, testInfo) => {
  test.skip(!['desktop', 'mobile-primary'].includes(testInfo.project.name))
  await openFixture(page, 'default')
  if (testInfo.project.name === 'mobile-primary') {
    const statusDividers = await page.locator('.player-status').evaluate(element => {
      const title = element.querySelector<HTMLElement>('.section-heading h3')
      const heading = element.querySelector<HTMLElement>('.section-heading')
      return {
        title: title && getComputedStyle(title).borderBottomWidth,
        heading: heading && getComputedStyle(heading).borderBottomWidth
      }
    })
    expect(statusDividers).toEqual({ title: '0px', heading: '1px' })
  }
  const bag = page.locator('.bag-container')
  const refillBar = page.getByRole('region', { name: '确认补充版图' })
  if (testInfo.project.name === 'desktop') {
    await bag.hover()
    await expect(page.locator('.bag-tooltip')).toBeVisible()
    await expect(refillBar).toHaveCount(0)
    await bag.locator('.bag-pill').click()
  } else {
    await bag.locator('.bag-pill').tap()
  }
  await expect(page.locator('.bag-tooltip')).toBeVisible()
  await expect(refillBar).toBeVisible()
  const bagGeometry = await page.locator('.bag-tooltip').evaluate(element => {
    const box = element.getBoundingClientRect()
    const row = element.querySelector<HTMLElement>('.bag-row')
    if (!row) throw new Error('bag row is missing')
    return {
      width: Math.round(box.width),
      columns: getComputedStyle(row).gridTemplateColumns
    }
  })
  expect(bagGeometry).toEqual({ width: 210, columns: '56px 56px 56px' })
  if (testInfo.project.name === 'mobile-primary') {
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    await expect(page.locator('.bag-tooltip')).toHaveCount(0)
  }

  await openFixture(page, 'noble')
  await expect(page.locator('.noble-name')).toHaveCount(0)
  const nobleCards = page.locator('.noble-item')
  await expect(nobleCards).toHaveCount(4)
  if (testInfo.project.name === 'mobile-primary') {
    const mobileNobleGeometry = await page.locator('.nobles-row').evaluate(element => {
      const row = element.getBoundingClientRect()
      const cards = [...element.querySelectorAll<HTMLElement>('.noble-item')]
      const images = cards.map(card => card.querySelector<HTMLElement>('.noble-image')?.getBoundingClientRect())
      return {
        oneRow: new Set(cards.map(card => Math.round(card.getBoundingClientRect().top))).size === 1,
        right: Math.round(Math.max(...cards.map(card => card.getBoundingClientRect().right))),
        rowRight: Math.round(row.right),
        imageSizes: images.map(image => image && [Math.round(image.width), Math.round(image.height)]),
        imageInsets: cards.map((card, index) => Math.round((images[index]?.left ?? 0) - card.getBoundingClientRect().left)),
        imageRadii: cards.map(card => getComputedStyle(card.querySelector<HTMLElement>('.noble-image')!).borderRadius),
        frameGaps: cards.slice(1).map((card, index) => Math.round(card.getBoundingClientRect().left - cards[index].getBoundingClientRect().right))
      }
    })
    expect(mobileNobleGeometry.oneRow).toBe(true)
    expect(mobileNobleGeometry.right).toBeLessThanOrEqual(mobileNobleGeometry.rowRight)
    expect(mobileNobleGeometry.imageSizes).toEqual([[60, 90], [60, 90], [60, 90], [60, 90]])
    // selectable 态 2px 边框 + 3px 补偿 padding，图片 9px 圆角与外框同心（14 - 2 - 3 = 9）
    expect(mobileNobleGeometry.imageInsets).toEqual([5, 5, 5, 5])
    expect(mobileNobleGeometry.imageRadii).toEqual(['9px', '9px', '9px', '9px'])
    expect(mobileNobleGeometry.frameGaps).toEqual([6, 6, 6])
  }
  if (testInfo.project.name === 'desktop') {
    const desktopNobleGeometry = await page.locator('.nobles-row').evaluate(element => {
      const cards = [...element.querySelectorAll<HTMLElement>('.noble-item')]
      const images = cards.map(card => card.querySelector<HTMLElement>('.noble-image')?.getBoundingClientRect())
      return {
        imageSizes: images.map(image => image && [Math.round(image.width), Math.round(image.height)]),
        imageInsets: cards.map((card, index) => Math.round((images[index]?.left ?? 0) - card.getBoundingClientRect().left)),
        imageRadii: cards.map(card => getComputedStyle(card.querySelector<HTMLElement>('.noble-image')!).borderRadius)
      }
    })
    // 桌面端与移动端同心规则一致：selectable 态 2px 边框 + 3px padding，图片圆角 14 - 2 - 3 = 9px
    expect(desktopNobleGeometry.imageSizes).toEqual([[80, 120], [80, 120], [80, 120], [80, 120]])
    expect(desktopNobleGeometry.imageInsets).toEqual([5, 5, 5, 5])
    expect(desktopNobleGeometry.imageRadii).toEqual(['9px', '9px', '9px', '9px'])
  }
  const fourthNoble = nobleCards.nth(3)
  if (testInfo.project.name === 'mobile-primary') await fourthNoble.tap()
  else await fourthNoble.click()
  await expect(page.getByText('已选择：3分', { exact: true })).toBeVisible()
})

test('lets mobile history and chat scroll hand off to the page at their edges', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-primary')
  await openFixture(page, 'default')
  for (const [name, list] of [
    ['history', page.locator('.history-list')],
    ['chat', page.locator('.chat-messages')]
  ] as const) {
    if (name === 'chat') await page.locator('.chat-panel .mobile-panel-summary').click()
    expect(await list.evaluate(element => getComputedStyle(element).overscrollBehaviorY)).toBe('auto')
    await list.evaluate(element => {
      const filler = document.createElement('div')
      filler.style.height = `${element.clientHeight * 3}px`
      filler.setAttribute('aria-hidden', 'true')
      element.append(filler)
      element.scrollTop = element.scrollHeight
      const pageFiller = document.createElement('div')
      pageFiller.style.height = '1000px'
      pageFiller.setAttribute('aria-hidden', 'true')
      document.body.append(pageFiller)
    })
    await list.scrollIntoViewIfNeeded()
    const pageTopBefore = await page.evaluate(() => window.scrollY)
    await list.hover()
    await page.mouse.wheel(0, 480)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(pageTopBefore)
  }
})

for (const [scenario, role, message] of [
  ['pending', 'status', '等待服务器确认'],
  ['unknown', 'alert', '不会自动重发']
] as const) {
  test(`expresses ${scenario} request state with text and shape`, async ({ page }, testInfo) => {
    await openFixture(page, scenario)
    const banner = page.locator('.request-feedback-banner')
    await expect(banner).toHaveAttribute('role', role)
    await expect(banner).toContainText(message)
    await expect(banner.locator('.request-feedback-icon')).toHaveText(scenario === 'pending' ? '…' : '!')
    const bannerStyle = await banner.evaluate(element => ({
      borderWidth: getComputedStyle(element).borderTopWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))
    expect(Number.parseFloat(bannerStyle.borderWidth)).toBeGreaterThanOrEqual(1)
    expect(bannerStyle.overflow).toBe(0)
    await page.screenshot({ path: testInfo.outputPath(`${scenario}-request-state-actual.png`), fullPage: true, animations: 'disabled' })
  })
}

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

  test('opens spend-privilege from the always-visible board header pill', async ({ page }, testInfo) => {
    await openFixture(page, 'default')
    const pill = page.getByRole('button', { name: '花费特权指示物，当前持有2枚', exact: true })
    await expect(pill).toBeVisible()
    await expect(pill).toHaveAttribute('aria-disabled', 'false')
    const hitArea = await pill.evaluate(element => {
      const hit = getComputedStyle(element, '::before')
      return { width: Number.parseFloat(hit.width), height: Number.parseFloat(hit.height) }
    })
    expect(hitArea.width).toBeGreaterThanOrEqual(44)
    expect(hitArea.height).toBeGreaterThanOrEqual(44)
    if (testInfo.project.name.startsWith('mobile-')) {
      await pill.tap()
    } else {
      await pill.click()
    }
    const actionBar = page.getByRole('region', { name: '花费特权' })
    await expect(actionBar).toBeVisible()
    await expect(pill).toHaveAttribute('aria-disabled', 'true')
    const pageWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }))
    expect(pageWidth.scrollWidth).toBe(pageWidth.clientWidth)
    await page.screenshot({ path: testInfo.outputPath('privilege-pill-entry-actual.png'), fullPage: true, animations: 'disabled' })
  })

  test('keeps direct privilege interaction inside the primary mobile viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-primary')
    await openFixture(page, 'spend-privilege')
    await expect(page.locator('.dialog-content')).toBeHidden()
    const actionBar = page.getByRole('region', { name: '花费特权' })
    await expect(actionBar).toBeVisible()
    // 进入行动后版图头部入口同步锁定并呈选中态
    await expect(page.locator('.privilege-pill')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.locator('.privilege-pill')).toHaveClass(/selected/)
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
    if (testInfo.project.name === 'mobile-primary' && testInfo.project.use.browserName === 'chromium') {
      await expect(page).toHaveScreenshot('purchase-dialog.png', { fullPage: true })
    }
  })

  test('@mobile-dialog keeps the mandatory discard footer reachable', async ({ page }, testInfo) => {
    await openFixture(page, 'discard')
    await expect(page.locator('.dialog-header h3')).toHaveText('丢弃宝石')
    await expectResponsiveDialog(page)
    if (testInfo.project.name === 'mobile-primary' && testInfo.project.use.browserName === 'chromium') {
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

  for (const [scenario, region] of [
    ['extra-token', '选择额外 token'],
    ['steal-token', '从对手处窃取 token'],
    ['wildcard', '选择百搭颜色'],
    ['noble', '选择贵族']
  ] as const) {
    test(`keeps ${scenario} on real page elements without overflow`, async ({ page }, testInfo) => {
      await openFixture(page, scenario)
      await expect(page.locator('.dialog-content')).toBeHidden()
      const actionBar = page.getByRole('region', { name: region })
      await expect(actionBar).toBeVisible()
      if (scenario === 'steal-token') {
        // 窃取选择内嵌固定操作栏：对手持有全部 6 种可窃取颜色，移动端无需展开对手面板
        await expect(actionBar.locator('.steal-choices button')).toHaveCount(6)
      }
      const target = scenario === 'extra-token'
        ? page.locator('.gem-cell.selectable').first()
        : scenario === 'steal-token'
          ? actionBar.locator('.steal-choices button').first()
          : scenario === 'wildcard'
            ? page.locator('.inline-effect-choices button').first()
            : page.locator('.noble-item.selectable').first()
      await expect(target).toBeVisible()
      if (testInfo.project.name.startsWith('mobile-') && scenario !== 'steal-token') {
        // 固定底部操作栏会覆盖 minimal-scroll 落点：先滚动到视口中央并等滚动沉降，再 tap（贴合真实用户路径）
        await target.evaluate(element => element.scrollIntoView({ block: 'center' }))
        await settleScroll(page)
        await target.tap()
      } else if (testInfo.project.name.startsWith('mobile-')) {
        // 窃取 chips 位于固定操作栏内，始终在视口中，直接 tap
        await target.tap()
      } else {
        await target.click()
      }
      if (scenario === 'steal-token' && testInfo.project.name.startsWith('mobile-')) {
        // 回归：全流程对手详情保持折叠
        await expect(page.locator('.player-details').nth(1)).not.toHaveClass(/expanded/)
      }
      await expect(actionBar.getByRole('button', { name: '确认' })).toBeEnabled()
      const metrics = await target.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return { width: bounds.width, height: bounds.height, pageWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }
      })
      expect(metrics.width).toBeGreaterThanOrEqual(44)
      expect(metrics.height).toBeGreaterThanOrEqual(44)
      expect(metrics.pageWidth).toBe(metrics.viewportWidth)
      await page.screenshot({ path: testInfo.outputPath(`${scenario}-direct-actual.png`), fullPage: true, animations: 'disabled' })
    })
  }
})
