import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import Game from './views/Game.vue'
import { useGameStore } from './stores/game'
import { createGameVisualFixture } from './visual-fixtures/game-fixture'
import './style.css'

type Scenario = 'default' | 'take-gems' | 'spend-privilege' | 'purchase' | 'reserve' | 'refill' | 'extra-token' | 'steal-token' | 'wildcard' | 'noble' | 'discard' | 'victory' | 'pending' | 'unknown'

const requestedScenario = new URLSearchParams(window.location.search).get('scenario')
const scenario: Scenario = requestedScenario === 'take-gems' || requestedScenario === 'spend-privilege' || requestedScenario === 'purchase' || requestedScenario === 'reserve' || requestedScenario === 'refill' || requestedScenario === 'extra-token' || requestedScenario === 'steal-token' || requestedScenario === 'wildcard' || requestedScenario === 'noble' || requestedScenario === 'discard' || requestedScenario === 'victory' || requestedScenario === 'pending' || requestedScenario === 'unknown'
  ? requestedScenario
  : 'default'

const pinia = createPinia()
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})
const fixture = createGameVisualFixture()
// 附加数据变体（不改变默认基线）：nobles=many 让本地玩家持有四贵族，用于贵族浮层视口钳制回归
if (new URLSearchParams(window.location.search).get('nobles') === 'many') {
  const local = fixture.room.gameState?.players?.[0]
  if (local) {
    local.nobles = ['noble1', 'noble2', 'noble3', 'noble4']
    local.crowns = 4
  }
}
// 附加数据变体（不改变默认基线）：board=gap 让版图出现三个空位，用于空格文案淡化回归
if (new URLSearchParams(window.location.search).get('board') === 'gap') {
  const gemBoard = fixture.room.gameState?.gemBoard
  if (gemBoard) {
    gemBoard[0][4] = ''
    gemBoard[1][1] = ''
    gemBoard[2][3] = ''
  }
}
if (scenario === 'extra-token' || scenario === 'steal-token' || scenario === 'wildcard' || scenario === 'noble') {
  const firstCardId = fixture.room.gameState?.flippedCards?.['1']?.[0]
  const card = firstCardId ? fixture.room.gameState?.cardDetails?.[firstCardId] : undefined
  if (card) {
    card.effects = scenario === 'extra-token' ? ['extra_token'] : scenario === 'steal-token' ? ['steal'] : scenario === 'wildcard' ? ['wildcard'] : []
    if (scenario === 'noble') card.crowns = 4
  }
}
const store = useGameStore(pinia)

store.currentRoom = fixture.room
store.currentPlayer = fixture.currentPlayer
store.gameState = fixture.room.gameState
store.chatMessages = fixture.chatMessages
store.gameHistory = fixture.gameHistory
store.isConnected = true
store.connectionStatus = 'connected'
store.connectWebSocket = () => undefined
if (scenario === 'pending' || scenario === 'unknown') {
  store.pendingActions = {
    'stage46-request': {
      requestId: 'stage46-request',
      actionType: 'takeGems',
    data: { gemPositions: [] },
      status: scenario,
      sentAt: 1
    }
  }
}

const app = createApp(Game, { roomId: fixture.room.id })
app.use(pinia)
app.use(router)
await router.push('/')
await router.isReady()
app.mount('#app')
await nextTick()

if (scenario === 'take-gems') {
  document.querySelector<HTMLButtonElement>('.gem-board .gem-cell:not(:disabled)')?.click()
} else if (scenario === 'spend-privilege') {
  document.querySelector<HTMLElement>('.player-card .privilege-badge[role="button"]')?.click()
} else if (scenario === 'purchase') {
  document.querySelector<HTMLElement>('.development-cards .card-item')?.click()
} else if (scenario === 'reserve') {
  document.querySelector<HTMLButtonElement>('.gem-board .gem-cell[aria-label^="选择黄金"]')?.click()
} else if (scenario === 'refill') {
  document.querySelector<HTMLElement>('.bag-pill')?.click()
} else if (scenario === 'extra-token' || scenario === 'steal-token' || scenario === 'wildcard' || scenario === 'noble') {
  document.querySelector<HTMLElement>('.development-cards .card-item[aria-label^="购买发展卡：a1"]')?.click()
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
  document.querySelector<HTMLButtonElement>('.dialog-footer .btn-primary')?.click()
  await nextTick()
} else if (scenario === 'discard' && store.gameState) {
  store.gameState = {
    ...store.gameState,
    needsGemDiscard: true,
    gemDiscardPlayerID: fixture.currentPlayer.id
  }
} else if (scenario === 'victory' && store.gameState) {
  store.gameState = {
    ...store.gameState,
    status: 'finished',
    winner: fixture.currentPlayer.id,
    victoryReasons: ['达到20分']
  }
}

await nextTick()
document.documentElement.dataset.visualFixtureReady = scenario
