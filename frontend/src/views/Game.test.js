import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import Game from './Game.vue'
import ActionDialog from '../components/ActionDialog.vue'
import ContextActionBar from '../components/ContextActionBar.vue'
import GemBoard from '../components/GemBoard.vue'
import PlayerStatusCard from '../components/PlayerStatusCard.vue'
import { useGameStore } from '../stores/game'

let wrapper
afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const makePlayer = (id, overrides = {}) => ({
  id,
  name: id === 'p1' ? '本地玩家' : '对手',
  gems: { white: 4, blue: 2, green: 1, gold: 1 },
  bonus: { white: 1 },
  reservedCards: [],
  developmentCards: [],
  privilegeTokens: 0,
  crowns: 0,
  nobles: [],
  points: 0,
  isHost: id === 'p1',
  lastActive: '2026-09-07T00:00:00Z',
  ...overrides,
})

const makeCard = (overrides = {}) => ({
  id: 'flow-card',
  code: 'flow-card',
  level: 1,
  color: 'blue',
  points: 0,
  crowns: 0,
  bonus: 'blue',
  cost: { white: 1 },
  effects: [],
  isSpecial: false,
  imagePath: '/images/cards/flow-card.jpg',
  ...overrides,
})

const makeGameState = (card, playerOverrides = {}, stateOverrides = {}) => ({
  status: 'playing',
  currentPlayerIndex: 0,
  turnNumber: 1,
  players: [makePlayer('p1', playerOverrides), makePlayer('p2')],
  gemBoard: [['white', 'blue', 'green'], ['white', 'pearl', 'blue']],
  gemBag: ['red'],
  availablePrivilegeTokens: 3,
  flippedCards: { 1: [card.id], 2: [], 3: [] },
  unflippedCards: {},
  level1Deck: [],
  level2Deck: [],
  level3Deck: [],
  cardDetails: { [card.id]: card },
  cardMap: { [card.id]: card },
  availableNobles: ['noble1', 'noble2'],
  extraTurns: {},
  cardToRefill: { level: 0, index: 0 },
  refilledThisTurn: false,
  needsGemDiscard: false,
  gemDiscardTarget: 10,
  gemDiscardPlayerID: '',
  createdAt: '2026-09-07T00:00:00Z',
  startedAt: '2026-09-07T00:00:00Z',
  ...stateOverrides,
})

const createGameFlowHarness = async ({ card = makeCard(), playerOverrides = {}, stateOverrides = {} } = {}) => {
  const pinia = createPinia()
  const store = useGameStore(pinia)
  store.currentPlayer = { id: 'p1', name: '本地玩家' }
  store.currentRoom = { id: 'flow-room', name: '流程房间' }
  store.gameState = makeGameState(card, playerOverrides, stateOverrides)
  vi.spyOn(store, 'connectWebSocket').mockImplementation(() => {})
  const sendAction = vi.spyOn(store, 'sendGameAction').mockImplementation(() => 'request-1')
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  await router.isReady()
  wrapper = mount(Game, { props: { roomId: 'flow-room' }, global: { plugins: [pinia, router] } })
  return { card, sendAction, store }
}

const actionDialog = () => wrapper.findComponent(ActionDialog)
const emitConfirm = async (data) => {
  actionDialog().vm.$emit('confirm', data)
  await flushPromises()
}

const emitCancel = async (data) => {
  actionDialog().vm.$emit('cancel', data)
  await flushPromises()
}

const openRefillFromBag = async () => {
  await wrapper.get('.bag-pill').trigger('click')
  await flushPromises()
}

it('passes a delayed server resource update into an already-open purchase', async () => {
  const pinia = createPinia()
  const store = useGameStore(pinia)
  const card = { id: 'a1', level: 1, cost: { white: 2 }, bonus: 'blue', color: 'blue', effects: [] }
  const player = { id: 'p1', name: 'Player', gems: { white: 1, gold: 1 }, bonus: {}, reservedCards: [], developmentCards: [] }
  store.currentPlayer = { id: 'p1', name: 'Player' }
  store.currentRoom = { id: 'test-room', name: 'Test' }
  store.gameState = {
    status: 'playing', currentPlayerIndex: 0,
    players: [player, { ...player, id: 'p2' }],
    flippedCards: { 1: ['a1'], 2: [], 3: [] },
    cardDetails: { a1: card }, unflippedCards: {}, gemBoard: [], availableNobles: [],
  }
  vi.spyOn(store, 'connectWebSocket').mockImplementation(() => {})
  const sendAction = vi.spyOn(store, 'sendGameAction').mockImplementation(() => {})
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  await router.isReady()
  wrapper = mount(Game, { props: { roomId: 'test-room' }, global: { plugins: [pinia, router] } })
  await wrapper.find('.card-item').trigger('click')
  await flushPromises()
  const dialog = wrapper.findComponent(ActionDialog)
  expect(dialog.props('visible')).toBe(true)
  expect(dialog.props('playerData').gems.white).toBe(1)

  store.gameState = {
    ...store.gameState,
    players: [{ ...player, gems: { white: 2, gold: 1 } }, store.gameState.players[1]],
  }
  await flushPromises()
  expect(dialog.props('playerData').gems.white).toBe(2)
  await dialog.find('.dialog-footer .btn-primary').trigger('click')
  expect(dialog.emitted('confirm')[0][0].paymentPlan).toEqual({ white: 2, gold: 0 })
  expect(sendAction).toHaveBeenCalledWith('buyCard', expect.objectContaining({
    cardId: 'a1', paymentPlan: { white: 2, gold: 0 },
  }))
})

