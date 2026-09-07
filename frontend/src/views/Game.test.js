import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import Game from './Game.vue'
import ActionDialog from '../components/ActionDialog.vue'
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
    status: 'playing', currentPlayerIndex: 0, players: [player('p1', '对手'), player('p2', '本地玩家')],
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
  expect(details[0].classes()).toContain('expanded')
  expect(details[1].classes()).not.toContain('expanded')
  expect(details[0].find('.player-summary').text()).toContain('本地玩家')
  expect(details[0].find('.player-summary').text()).toContain('你')
  expect(details[1].find('.player-summary').text()).toContain('当前回合')
  await details[1].find('.player-summary').trigger('click')
  expect(wrapper.findAll('.player-details')[1].classes()).toContain('expanded')
  expect(wrapper.findAll('.player-details')[1].find('.player-summary').attributes('aria-expanded')).toBe('true')

  const mobilePanels = wrapper.findAll('.mobile-collapsible-panel')
  expect(mobilePanels).toHaveLength(3)
  expect(mobilePanels.map(panel => panel.classes().includes('expanded'))).toEqual([false, true, false])
  expect(mobilePanels.map(panel => panel.find('.mobile-panel-summary').attributes('aria-expanded'))).toEqual(['false', 'true', 'false'])
  const scrollIntoView = vi.fn()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  vi.spyOn(document, 'getElementById').mockReturnValue({ scrollIntoView })
  const mobileNav = wrapper.find('.mobile-game-nav')
  expect(mobileNav.findAll('button')).toHaveLength(4)
  expect(mobileNav.text()).toContain('等待 对手')
  await mobileNav.findAll('button')[3].trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.mobile-collapsible-panel')[2].classes()).toContain('expanded')
  expect(wrapper.findAll('.mobile-collapsible-panel')[2].find('.mobile-panel-summary').attributes('aria-expanded')).toBe('true')
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
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
  await wrapper.find('.history-preview-close').trigger('click')
  expect(wrapper.find('.history-preview-tooltip').exists()).toBe(false)
  expect(wrapper.find('header.game-header').exists()).toBe(true)
  expect(wrapper.find('main.game-main').exists()).toBe(true)
  expect(wrapper.find('.room-info h2').attributes('aria-level')).toBe('1')

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

  it('keeps the extra-token selection shape and sends one final buyCard payload', async () => {
    const { card, sendAction } = await createGameFlowHarness({
      card: makeCard({ effects: ['extra_token'] }),
    })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: card, paymentPlan: { white: 1, gold: 0 } })
    expect(actionDialog().props('actionType')).toBe('takeExtraToken')

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
    expect(actionDialog().props('actionType')).toBe('stealToken')
    await emitConfirm({ actionType: 'stealToken', stealGemType: null })
    expect(steal.sendAction).toHaveBeenCalledWith('buyCard', {
      cardId: 'flow-card', paymentPlan: { white: 1 }, effects: { steal: { skipped: true } },
    })
  })

  it('keeps wildcard selection asynchronous and preserves its field name in the buy payload', async () => {
    const { card, sendAction } = await createGameFlowHarness({ card: makeCard({ effects: ['wildcard'] }) })
    await openPurchase()
    await emitConfirm({ actionType: 'buyCard', selectedCard: card, paymentPlan: { white: 1 } })
    expect(actionDialog().props('actionType')).toBe('chooseWildcardColor')
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
    expect(actionDialog().props('actionType')).toBe('chooseNoble')

    await emitConfirm({ actionType: 'chooseNoble', nobleId: 'noble1' })
    expect(actionDialog().props('actionType')).toBe('stealToken')
    await emitCancel()
    expect(actionDialog().props('actionType')).toBe('chooseNoble')

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
    expect(actionDialog().props('actionType')).toBe('takeExtraToken')
    await emitConfirm({ actionType: 'takeExtraToken', selectedGems: [{ x: 0, y: 1, type: 'blue' }] })

    expect(sendAction).toHaveBeenCalledTimes(1)
    expect(sendAction).toHaveBeenCalledWith('buyCard', {
      cardId: 'flow-card',
      paymentPlan: { white: 1 },
      effects: { extraToken: { selectedGem: { x: 0, y: 1 } } },
    })
  })

  it.each([
    { selectedGems: [{ x: 0, y: 0, type: 'white' }, { x: 1, y: 0, type: 'white' }, { x: 2, y: 0, type: 'white' }] },
    { selectedGems: [{ x: 0, y: 1, type: 'pearl' }, { x: 1, y: 1, type: 'pearl' }] },
  ])('sends grantOpponentPrivilege before takeGems without changing either payload', async ({ selectedGems }) => {
    const { sendAction } = await createGameFlowHarness()
    await emitConfirm({ actionType: 'takeGems', selectedGems })
    expect(actionDialog().props('actionType')).toBe('confirmTakeGemsGrantPrivilege')
    await emitConfirm({ actionType: 'confirmTakeGemsGrantPrivilege' })

    expect(sendAction.mock.calls).toEqual([
      ['grantOpponentPrivilege', {}],
      ['takeGems', { gemPositions: selectedGems.map(({ x, y }) => ({ x, y })) }],
    ])
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
    expect(actionDialog().props('visible')).toBe(false)

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
    store.lastActionResult = { requestId, actionType: 'takeGems', success: false, message: '规则拒绝', completedAt: Date.now() }
    await flushPromises()
    expect(document.body.textContent).toContain('操作失败')
    expect(document.body.textContent).toContain('规则拒绝')

    store.pendingActions = { [requestId]: { requestId, actionType: 'takeGems', data: {}, status: 'unknown', sentAt: Date.now() } }
    await flushPromises()
    expect(store.pendingActions[requestId]).toMatchObject({ status: 'unknown', actionType: 'takeGems' })
  })
})
