import { expect, test, type Page } from '@playwright/test'

/**
 * 阶段 60 软键盘、滚动行为与监听性能回归。
 * 全部断言读取真实浏览器的元素几何边界与 computed style，不断言 CSS 声明字符串。
 *
 * 软键盘仿真边界：headless Chromium 无法弹出真实软键盘，键盘几何以
 * Object.defineProperty 覆盖 visualViewport.height 并派发 resize 事件仿真，
 * 仅覆盖我们代码读取的几何量，不覆盖浏览器自身的键盘滚动/视口缩放行为。
 */

type Scenario = 'default'

const openFixture = async (page: Page, scenario: Scenario): Promise<void> => {
  await page.goto(`/visual-fixture.html?scenario=${scenario}`)
  await expect(page.locator('html')).toHaveAttribute('data-visual-fixture-ready', scenario)
}

const skipUnlessMobilePrimary = (projectName: string) => projectName !== 'mobile-primary'

const navState = (page: Page) => page.evaluate(() => {
  const nav = document.querySelector<HTMLElement>('.mobile-game-nav')!
  const cs = getComputedStyle(nav)
  return { display: cs.display, visibility: cs.visibility, transform: cs.transform, transitionDuration: cs.transitionDuration }
})

test('hides and restores the nav smoothly on chat focus without display none or layout shift', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openFixture(page, 'default')
  await page.locator('#game-chat-section .mobile-panel-summary').click()
  await page.waitForFunction(() => document.querySelector('.chat-input input'))

  const baseline = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollY: window.scrollY
  }))
  const initial = await navState(page)
  expect(initial.visibility).toBe('visible')
  // 平滑方案的前提：导航自带过渡而非瞬时切换
  expect(initial.transitionDuration).toContain('0.18s')

  // 聚焦（preventScroll 隔离浏览器自动滚入视野，只断言我们的避让机制不引入布局变化）
  const focusSamples = await page.evaluate(async () => {
    const nav = document.querySelector<HTMLElement>('.mobile-game-nav')!
    const input = document.querySelector<HTMLInputElement>('.chat-input input')!
    const displays = new Set<string>()
    let sampling = true
    const sample = () => { displays.add(getComputedStyle(nav).display); if (sampling) requestAnimationFrame(sample) }
    requestAnimationFrame(sample)
    input.focus({ preventScroll: true })
    await new Promise((resolve) => setTimeout(resolve, 400))
    sampling = false
    const cs = getComputedStyle(nav)
    return {
      displays: [...displays],
      settled: { visibility: cs.visibility, transform: cs.transform },
      scrollHeight: document.documentElement.scrollHeight,
      scrollY: window.scrollY
    }
  })
  // 整个隐藏过程 display 从未变成 none（固定导航保持渲染，transform 平滑移出）
  expect(focusSamples.displays).toEqual(['grid'])
  expect(focusSamples.settled.visibility).toBe('hidden')
  expect(focusSamples.settled.transform).not.toBe('none')
  // 无布局跳变：文档高度与滚动位置全程不变
  expect(focusSamples.scrollHeight).toBe(baseline.scrollHeight)
  expect(focusSamples.scrollY).toBe(baseline.scrollY)

  // 失焦后平滑恢复，键盘收起无残留状态
  const blurSamples = await page.evaluate(async () => {
    const nav = document.querySelector<HTMLElement>('.mobile-game-nav')!
    const input = document.querySelector<HTMLInputElement>('.chat-input input')!
    const displays = new Set<string>()
    let sampling = true
    const sample = () => { displays.add(getComputedStyle(nav).display); if (sampling) requestAnimationFrame(sample) }
    requestAnimationFrame(sample)
    input.blur()
    await new Promise((resolve) => setTimeout(resolve, 400))
    sampling = false
    const cs = getComputedStyle(nav)
    return {
      displays: [...displays],
      settled: { visibility: cs.visibility, transform: cs.transform },
      scrollHeight: document.documentElement.scrollHeight
    }
  })
  expect(blurSamples.displays).toEqual(['grid'])
  expect(blurSamples.settled.visibility).toBe('visible')
  expect(blurSamples.settled.transform).toBe('none')
  expect(blurSamples.scrollHeight).toBe(baseline.scrollHeight)

  // reduced-motion 下无过渡但仍保持渲染（不回到 display:none 瞬时卸载）
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openFixture(page, 'default')
  await page.locator('#game-chat-section .mobile-panel-summary').click()
  const reduced = await page.evaluate(async () => {
    const nav = document.querySelector<HTMLElement>('.mobile-game-nav')!
    const input = document.querySelector<HTMLInputElement>('.chat-input input')!
    input.focus({ preventScroll: true })
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const cs = getComputedStyle(nav)
    const hidden = { display: cs.display, visibility: cs.visibility, property: cs.transitionProperty, duration: cs.transitionDuration }
    input.blur()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const restored = { visibility: getComputedStyle(nav).visibility }
    return { hidden, restored }
  })
  // reduced-motion 覆盖生效：transition-property 归 none（隐藏/恢复即时，无位移过渡）；
  // 仿真下 Chromium 把 duration 全局钳到 1e-05s，不作为断言语义
  expect(reduced.hidden.property).toBe('none')
  expect(reduced.hidden.display).toBe('grid')
  expect(reduced.hidden.visibility).toBe('hidden')
  expect(reduced.restored.visibility).toBe('visible')
})