it('renders player status cards with the local player first and preserves names', async () => {
  const pinia = createPinia()
  const store = useGameStore(pinia)
  const player = (id, name) => ({
    id, name, gems: {}, bonus: {}, reservedCards: [], developmentCards: [], privilegeTokens: 0,
    crowns: 0, nobles: [], points: 0, isHost: false, lastActive: ''
  })
  store.currentPlayer = { id: 'p2', name: '本地玩家' }
  store.currentRoom = { id: 'test-room', name: 'Test' }
  store.gameState = {
    status: 'playing', currentPlayerIndex: 0,
    players: [player('p1', '对手'), { ...player('p2', '本地玩家'), gems: { white: 2, blue: 1, gold: 1 } }],
    flippedCards: { 1: [], 2: [], 3: [] }, cardDetails: {}, unflippedCards: {}, gemBoard: [], availableNobles: []
  }
  store.gameHistory = [{
    playerId: 'p1', playerName: '对手', description: '购买了发展卡', timestamp: '2026-09-07T00:00:00Z',
    descriptionHtml: '<span class="hist-link" data-preview="/images/cards/a1.jpg">发展卡</span>'
  }]
  vi.spyOn(store, 'connectWebSocket').mockImplementation(() => {})
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  await router.isReady()
  wrapper = mount(Game, { props: { roomId: 'test-room' }, global: { plugins: [pinia, router] } })

  const cards = wrapper.findAllComponents(PlayerStatusCard)
  expect(cards.map(card => card.props('player').id)).toEqual(['p2', 'p1'])
  expect(cards.map(card => card.find('.player-name').text())).toEqual(['本地玩家', '对手'])
  const details = wrapper.findAll('.player-details')
  expect(details).toHaveLength(2)
  expect(details[0].classes()).not.toContain('expanded')
  expect(details[1].classes()).not.toContain('expanded')
  expect(details[0].find('.player-summary').text()).toContain('本地玩家')
  expect(details[0].find('.player-summary').text()).toContain('你')
  expect(details[0].find('.player-summary').attributes('aria-label')).toBe('展开本地玩家的详情')
  expect(details[0].find('.player-summary-disclosure .ui-icon').exists()).toBe(true)
  expect(details[1].find('.player-summary').text()).toContain('当前回合')
  const summaryGems = details[0].findAll('.player-summary-gem')
  expect(summaryGems).toHaveLength(7)
  expect(summaryGems.slice(-2).every(gem => !gem.find('.player-summary-bonus').exists())).toBe(true)
  // 摘要栏含 token 总量统计（2 白 + 1 蓝 + 1 金 = 4/10）
  const primaryGroups = details[0].findAll('.player-summary-primary > span')
  expect(primaryGroups).toHaveLength(4)
  expect(primaryGroups[3].attributes('aria-label')).toBe('token 4/10')
  expect(primaryGroups[3].text()).toContain('4/10')
  await details[1].find('.player-summary').trigger('click')
  expect(wrapper.findAll('.player-details')[1].classes()).toContain('expanded')
  expect(wrapper.findAll('.player-details')[1].find('.player-summary').attributes('aria-expanded')).toBe('true')
  expect(wrapper.findAll('.player-details')[1].find('.player-summary').attributes('aria-label')).toBe('收起对手的详情')

  const mobilePanels = wrapper.findAll('.mobile-collapsible-panel')
  expect(mobilePanels).toHaveLength(2)
  expect(mobilePanels.map(panel => panel.classes().includes('expanded'))).toEqual([true, false])
  expect(mobilePanels.map(panel => panel.find('.mobile-panel-summary').attributes('aria-expanded'))).toEqual(['true', 'false'])
  const scrollIntoView = vi.fn()
  const scrollBy = vi.fn()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  vi.stubGlobal('scrollBy', scrollBy)
  vi.spyOn(document, 'getElementById').mockReturnValue({ scrollIntoView, getBoundingClientRect: () => ({ top: 300, bottom: 316 }) })
  const mobileNav = wrapper.find('.mobile-game-nav')
  expect(mobileNav.findAll('button')).toHaveLength(5)
  expect(mobileNav.text()).toContain('对手回合')
  expect(mobileNav.findAll('button').map(button => button.attributes('aria-label'))).toEqual(['玩家', '版图', '发展卡', '历史', '聊天'])
  await mobileNav.findAll('button')[3].trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.mobile-collapsible-panel')[0].classes()).toContain('expanded')
  expect(wrapper.findAll('.mobile-collapsible-panel')[0].find('.mobile-panel-summary').attributes('aria-expanded')).toBe('true')
  // 移动端导航按顶栏实际高度动态补偿：jsdom 顶栏高 0、无吸附摘要，补偿落点为 0 + 12
  expect(scrollBy).toHaveBeenCalledWith({ top: 288, behavior: 'auto' })
  await wrapper.find('.chat-input input').trigger('focus')
  expect(wrapper.find('.chat-input input').attributes('aria-label')).toBe('聊天消息')
  expect(wrapper.find('.status').attributes('role')).toBe('status')
  expect(wrapper.find('.mobile-game-nav').classes()).toContain('keyboard-hidden')
  await wrapper.find('.chat-input input').trigger('blur')
  expect(wrapper.find('.mobile-game-nav').classes()).not.toContain('keyboard-hidden')
  const historyLink = wrapper.find('.hist-link')
  expect(historyLink.attributes('role')).toBe('button')
  expect(historyLink.attributes('aria-label')).toBe('查看发展卡图片预览')
  await historyLink.trigger('keydown', { key: 'Enter' })
  expect(wrapper.find('.history-preview-tooltip').attributes('role')).toBe('dialog')
  document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await flushPromises()
  expect(wrapper.find('.history-preview-tooltip').exists()).toBe(false)
  expect(wrapper.find('header.game-header').exists()).toBe(true)
  expect(wrapper.find('main.game-main').exists()).toBe(true)
  // 顶行两态一致：连接状态 + Splendor Duel / 房间名两行文案 + 展开按钮
  expect(wrapper.find('.room-info h2').text()).toBe('Splendor Duel')
  expect(wrapper.find('.room-info h2').attributes('aria-level')).toBe('1')
  expect(wrapper.find('.room-info p').text()).toBe('Test')
  expect(wrapper.find('.header-details').exists()).toBe(false)
  expect(wrapper.find('.header-disclosure').attributes('aria-expanded')).toBe('false')
  expect(wrapper.find('.header-disclosure').attributes('aria-label')).toBe('展开房间信息')
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  await wrapper.find('.header-disclosure').trigger('click')
  expect(wrapper.find('.header-disclosure').attributes('aria-label')).toBe('收起房间信息')
  // 展开区：房间 ID（桌面完整形态与移动端截断形态共存于 DOM，一键复制）、当前玩家、离开游戏
  expect(wrapper.find('.header-room-id .room-id-full').text()).toBe('test-room')
  expect(wrapper.find('.header-room-id .room-id-short').text()).toBe('test-room')
  expect(wrapper.find('.header-player-name').text()).toContain('本地玩家')
  expect(wrapper.find('.leave-button').exists()).toBe(true)
  await wrapper.find('.header-copy').trigger('click')
  await flushPromises()
  expect(writeText).toHaveBeenCalledWith('test-room')
  expect(wrapper.find('.header-copy').text()).toContain('已复制')

  const chatInput = wrapper.find('.chat-input input')
  chatInput.element.focus()
  store.gameState = {
    ...store.gameState,
    status: 'finished',
    winner: 'p2',
    victoryReasons: ['达到20分']
  }
  await flushPromises()
  const victory = wrapper.find('.victory-dialog')
  expect(victory.attributes('role')).toBe('dialog')
  expect(victory.attributes('aria-modal')).toBe('true')
  expect(wrapper.find('main.game-main').attributes('inert')).toBe('true')
  await victory.trigger('keydown', { key: 'Tab' })
  await wrapper.find('.victory-footer button').trigger('click')
  await flushPromises()
  expect(wrapper.find('.victory-dialog').exists()).toBe(false)
})

