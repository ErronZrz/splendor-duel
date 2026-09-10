import { expect, test, type Page } from '@playwright/test'

/**
 * 阶段 59 移动端定位遮挡与动态补偿回归。
 * 全部断言读取真实浏览器的元素几何边界与 computed style，不断言 CSS 声明字符串。
 */

type Scenario = 'default' | 'take-gems' | 'spend-privilege' | 'noble'

const openFixture = async (page: Page, scenario: Scenario, extra = ''): Promise<void> => {
  await page.goto(`/visual-fixture.html?scenario=${scenario}${extra}`)
  await expect(page.locator('html')).toHaveAttribute('data-visual-fixture-ready', scenario)
}

const skipUnlessMobilePrimary = (projectName: string) => projectName !== 'mobile-primary'

test('keeps the sticky summary attached to the actual header bottom in both header states', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  await openFixture(page, 'default')

  const result = await page.evaluate(async () => {
    const r1 = (v: number) => Math.round(v * 10) / 10
    const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const header = document.querySelector<HTMLElement>('.game-header')!
    const anchor = document.querySelector<HTMLElement>('.player-summary-sticky-anchor')!
    window.scrollTo(0, anchor.getBoundingClientRect().top + window.scrollY + 200)
    await frames()
    const read = () => {
      const stuck = document.querySelector<HTMLElement>('.player-summary.is-globally-stuck')
      return {
        stuckTop: stuck ? r1(stuck.getBoundingClientRect().top) : null,
        headerBottom: r1(header.getBoundingClientRect().bottom),
        cssVar: getComputedStyle(document.documentElement).getPropertyValue('--game-header-height').trim()
      }
    }
    const collapsed = read()
    document.querySelector<HTMLButtonElement>('.header-disclosure')!.click()
    await frames()
    await new Promise(resolve => setTimeout(resolve, 60))
    const expanded = read()
    document.querySelector<HTMLButtonElement>('.header-disclosure')!.click()
    await frames()
    window.scrollTo(0, 0)
    return { collapsed, expanded }
  })

  // 顶栏高度变量与实际一致；吸附摘要 top 精确贴顶栏底，展开（两行）时同步跟随不重叠
  expect(parseFloat(result.collapsed.cssVar)).toBeCloseTo(result.collapsed.headerBottom, 1)
  expect(result.collapsed.stuckTop).toBeCloseTo(result.collapsed.headerBottom, 1)
  expect(result.expanded.headerBottom).toBeGreaterThan(result.collapsed.headerBottom)
  expect(result.expanded.stuckTop).toBeCloseTo(result.expanded.headerBottom, 1)
  expect(parseFloat(result.expanded.cssVar)).toBeCloseTo(result.expanded.headerBottom, 1)
})

test('keeps one top row in both header states and exposes room actions when expanded', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  await openFixture(page, 'default')

  // 收起态顶行：连接状态 + Splendor Duel / 房间名两行文案 + 与玩家摘要同款的圆形展开按钮
  const disclosure = page.locator('.header-disclosure')
  await expect(page.locator('.status[role="status"]')).toBeVisible()
  await expect(page.locator('.room-info h2')).toHaveText('Splendor Duel')
  await expect(page.locator('.room-info p')).toHaveText('视觉基线房间')
  await expect(page.locator('.header-details')).toHaveCount(0)
  await expect(disclosure).toHaveAttribute('aria-label', '展开房间信息')
  const circle = await disclosure.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return { width: bounds.width, height: bounds.height, borderWidth: style.borderWidth, radius: style.borderRadius }
  })
  expect(circle.width).toBe(24)
  expect(circle.height).toBe(24)
  expect(circle.borderWidth).toBe('1px')
  expect(parseFloat(circle.radius)).toBeGreaterThanOrEqual(12)

  // 展开态：顶行保持不变，展开区含房间 ID（截断展示、一键复制完整 ID）、当前玩家、离开游戏
  await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-label', '收起房间信息')
  await expect(page.locator('.room-info h2')).toHaveText('Splendor Duel')
  await expect(page.locator('.header-details')).toBeVisible()
  await expect(page.locator('.header-room-id .room-id-short')).toHaveText('visual-fixture-room')
  await expect(page.locator('.header-room-id .room-id-full')).toBeHidden()
  await expect(page.locator('.header-room-id')).toHaveAttribute('title', 'visual-fixture-room')
  await expect(page.locator('.header-player-name')).toContainText('本地玩家')
  await expect(page.locator('.leave-button')).toBeVisible()

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.locator('.header-copy').click()
  await expect(page.locator('.header-copy')).toContainText('已复制')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('visual-fixture-room')

  await disclosure.click()
  await expect(page.locator('.header-details')).toHaveCount(0)
})

