import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * 移动端触控、安全区与 Stage 70 抬手响应基线回归。
 * 断言真实浏览器计算值与按压几何行为，不断言 CSS 声明字符串。
 */

type Scenario = 'default' | 'take-gems' | 'noble'

const openFixture = async (page: Page, scenario: Scenario): Promise<void> => {
  await page.goto(`/visual-fixture.html?scenario=${scenario}`)
  await expect(page.locator('html')).toHaveAttribute('data-visual-fixture-ready', scenario)
}

/** 按住控件并读取按压中的实际状态与业务状态，松开后返回。 */
const holdPress = async (page: Page, locator: Locator, readActionState: () => Promise<unknown> = async () => undefined) => {
  await locator.evaluate(element => element.scrollIntoView({ block: 'center' }))
  // 字体/图片在 fixture ready 后才就绪，其加载与摘要吸附（position: fixed 跳变）会推动布局；
  // 按压前等待目标几何连续两帧稳定，否则按下后元素移出指针位置，Chromium 会取消 :active（偶发失败）
  await page.waitForFunction(() => document.fonts.status === 'loaded' && [...document.images].every(img => img.complete))
  await locator.evaluate(element => element.scrollIntoView({ block: 'center' }))
  await expect.poll(async () => {
    const first = await locator.boundingBox()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const second = await locator.boundingBox()
    return Math.abs((first?.y ?? 0) - (second?.y ?? 1)) + Math.abs((first?.x ?? 0) - (second?.x ?? 1))
  }, { timeout: 5000 }).toBe(0)
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
  const rest = await locator.evaluate(element => ({
    active: element.matches(':active'),
    transform: getComputedStyle(element).transform,
    filter: getComputedStyle(element).filter
  }))
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(260)
  const during = await locator.evaluate(element => ({
    active: element.matches(':active'),
    transform: getComputedStyle(element).transform,
    filter: getComputedStyle(element).filter
  }))
  const actionDuring = await readActionState()
  await page.mouse.up()
  return { rest, during, actionDuring }
}

test('serves the safe-area and keyboard-resize viewport meta on both entries', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-primary')
  for (const entry of ['/', '/visual-fixture.html?scenario=default']) {
    await page.goto(entry)
    const content = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(content).toContain('width=device-width')
    expect(content).toContain('initial-scale=1.0')
    expect(content).toContain('viewport-fit=cover')
    expect(content).toContain('interactive-widget=resizes-content')
  }
})

test('guards game controls against misselection while keeping text input selectable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-primary')
  await openFixture(page, 'default')

  const guardedSelectors = [
    '.gem-cell.has-gem',
    '.card-item',
    '.deck-item',
    '.noble-item',
    '.token-cell',
    '.bag-pill',
    '.player-summary',
    '.mobile-game-nav button',
    '.mobile-panel-summary',
    '.header-disclosure',
    '.metric-badge[role="button"]',
    '.reserved-card-item.clickable'
  ]
  const guards = await page.evaluate(selectors => selectors.map(selector => {
    const element = document.querySelector(selector)
    if (!element) return { selector, missing: true as const }
    const style = getComputedStyle(element)
    return { selector, touchAction: style.touchAction, userSelect: style.userSelect }
  }), guardedSelectors)
  for (const item of guards) {
    expect(item, `${item.selector} 应存在于 fixture`).not.toHaveProperty('missing')
    expect(item.touchAction, `${item.selector} touch-action`).toBe('manipulation')
    expect(item.userSelect, `${item.selector} user-select`).toBe('none')
  }

  const imageGuards = await page.evaluate(() => {
    const images = [...document.querySelectorAll<HTMLElement>('.game-container img')]
    return {
      count: images.length,
      draggable: images.every(image => getComputedStyle(image).webkitUserDrag === 'none')
    }
  })
  expect(imageGuards.count).toBeGreaterThan(10)
  expect(imageGuards.draggable).toBe(true)

  // 聊天面板展开后输入框必须保持可选择/可编辑，且不禁用双击缩放以外的浏览器行为
  await page.locator('.chat-panel .mobile-panel-summary').click()
  const chatInput = page.getByRole('textbox', { name: '聊天消息' })
  await expect(chatInput).toBeVisible()
  const inputStyle = await chatInput.evaluate(element => ({
    userSelect: getComputedStyle(element).userSelect,
    touchAction: getComputedStyle(element).touchAction
  }))
  expect(inputStyle.userSelect).not.toBe('none')
})

test.describe('release-only mobile interaction', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('does not style or activate controls until release', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-primary')

    await openFixture(page, 'take-gems')
    const gemCell = page.locator('.gem-cell.selectable').first()
    const gemPress = await holdPress(page, gemCell, () => gemCell.getAttribute('aria-pressed'))
    expect(gemPress.rest.active).toBe(false)
    expect(gemPress.during.active).toBe(true)
    expect(gemPress.during.transform).toBe('none')
    expect(gemPress.during.filter).toBe('none')
    expect(gemPress.actionDuring).toBe('false')
    await expect.poll(() => gemCell.evaluate(element => getComputedStyle(element).transform)).toBe('none')

    // 真实触摸 tap 在抬手时合成 click；重新载入以排除鼠标按压探针可能产生/取消 click 的差异。
    await openFixture(page, 'take-gems')
    const tappedGem = page.locator('[data-board-position="0-1"]')
    await tappedGem.tap()
    await expect(tappedGem).toHaveAttribute('aria-pressed', 'true')

    await openFixture(page, 'noble')
    const noblePress = await holdPress(page, page.locator('.noble-item.selectable').first())
    expect(noblePress.during.active).toBe(true)
    expect(noblePress.during.transform).toBe('none')
    expect(noblePress.during.filter).toBe('none')

    await openFixture(page, 'default')
    const navPress = await holdPress(page, page.locator('.mobile-game-nav button[aria-label="版图"]'))
    expect(navPress.during.active).toBe(true)
    expect(navPress.during.transform).toBe('none')
    expect(navPress.during.filter).toBe('none')
  })
})

test.describe('release-only mobile interaction with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('also stays visually unchanged while held', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-primary')

    await openFixture(page, 'take-gems')
    const gemPress = await holdPress(page, page.locator('.gem-cell.selectable').first())
    expect(gemPress.during.active).toBe(true)
    expect(gemPress.during.transform).toBe('none')
    expect(gemPress.during.filter).toBe('none')

    await openFixture(page, 'default')
    const summaryPress = await holdPress(page, page.locator('.player-summary').first())
    expect(summaryPress.during.active).toBe(true)
    expect(summaryPress.during.transform).toBe('none')
    expect(summaryPress.during.filter).toBe('none')
  })
})