describe('stage 60 mobile keyboard avoidance and stickiness throttling', () => {
  it('hides the nav from visual viewport keyboard geometry and keeps it hidden until the keyboard closes', async () => {
    const visualViewport = new EventTarget()
    visualViewport.height = window.innerHeight
    visualViewport.offsetTop = 0
    vi.stubGlobal('visualViewport', visualViewport)
    await createGameFlowHarness()

    const nav = wrapper.find('.mobile-game-nav')
    expect(nav.classes()).not.toContain('keyboard-hidden')

    // 键盘打开（overlay 模式：布局视口不变，visual 视口收缩超过阈值）→ 未聚焦也隐藏
    visualViewport.height = window.innerHeight - 320
    visualViewport.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(nav.classes()).toContain('keyboard-hidden')

    // 聚焦再失焦：键盘仍开着，导航保持隐藏不闪现
    await wrapper.find('.chat-input input').trigger('focus')
    await wrapper.find('.chat-input input').trigger('blur')
    await flushPromises()
    expect(nav.classes()).toContain('keyboard-hidden')

    // 键盘实际收起后才恢复
    visualViewport.height = window.innerHeight
    visualViewport.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(nav.classes()).not.toContain('keyboard-hidden')

    // 小幅收缩（工具栏收放）不判定为键盘
    visualViewport.height = window.innerHeight - 80
    visualViewport.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(nav.classes()).not.toContain('keyboard-hidden')
  })

  it('throttles stickiness measurement into a single frame batch instead of measuring per scroll event', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    await createGameFlowHarness()
    await flushPromises()
    // 等挂载时 nextTick 的初始测量完成
    await new Promise((resolve) => setTimeout(resolve, 60))

    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    rectSpy.mockClear()
    // 一帧内同步派发多个 scroll 事件：监听器只安排 rAF，不得同步测量
    for (let i = 0; i < 5; i += 1) window.dispatchEvent(new Event('scroll'))
    expect(rectSpy).not.toHaveBeenCalled()

    // 帧末批处理一次：多次事件合并为单次测量（2-3 次 gBCR，留宽限）
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(rectSpy.mock.calls.length).toBeGreaterThan(0)
    expect(rectSpy.mock.calls.length).toBeLessThanOrEqual(6)
  })
})