test('truncates a long room id without overflowing the expanded mobile header', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  const fullId = '6c8cad66-6d47-407f-bda4-530cd8e9ab12'
  await openFixture(page, 'default', `&roomid=${fullId}`)

  await page.locator('.header-disclosure').click()
  // 展示截断（前 19 字符 + ...），完整形态隐藏，title 与剪贴板仍为完整 ID
  await expect(page.locator('.header-room-id .room-id-short')).toHaveText('6c8cad66-6d47-407f-...')
  await expect(page.locator('.header-room-id .room-id-full')).toBeHidden()
  await expect(page.locator('.header-room-id')).toHaveAttribute('title', fullId)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.locator('.header-copy').click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(fullId)

  // 页面与展开区各行均无横向溢出
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    rows: [...document.querySelectorAll<HTMLElement>('.header-detail, .leave-button')].map(element => {
      const bounds = element.getBoundingClientRect()
      return { left: bounds.left, right: bounds.right }
    }),
    copyRight: document.querySelector('.header-copy')!.getBoundingClientRect().right
  }))
  expect(geometry.scrollWidth).toBe(geometry.clientWidth)
  for (const row of geometry.rows) {
    expect(row.left).toBeGreaterThanOrEqual(0)
    expect(row.right).toBeLessThanOrEqual(geometry.clientWidth + 0.5)
  }
  expect(geometry.copyRight).toBeLessThanOrEqual(geometry.clientWidth + 0.5)
})

test('shows the full room id untruncated in the expanded desktop header', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  const fullId = '6c8cad66-6d47-407f-bda4-530cd8e9ab12'
  await openFixture(page, 'default', `&roomid=${fullId}`)

  // 桌面端始终展示完整 ID，截断形态仅移动端可见
  await page.locator('.header-disclosure').click()
  await expect(page.locator('.header-room-id .room-id-full')).toHaveText(fullId)
  await expect(page.locator('.header-room-id .room-id-short')).toBeHidden()
  await expect(page.locator('.header-room-id')).toHaveAttribute('title', fullId)
})

test('navigates every mobile section below the actual header and stuck summary', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  await openFixture(page, 'default')

  // 非吸附：页面顶部附近依次触发五个导航按钮，目标均在顶栏之下
  const targets: ReadonlyArray<readonly [string, string]> = [
    ['玩家', 'game-player-section'],
    ['版图', 'game-board-section'],
    ['发展卡', 'game-development-section'],
    ['历史', 'game-history-section'],
    ['聊天', 'game-chat-section']
  ]
  for (const [label, id] of targets) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.locator(`.mobile-game-nav button[aria-label="${label}"]`).click()
    await expect.poll(async () => page.evaluate((sectionId) => {
      const section = document.getElementById(sectionId)!
      const header = document.querySelector<HTMLElement>('.game-header')!
      return Math.round((section.getBoundingClientRect().top - header.getBoundingClientRect().bottom) * 10) / 10
    }, id)).toBeGreaterThanOrEqual(8)
  }

  // 吸附态：摘要固定后点「版图」，目标落在吸附摘要之下
  await page.evaluate(async () => {
    const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const anchor = document.querySelector<HTMLElement>('.player-summary-sticky-anchor')!
    window.scrollTo(0, anchor.getBoundingClientRect().top + window.scrollY + 200)
    await frames()
  })
  await page.locator('.mobile-game-nav button[aria-label="版图"]').click()
  await expect.poll(async () => page.evaluate(() => {
    const section = document.getElementById('game-board-section')!
    const stuck = document.querySelector<HTMLElement>('.player-summary.is-globally-stuck')!
    return Math.round((section.getBoundingClientRect().top - stuck.getBoundingClientRect().bottom) * 10) / 10
  })).toBeGreaterThanOrEqual(8)
})

