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

test('moves the mobile notification container below the sticky header', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  await openFixture(page, 'default')

  const geometry = await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>('.notification-container')!
    const header = document.querySelector<HTMLElement>('.game-header')!
    return {
      top: container.getBoundingClientRect().top,
      headerBottom: header.getBoundingClientRect().bottom
    }
  })
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.headerBottom)
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