test('avoids the nav from simulated visual viewport keyboard geometry without focus', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  await openFixture(page, 'default')

  // 键盘打开（overlay 模式仿真：布局视口不变，visual 视口收缩 320px，未聚焦聊天输入框）
  await page.evaluate(() => {
    const vv = window.visualViewport!
    Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - 320 })
    vv.dispatchEvent(new Event('resize'))
  })
  await expect.poll(async () => (await navState(page)).visibility).toBe('hidden')
  const openState = await navState(page)
  expect(openState.display).toBe('grid')
  expect(openState.transform).not.toBe('none')

  // 键盘收起 → 恢复可见、无残留位移
  await page.evaluate(() => {
    const vv = window.visualViewport!
    Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight })
    vv.dispatchEvent(new Event('resize'))
  })
  await expect.poll(async () => (await navState(page)).visibility).toBe('visible')
  expect((await navState(page)).transform).toBe('none')

  // 小幅收缩（iOS 工具栏收放 80px）不判定为键盘
  await page.evaluate(() => {
    const vv = window.visualViewport!
    Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - 80 })
    vv.dispatchEvent(new Event('resize'))
  })
  await page.waitForTimeout(250)
  expect((await navState(page)).visibility).toBe('visible')
})

test('suppresses document overscroll while keeping inner list scroll chaining', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  await openFixture(page, 'default')

  const overscroll = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).overscrollBehaviorY,
    body: getComputedStyle(document.body).overscrollBehaviorY,
    chatMessages: getComputedStyle(document.querySelector<HTMLElement>('.chat-messages')!).overscrollBehaviorY,
    historyList: getComputedStyle(document.querySelector<HTMLElement>('.history-list')!).overscrollBehaviorY
  }))
  // html/body 抑制下拉刷新与越界滚动链；内层列表保持阶段 56 的滚动接力
  expect(overscroll.html).toBe('none')
  expect(overscroll.body).toBe('none')
  expect(overscroll.chatMessages).toBe('auto')
  expect(overscroll.historyList).toBe('auto')
})

test('measures stickiness once per frame instead of per scroll event', async ({ page }, testInfo) => {
  test.skip(skipUnlessMobilePrimary(testInfo.project.name))
  await openFixture(page, 'default')

  const result = await page.evaluate(async () => {
    const raf = () => new Promise((resolve) => requestAnimationFrame(resolve))
    const frames = () => raf().then(() => raf())
    const anchor = document.querySelector<HTMLElement>('.player-summary-sticky-anchor')!
    window.scrollTo(0, anchor.getBoundingClientRect().top + window.scrollY + 200)
    await frames()
    let calls = 0
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (...args) { calls += 1; return original.apply(this, args) }
    // 一帧内同步派发 30 个 scroll 事件
    for (let i = 0; i < 30; i += 1) window.dispatchEvent(new Event('scroll'))
    const syncCalls = calls
    await frames()
    Element.prototype.getBoundingClientRect = original
    const stuck = document.querySelector('.player-summary')?.classList.contains('is-globally-stuck') ?? null
    return { syncCalls, totalAfterFrame: calls, stuck }
  })

  // 事件处理零同步测量；整帧合并为一次批量测量（2-3 次，留宽限）
  expect(result.syncCalls).toBe(0)
  expect(result.totalAfterFrame).toBeLessThanOrEqual(6)
  // 吸附语义不变：滚动越过阈值后摘要保持吸附
  expect(result.stuck).toBe(true)
})