test('compensates the page bottom by the real action bar height without scroll jumps', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))

  for (const scenario of ['take-gems', 'spend-privilege', 'noble'] as const) {
    await openFixture(page, scenario)
    // 等全部图片加载完成，避免加载期 scroll anchoring 干扰跳动断言
    await page.waitForFunction(() => [...document.images].every(img => img.complete))
    const before = await page.evaluate(async () => {
      const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await frames()
      const bar = document.querySelector<HTMLElement>('.context-action-bar')!
      const main = document.querySelector<HTMLElement>('.game-main')!
      const nav = document.querySelector<HTMLElement>('.mobile-game-nav')!
      return {
        barHeight: bar.getBoundingClientRect().height,
        padding: parseFloat(getComputedStyle(main).paddingBottom),
        navVisibility: getComputedStyle(nav).visibility
      }
    })
    // padding == 操作栏实际高度 + 12px 间距；导航保持占位隐藏而非卸载
    expect(before.padding).toBeCloseTo(before.barHeight + 12, 0)
    expect(before.navVisibility).toBe('hidden')

    await page.evaluate(() => window.scrollTo(0, 800))
    // 等浏览器 scroll anchoring 收敛（scrollY 连续两次采样不变）
    await expect.poll(async () => {
      const first = await page.evaluate(() => window.scrollY)
      await page.waitForTimeout(80)
      const second = await page.evaluate(() => window.scrollY)
      return second - first
    }).toBe(0)
    // 记录视口内锚定内容位置，取消后不应跳动（浏览器 scroll anchoring 可能反向调整 scrollY）
    const anchorTop = async () => page.evaluate(() =>
      Math.round(document.getElementById('game-board-section')!.getBoundingClientRect().top * 10) / 10)
    const topBefore = await anchorTop()
    await page.locator('.context-actions .btn-secondary').first().click()
    await page.waitForTimeout(150)
    const after = await page.evaluate(async () => {
      const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await frames()
      const main = document.querySelector<HTMLElement>('.game-main')!
      const nav = document.querySelector<HTMLElement>('.mobile-game-nav')!
      return {
        padding: parseFloat(getComputedStyle(main).paddingBottom),
        navVisibility: getComputedStyle(nav).visibility
      }
    })
    const topAfter = await anchorTop()
    // 操作栏消失后回落到导航基线 84px，导航即时恢复可见，视口内容不跳变
    expect(after.padding).toBe(84)
    expect(after.navVisibility).toBe('visible')
    expect(Math.abs(topAfter - topBefore)).toBeLessThanOrEqual(2)
  }
})

test('stacks compact mobile notifications upward from the bottom edge', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  await openFixture(page, 'default')

  await page.locator('.player-details:not(.is-local-player) > .player-summary').click()
  await page.evaluate(() => {
    const opponentCard = document.querySelector<HTMLElement>('.player-details:not(.is-local-player) .reserved-card-item:not(.empty)')!
    opponentCard.click()
    opponentCard.click()
  })
  await expect(page.locator('.notification')).toHaveCount(2)

  const geometry = await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>('.notification-container')!
    const nav = document.querySelector<HTMLElement>('.mobile-game-nav')!
    const notifications = [...document.querySelectorAll<HTMLElement>('.notification')].map(item => {
      const bounds = item.getBoundingClientRect()
      return { top: bounds.top, bottom: bounds.bottom, height: bounds.height }
    })
    return {
      containerBottom: container.getBoundingClientRect().bottom,
      navTop: nav.getBoundingClientRect().top,
      flexDirection: getComputedStyle(container).flexDirection,
      borderRadius: getComputedStyle(notifications.length ? document.querySelector<HTMLElement>('.notification')! : container).borderRadius,
      viewportHeight: window.innerHeight,
      notifications
    }
  })
  expect(geometry.flexDirection).toBe('column-reverse')
  expect(geometry.containerBottom).toBeLessThanOrEqual(geometry.viewportHeight)
  expect(geometry.containerBottom).toBeLessThanOrEqual(geometry.navTop - 8)
  expect(parseFloat(geometry.borderRadius)).toBeGreaterThanOrEqual(12)
  expect(geometry.notifications).toHaveLength(2)
  expect(Math.max(...geometry.notifications.map(item => item.height))).toBeLessThanOrEqual(56)
  // DOM 中的第二条是后续消息；视觉上应出现在第一条上方。
  expect(geometry.notifications[1].bottom).toBeLessThan(geometry.notifications[0].top)
})