describe('stage 62 detail polish', () => {
  it('hints the virtual keyboard enter key as send on the chat input', async () => {
    await createGameFlowHarness()
    const input = wrapper.find('.chat-input input')
    expect(input.attributes('aria-label')).toBe('聊天消息')
    expect(input.attributes('enterkeyhint')).toBe('send')
  })

  it('keeps the waiting area free of debug details', async () => {
    await createGameFlowHarness({ stateOverrides: { status: 'waiting' } })
    expect(wrapper.find('.waiting-area').exists()).toBe(true)
    expect(wrapper.find('.waiting-area h3').text()).toBe('等待其他玩家加入...')
    expect(wrapper.find('.debug-info').exists()).toBe(false)
    expect(wrapper.find('.waiting-area').text()).not.toContain('调试信息')
    expect(wrapper.find('.players-list').exists()).toBe(true)
  })
})

describe('existing game action orchestration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const openPurchase = async () => {
    await wrapper.find('.card-item').trigger('click')
    await flushPromises()
    expect(actionDialog().props('actionType')).toBe('buyCard')
  }

  const reserveBoard = [
    ['white', 'blue', 'green'],
    ['red', 'pearl', 'gold']
  ]

  const openReserve = async () => {
    await wrapper.get('[data-board-position="1-2"]').trigger('click')
    await flushPromises()
    expect(actionDialog().props('visible')).toBe(false)
    expect(wrapper.findComponent(ContextActionBar).props('mode')).toBe('reserve-card')
  }

  it('keeps the extra-token selection shape and sends one final buyCard payload', async () => {
    const { card, sendAction } = await createGameFlowHarness({
      card: makeCard({ effects: ['extra_token'] }),
    })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: card, paymentPlan: { white: 1, gold: 0 } })
    expect(actionDialog().props('visible')).toBe(false)
    expect(wrapper.findComponent(ContextActionBar).props('mode')).toBe('extra-token')

    await emitConfirm({ actionType: 'takeExtraToken', selectedGems: [{ x: 2, y: 1, type: 'blue' }] })
    expect(sendAction).toHaveBeenCalledTimes(1)
    expect(sendAction).toHaveBeenCalledWith('buyCard', {
      cardId: 'flow-card',
      paymentPlan: { white: 1, gold: 0 },
      effects: { extraToken: { selectedGem: { x: 2, y: 1 } } },
    })
  })

  it('preserves the explicit skipped shape for extra-token and steal effects', async () => {
    const extra = await createGameFlowHarness({ card: makeCard({ effects: ['extra_token'] }) })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: extra.card, paymentPlan: { white: 1 } })
    await emitConfirm({ actionType: 'takeExtraToken', selectedGems: [] })
    expect(extra.sendAction).toHaveBeenCalledWith('buyCard', {
      cardId: 'flow-card', paymentPlan: { white: 1 }, effects: { extraToken: { skipped: true } },
    })

    wrapper.unmount()
    wrapper = undefined
    const steal = await createGameFlowHarness({ card: makeCard({ effects: ['steal'] }) })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: steal.card, paymentPlan: { white: 1 } })
    expect(wrapper.findComponent(ContextActionBar).props('mode')).toBe('steal-token')
    await emitConfirm({ actionType: 'stealToken', stealGemType: null })
    expect(steal.sendAction).toHaveBeenCalledWith('buyCard', {
      cardId: 'flow-card', paymentPlan: { white: 1 }, effects: { steal: { skipped: true } },
    })
  })

  it('keeps wildcard selection asynchronous and preserves its field name in the buy payload', async () => {
    const { card, sendAction } = await createGameFlowHarness({ card: makeCard({ effects: ['wildcard'] }) })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: card, paymentPlan: { white: 1 } })
    expect(wrapper.findComponent(ContextActionBar).props('mode')).toBe('wildcard')
    expect(wrapper.get('.inline-effect-choices').exists()).toBe(true)
    await emitConfirm({ actionType: 'chooseWildcardColor', wildcardColor: 'white' })
    expect(sendAction).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(sendAction).toHaveBeenCalledWith('buyCard', {
      cardId: 'flow-card', paymentPlan: { white: 1 }, effects: { wildcard: { color: 'white' } },
    })
  })

  it('keeps noble selection and the noble1 steal-and-cancel return path intact', async () => {
    const { card, sendAction } = await createGameFlowHarness({ card: makeCard({ crowns: 3 }) })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: card, paymentPlan: { white: 1 } })
    expect(wrapper.findComponent(ContextActionBar).props('mode')).toBe('noble')

    await emitConfirm({ actionType: 'chooseNoble', nobleId: 'noble1' })
    expect(wrapper.findComponent(ContextActionBar).props('mode')).toBe('steal-token')
    await emitCancel()
    expect(wrapper.findComponent(ContextActionBar).props('mode')).toBe('noble')

    await emitConfirm({ actionType: 'chooseNoble', nobleId: 'noble2' })
    expect(sendAction).toHaveBeenCalledTimes(1)
    expect(sendAction).toHaveBeenCalledWith('buyCard', {
      cardId: 'flow-card', paymentPlan: { white: 1 }, effects: { noble: { id: 'noble2' } },
    })
  })

  it('keeps noble1 followed by steal as one final buyCard action', async () => {
    const { card, sendAction } = await createGameFlowHarness({ card: makeCard({ crowns: 3 }) })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: card, paymentPlan: { white: 1 } })
    await emitConfirm({ actionType: 'chooseNoble', nobleId: 'noble1' })
    await emitConfirm({ actionType: 'stealToken', stealGemType: 'green' })

    expect(sendAction).toHaveBeenCalledTimes(1)
    expect(sendAction).toHaveBeenCalledWith('buyCard', {
      cardId: 'flow-card',
      paymentPlan: { white: 1 },
      effects: { noble: { id: 'noble1' }, steal: { gemType: 'green' } },
    })
  })

  it('locks the existing extra-token priority when a card exposes multiple effects', async () => {
    const { card, sendAction } = await createGameFlowHarness({
      card: makeCard({ effects: ['extra_token', 'steal', 'wildcard'] }),
    })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: card, paymentPlan: { white: 1 } })
    expect(wrapper.findComponent(ContextActionBar).props('mode')).toBe('extra-token')
    await emitConfirm({ actionType: 'takeExtraToken', selectedGems: [{ x: 0, y: 1, type: 'blue' }] })

    expect(sendAction).toHaveBeenCalledTimes(1)
    expect(sendAction).toHaveBeenCalledWith('buyCard', {
      cardId: 'flow-card',
      paymentPlan: { white: 1 },
      effects: { extraToken: { selectedGem: { x: 0, y: 1 } } },
    })
  })

  it('completes extra token through the real board and the inline action bar', async () => {
    const { card, sendAction } = await createGameFlowHarness({ card: makeCard({ effects: ['extra_token'] }) })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: card, paymentPlan: { white: 1 } })
    await wrapper.get('[data-board-position="0-1"]').trigger('click')
    const bar = wrapper.findComponent(ContextActionBar)
    expect(bar.props('confirmDisabled')).toBe(false)
    await bar.get('.btn-primary').trigger('click')
    expect(sendAction).toHaveBeenCalledTimes(1)
    expect(sendAction).toHaveBeenCalledWith('buyCard', expect.objectContaining({ effects: { extraToken: { selectedGem: { x: 0, y: 1 } } } }))
  })

  it('completes steal through the opponent real token display', async () => {
    const { card, sendAction } = await createGameFlowHarness({ card: makeCard({ effects: ['steal'] }) })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: card, paymentPlan: { white: 1 } })
    const opponent = wrapper.findAllComponents(PlayerStatusCard).find(item => item.props('player').id === 'p2')
    await opponent.get('.token-cell.selectable').trigger('keydown', { key: 'Enter' })
    await opponent.get('.token-cell.selectable').trigger('click')
    await wrapper.findComponent(ContextActionBar).get('.btn-primary').trigger('click')
    expect(sendAction).toHaveBeenCalledTimes(1)
    expect(sendAction).toHaveBeenCalledWith('buyCard', expect.objectContaining({ effects: { steal: { gemType: 'white' } } }))
  })

  it('completes wildcard and noble from their existing inline page regions', async () => {
    let flow = await createGameFlowHarness({ card: makeCard({ effects: ['wildcard'] }) })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: flow.card, paymentPlan: { white: 1 } })
    await wrapper.get('.inline-effect-choices button').trigger('click')
    await wrapper.findComponent(ContextActionBar).get('.btn-primary').trigger('click')
    await vi.runAllTimersAsync()
    expect(flow.sendAction).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    wrapper = undefined
    flow = await createGameFlowHarness({ card: makeCard({ crowns: 3 }) })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: flow.card, paymentPlan: { white: 1 } })
    expect(wrapper.findAll('.noble-name')).toHaveLength(0)
    await wrapper.get('.noble-item.selectable:nth-child(2)').trigger('keydown', { key: ' ' })
    expect(wrapper.findComponent(ContextActionBar).props('selectionLabel')).toBe('2分+新回合')
    expect(wrapper.findComponent(ContextActionBar).text()).toContain('已选择：2分+新回合')
    expect(wrapper.findComponent(ContextActionBar).text()).not.toContain('noble2')
    await wrapper.findComponent(ContextActionBar).get('.btn-primary').trigger('click')
    expect(flow.sendAction).toHaveBeenCalledTimes(1)
    expect(flow.sendAction).toHaveBeenCalledWith('buyCard', expect.objectContaining({ effects: { noble: { id: 'noble2' } } }))
  })

  it('only exposes explicit effect skipping when authority has no legal target', async () => {
    const { card, sendAction } = await createGameFlowHarness({ card: makeCard({ effects: ['extra_token'] }), stateOverrides: { gemBoard: [['white', 'gold']] } })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: card, paymentPlan: { white: 1 } })
    const bar = wrapper.findComponent(ContextActionBar)
    expect(bar.findAll('.context-actions button').map(button => button.text())).toContain('明确跳过')
    await bar.findAll('.context-actions button').find(button => button.text() === '明确跳过').trigger('click')
    expect(sendAction).toHaveBeenCalledWith('buyCard', expect.objectContaining({ effects: { extraToken: { skipped: true } } }))
  })

  it.each([
    {
      gemBoard: [
        ['white', 'white', 'white', 'blue', 'gold'],
        ['blue', 'green', 'red', 'black', 'white'],
        ['green', 'red', 'black', 'white', 'blue'],
        ['red', 'black', 'white', 'blue', 'green'],
        ['black', 'white', 'blue', 'green', 'red']
      ],
      positions: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }]
    },
    {
      gemBoard: [
        ['pearl', 'pearl', 'white', 'blue', 'gold'],
        ['blue', 'green', 'red', 'black', 'white'],
        ['green', 'red', 'black', 'white', 'blue'],
        ['red', 'black', 'white', 'blue', 'green'],
        ['black', 'white', 'blue', 'green', 'red']
      ],
      positions: [{ x: 0, y: 0 }, { x: 0, y: 1 }]
    }
  ])('selects on the real board and sends grantOpponentPrivilege before takeGems', async ({ gemBoard, positions }) => {
    const { sendAction } = await createGameFlowHarness({ stateOverrides: { gemBoard } })
    for (const position of positions) {
      await wrapper.get(`[data-board-position="${position.x}-${position.y}"]`).trigger('click')
      await flushPromises()
    }

    expect(actionDialog().props('visible')).toBe(false)
    const bar = wrapper.findComponent(ContextActionBar)
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('对手将获得特权')
    await bar.get('.context-actions .btn-primary').trigger('click')

    expect(sendAction.mock.calls).toEqual([
      ['grantOpponentPrivilege', {}],
      ['takeGems', { gemPositions: positions }]
    ])
  })

  it('changes the privilege target, clears selection and submits exact coordinates from the real board', async () => {
    const gemBoard = [
      ['white', 'blue', 'green', 'red', 'gold'],
      ['pearl', 'green', 'red', 'black', 'white'],
      ['green', 'red', 'black', 'white', 'blue'],
      ['red', 'black', 'white', 'blue', 'green'],
      ['black', 'white', 'blue', 'green', 'red']
    ]
    const { sendAction } = await createGameFlowHarness({
      playerOverrides: { privilegeTokens: 2 },
      stateOverrides: { gemBoard }
    })
    await wrapper.findComponent(PlayerStatusCard).get('.privilege-badge').trigger('click')
    await flushPromises()
    expect(actionDialog().props('visible')).toBe(false)

    let bar = wrapper.findComponent(ContextActionBar)
    expect(bar.props('mode')).toBe('spend-privilege')
    await wrapper.get('[data-board-position="0-0"]').trigger('click')
    await bar.findAll('.privilege-count button')[1].trigger('click')
    await flushPromises()
    bar = wrapper.findComponent(ContextActionBar)
    expect(bar.props('selectedGems')).toEqual([])

    await wrapper.get('[data-board-position="0-0"]').trigger('click')
    await wrapper.get('[data-board-position="1-1"]').trigger('click')
    await bar.get('.context-actions .btn-primary').trigger('click')
    expect(sendAction).toHaveBeenCalledWith('spendPrivilege', {
      privilegeCount: 2,
      gemPositions: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    })
  })

  it.each([1, 2, 3])('reserves a level %s market card with exact card and gold coordinates', async level => {
    const card = makeCard({ id: `level-${level}-card`, code: `level-${level}-card`, level })
    const flippedCards = { 1: [], 2: [], 3: [], [level]: [card.id] }
    const { sendAction } = await createGameFlowHarness({
      card,
      stateOverrides: {
        gemBoard: reserveBoard,
        flippedCards,
        cardDetails: { [card.id]: card },
        cardMap: { [card.id]: card }
      }
    })
    await openReserve()

    const marketCard = wrapper.get(`[data-market-card-id="${card.id}"]`)
    await marketCard.trigger('click')
    expect(marketCard.attributes('aria-pressed')).toBe('true')
    let bar = wrapper.findComponent(ContextActionBar)
    expect(bar.text()).toContain(`场上卡 ${card.id} (0分)（等级 ${level}）`)

    await marketCard.trigger('click')
    bar = wrapper.findComponent(ContextActionBar)
    expect(bar.props('reserveTarget')).toBeNull()
    await marketCard.trigger('keydown', { key: 'Enter' })
    await bar.get('.context-actions .btn-secondary:nth-child(2)').trigger('click')
    expect(wrapper.findComponent(ContextActionBar).props('reserveTarget')).toBeNull()

    await marketCard.trigger('click')
    await wrapper.findComponent(ContextActionBar).get('.context-actions .btn-primary').trigger('click')
    expect(sendAction).toHaveBeenCalledWith('reserveCard', {
      cardId: card.id,
      goldX: 1,
      goldY: 2
    })
  })

  it.each([1, 2, 3])('reserves from the level %s deck and cancels the same deck target', async level => {
    const card = makeCard()
    const levelDecks = {
      level1Deck: level === 1 ? ['hidden-1'] : [],
      level2Deck: level === 2 ? ['hidden-2'] : [],
      level3Deck: level === 3 ? ['hidden-3'] : []
    }
    const { sendAction } = await createGameFlowHarness({
      card,
      stateOverrides: {
        gemBoard: reserveBoard,
        unflippedCards: { 1: level === 1 ? 1 : 0, 2: level === 2 ? 1 : 0, 3: level === 3 ? 1 : 0 },
        ...levelDecks
      }
    })
    await openReserve()

    const deck = wrapper.get(`[data-deck-level="${level}"]`)
    await deck.trigger('click')
    expect(deck.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findComponent(ContextActionBar).text()).toContain(`等级 ${level} 牌堆`)
    await deck.trigger('click')
    expect(wrapper.findComponent(ContextActionBar).props('reserveTarget')).toBeNull()
    await deck.trigger('keydown', { key: ' ' })
    await wrapper.findComponent(ContextActionBar).get('.context-actions .btn-primary').trigger('click')

    expect(sendAction).toHaveBeenCalledWith('reserveCard', {
      cardId: `deck_level_${level}`,
      goldX: 1,
      goldY: 2
    })
  })

  it('cancels reserve from the selected gold and rejects missing gold or a full reserve', async () => {
    await createGameFlowHarness({ stateOverrides: { gemBoard: reserveBoard } })
    await openReserve()
    const gold = wrapper.get('[data-board-position="1-2"]')
    expect(gold.attributes('aria-pressed')).toBe('true')
    await gold.trigger('click')
    expect(wrapper.findComponent(ContextActionBar).exists()).toBe(false)

    wrapper.unmount()
    wrapper = undefined
    await createGameFlowHarness({ stateOverrides: { gemBoard: [['white', 'blue']] } })
    expect(wrapper.find('[aria-label^="选择黄金"]').exists()).toBe(false)

    wrapper.unmount()
    wrapper = undefined
    await createGameFlowHarness({
      playerOverrides: { reservedCards: ['a', 'b', 'c'] },
      stateOverrides: { gemBoard: reserveBoard }
    })
    await wrapper.get('[data-board-position="1-2"]').trigger('click')
    expect(wrapper.findComponent(ContextActionBar).exists()).toBe(false)
    expect(document.body.textContent).toContain('已经保留 3 张发展卡')
  })

  it('confirms refill inline with its warning and exact empty payload, then blocks a repeat', async () => {
    const { sendAction } = await createGameFlowHarness()
    const bag = wrapper.get('.bag-pill')
    await openRefillFromBag()
    let bar = wrapper.findComponent(ContextActionBar)
    expect(actionDialog().props('visible')).toBe(false)
    expect(wrapper.find('.bag-tooltip').exists()).toBe(true)
    expect(bar.props('mode')).toBe('refill-confirm')
    expect(bar.text()).toContain('对手获得特权')
    await bar.get('.context-actions .btn-primary').trigger('click')
    expect(sendAction).toHaveBeenCalledTimes(1)
    expect(sendAction).toHaveBeenCalledWith('refillBoard', {})

    await bag.trigger('click')
    expect(sendAction).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(ContextActionBar).exists()).toBe(false)
  })

  it('does not open refill confirmation for an empty bag', async () => {
    await createGameFlowHarness({ stateOverrides: { gemBag: [] } })
    await openRefillFromBag()
    expect(wrapper.findComponent(ContextActionBar).exists()).toBe(false)
    expect(document.body.textContent).toContain('袋子为空')
  })

  it('revalidates the selected gold and market card against the latest authority state', async () => {
    const card = makeCard()
    const { sendAction, store } = await createGameFlowHarness({ stateOverrides: { gemBoard: reserveBoard } })
    await openReserve()
    await wrapper.get(`[data-market-card-id="${card.id}"]`).trigger('click')

    store.gameState = {
      ...store.gameState,
      gemBoard: [['white', 'blue', 'green'], ['red', 'pearl', '']]
    }
    await flushPromises()
    await wrapper.findComponent(ContextActionBar).get('.context-actions .btn-primary').trigger('click')
    expect(sendAction).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('所选黄金已不在版图上')
  })

  it('revalidates market, deck and bag availability immediately before confirmation', async () => {
    const card = makeCard()
    const market = await createGameFlowHarness({ stateOverrides: { gemBoard: reserveBoard } })
    await openReserve()
    await wrapper.get(`[data-market-card-id="${card.id}"]`).trigger('click')
    market.store.gameState = {
      ...market.store.gameState,
      flippedCards: { 1: [], 2: [], 3: [] }
    }
    await flushPromises()
    await wrapper.findComponent(ContextActionBar).get('.context-actions .btn-primary').trigger('click')
    expect(market.sendAction).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('所选发展卡已不在市场中')

    wrapper.unmount()
    wrapper = undefined
    const deck = await createGameFlowHarness({
      stateOverrides: {
        gemBoard: reserveBoard,
        unflippedCards: { 1: 1, 2: 0, 3: 0 },
        level1Deck: ['hidden-1']
      }
    })
    await openReserve()
    await wrapper.get('[data-deck-level="1"]').trigger('click')
    deck.store.gameState = {
      ...deck.store.gameState,
      unflippedCards: { 1: 0, 2: 0, 3: 0 },
      level1Deck: []
    }
    await flushPromises()
    await wrapper.findComponent(ContextActionBar).get('.context-actions .btn-primary').trigger('click')
    expect(deck.sendAction).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('所选牌堆已为空')

    wrapper.unmount()
    wrapper = undefined
    const refill = await createGameFlowHarness()
    await openRefillFromBag()
    refill.store.gameState = { ...refill.store.gameState, gemBag: [] }
    await flushPromises()
    await wrapper.findComponent(ContextActionBar).get('.context-actions .btn-primary').trigger('click')
    expect(refill.sendAction).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('袋子为空')
  })

  it.each(['pending', 'unknown'])('blocks all reserve, refill and reserved-card purchase entries while %s', async status => {
    const { sendAction, store } = await createGameFlowHarness({
      playerOverrides: { reservedCards: ['flow-card'] },
      stateOverrides: {
        gemBoard: reserveBoard,
        unflippedCards: { 1: 1, 2: 0, 3: 0 },
        level1Deck: ['hidden-1']
      }
    })
    store.pendingActions = {
      locked: { requestId: 'locked', actionType: 'reserveCard', data: {}, status, sentAt: Date.now() }
    }
    await flushPromises()

    expect(actionDialog().props('visible')).toBe(false)
    await wrapper.get('[data-board-position="1-2"]').trigger('click')
    expect(actionDialog().props('visible')).toBe(false)
    await wrapper.get('[data-market-card-id="flow-card"]').trigger('click')
    expect(actionDialog().props('visible')).toBe(false)
    await wrapper.get('[data-deck-level="1"]').trigger('click')
    expect(actionDialog().props('visible')).toBe(false)
    await wrapper.get('.bag-pill').trigger('click')
    expect(actionDialog().props('visible')).toBe(false)
    await wrapper.findComponent(PlayerStatusCard).get('.reserved-card-item:not(.empty)').trigger('click')
    await flushPromises()

    expect(sendAction).not.toHaveBeenCalled()
    expect(wrapper.findComponent(ContextActionBar).exists()).toBe(false)
    expect(actionDialog().props('actionType')).toBe('')
    expect(actionDialog().props('visible')).toBe(false)
  })

  it('keeps direct board controls locked for pending and unknown actions', async () => {
    const { store } = await createGameFlowHarness()
    const firstGem = wrapper.findComponent(GemBoard).get('[data-board-position="0-0"]')
    store.pendingActions = {
      pending: { requestId: 'pending', actionType: 'takeGems', data: {}, status: 'pending', sentAt: Date.now() }
    }
    await flushPromises()
    expect(firstGem.attributes('disabled')).toBeDefined()

    store.pendingActions = {
      unknown: { requestId: 'unknown', actionType: 'takeGems', data: {}, status: 'unknown', sentAt: Date.now() }
    }
    await flushPromises()
    expect(firstGem.attributes('disabled')).toBeDefined()
  })

  it('reopens an authority-required discard after a non-normal close, but not after completion', async () => {
    const { sendAction, store } = await createGameFlowHarness()
    store.gameState = makeGameState(makeCard(), {}, {
      needsGemDiscard: true,
      gemDiscardTarget: 10,
      gemDiscardPlayerID: 'p1',
    })
    await flushPromises()
    expect(actionDialog().props('actionType')).toBe('discardGems')

    await emitCancel({ actionType: 'discardGems', closed: true })
    expect(actionDialog().props('visible')).toBe(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(actionDialog().props('actionType')).toBe('discardGems')
    expect(actionDialog().props('visible')).toBe(true)

    actionDialog().vm.$emit('reset')
    await flushPromises()
    expect(actionDialog().props('visible')).toBe(true)

    store.gameState = makeGameState(makeCard(), {}, {
      needsGemDiscard: true,
      gemDiscardTarget: 10,
      gemDiscardPlayerID: 'p1',
    })
    await flushPromises()
    expect(actionDialog().props('visible')).toBe(true)
    await emitConfirm({ actionType: 'discardGems', completed: true })
    expect(actionDialog().props('visible')).toBe(false)
    expect(sendAction).toHaveBeenLastCalledWith('endTurn', {})
    await vi.advanceTimersByTimeAsync(1000)
    expect(actionDialog().props('visible')).toBe(false)
  })

  it('surfaces pending and rejected ACK feedback without changing unknown-action recovery', async () => {
    const { store } = await createGameFlowHarness()
    const requestId = 'request-ack'
    store.pendingActions = { [requestId]: { requestId, actionType: 'takeGems', data: {}, status: 'pending', sentAt: Date.now() } }
    await flushPromises()
    expect(wrapper.find('.request-feedback-banner').text()).toContain('等待服务器确认')
    expect(wrapper.find('.request-feedback-banner').attributes('role')).toBe('status')

    store.lastActionResult = { requestId: 'request-success', actionType: 'takeGems', success: true, completedAt: Date.now() }
    await flushPromises()
    expect(document.body.textContent).toContain('操作成功')

    store.lastActionResult = { requestId, actionType: 'takeGems', success: false, message: '规则拒绝', completedAt: Date.now() }
    await flushPromises()
    expect(document.body.textContent).toContain('操作失败')
    expect(document.body.textContent).toContain('规则拒绝')

    store.pendingActions = { [requestId]: { requestId, actionType: 'takeGems', data: {}, status: 'unknown', sentAt: Date.now() } }
    await flushPromises()
    expect(store.pendingActions[requestId]).toMatchObject({ status: 'unknown', actionType: 'takeGems' })
    expect(document.body.textContent).toContain('操作结果未知')
    expect(document.body.textContent).toContain('不会自动重发操作')
    expect(wrapper.find('.request-feedback-banner').classes()).toContain('is-warning')
    expect(wrapper.find('.request-feedback-banner').attributes('role')).toBe('alert')
  })
})
