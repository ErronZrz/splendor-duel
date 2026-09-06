import { afterEach, expect, it, vi } from 'vitest'
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
})

it('passes a delayed server resource update into an already-open purchase', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
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
  vi.spyOn(console, 'log').mockImplementation(() => {})
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
  vi.spyOn(document, 'getElementById').mockReturnValue({ scrollIntoView })
  const mobileNav = wrapper.find('.mobile-game-nav')
  expect(mobileNav.findAll('button')).toHaveLength(4)
  expect(mobileNav.text()).toContain('等待 对手')
  await mobileNav.findAll('button')[3].trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.mobile-collapsible-panel')[2].classes()).toContain('expanded')
  expect(wrapper.findAll('.mobile-collapsible-panel')[2].find('.mobile-panel-summary').attributes('aria-expanded')).toBe('true')
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
})