test('clamps the history preview tooltip inside the viewport on the tap path', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  await openFixture(page, 'default')

  const result = await page.evaluate(async () => {
    const r1 = (v: number) => Math.round(v * 10) / 10
    const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const list = document.querySelector<HTMLElement>('.history-list')!
    const appendLink = (text: string, align: string) => {
      const item = document.createElement('div')
      item.className = 'history-item'
      item.style.textAlign = align
      item.innerHTML = `<span class="action-text">测试<span class="hist-link" data-preview="/images/cards/a2.jpg" role="button" tabindex="0">${text}</span></span>`
      list.appendChild(item)
      return item.querySelector<HTMLElement>('[data-preview]')!
    }

    const rightLink = appendLink('右缘预览', 'right')
    rightLink.scrollIntoView({ block: 'center' })
    await frames()
    rightLink.click()
    await frames()
    const atRight = document.querySelector<HTMLElement>('.history-preview-tooltip')!.getBoundingClientRect()
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

    const bottomLink = appendLink('底缘预览', 'left')
    bottomLink.scrollIntoView({ block: 'end' })
    await frames()
    const linkRect = bottomLink.getBoundingClientRect()
    bottomLink.click()
    await frames()
    const atBottom = document.querySelector<HTMLElement>('.history-preview-tooltip')!.getBoundingClientRect()
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      atRight: { left: r1(atRight.left), right: r1(atRight.right), top: r1(atRight.top), bottom: r1(atRight.bottom) },
      linkBottom: r1(linkRect.bottom),
      atBottom: { top: r1(atBottom.top), bottom: r1(atBottom.bottom) }
    }
  })

  // 右缘链接：浮层右缘不超出视口（保留 12px 内距）
  expect(result.atRight.right).toBeLessThanOrEqual(result.vw - 12 + 1)
  expect(result.atRight.left).toBeGreaterThanOrEqual(12 - 1)
  // 底缘链接：浮层翻到链接上方且不超出视口底缘
  expect(result.atBottom.bottom).toBeLessThanOrEqual(result.vh - 12 + 1)
  expect(result.atBottom.bottom).toBeLessThanOrEqual(result.linkBottom + 1)
})

test('clamps the noble tooltip inside the viewport near screen edges', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  await openFixture(page, 'default', '&nobles=many')

  await page.locator('.player-details.is-local-player .player-summary').click()
  await page.locator('.player-details.is-local-player .crown-badge.has-nobles').click()
  const tooltip = page.locator('.noble-tooltip')
  await expect(tooltip).toBeVisible()

  const readOverflow = () => page.evaluate(() => {
    const rect = document.querySelector<HTMLElement>('.noble-tooltip')!.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      vw: window.innerWidth
    }
  })
  // 钳制在打开后的下一渲染帧生效，轮询至位移应用完成（右缘贴视口内 8px gutter）
  await expect.poll(async () => {
    const { right, vw } = await readOverflow()
    return vw - right
  }).toBeGreaterThanOrEqual(8 - 1)
  const initial = await readOverflow()
  expect(initial.left).toBeGreaterThanOrEqual(8 - 1)

  // 窗口尺寸变化后仍保持钳制
  await page.setViewportSize({ width: 360, height: 800 })
  await expect.poll(async () => {
    const { right, vw } = await readOverflow()
    return vw - right
  }).toBeGreaterThanOrEqual(8 - 1)
  const resized = await readOverflow()
  expect(resized.left).toBeGreaterThanOrEqual(8 - 1)
})
