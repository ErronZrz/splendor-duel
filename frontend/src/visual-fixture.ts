import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import Game from './views/Game.vue'
import { useGameStore } from './stores/game'
import { createGameVisualFixture } from './visual-fixtures/game-fixture'
import './style.css'

type Scenario = 'default' | 'take-gems' | 'spend-privilege' | 'purchase' | 'reserve' | 'discard' | 'victory'

const requestedScenario = new URLSearchParams(window.location.search).get('scenario')
const scenario: Scenario = requestedScenario === 'take-gems' || requestedScenario === 'spend-privilege' || requestedScenario === 'purchase' || requestedScenario === 'reserve' || requestedScenario === 'discard' || requestedScenario === 'victory'
  ? requestedScenario
  : 'default'

const pinia = createPinia()
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})
const fixture = createGameVisualFixture()
const store = useGameStore(pinia)

store.currentRoom = fixture.room
store.currentPlayer = fixture.currentPlayer
store.gameState = fixture.room.gameState
store.chatMessages = fixture.chatMessages
store.gameHistory = fixture.gameHistory
store.isConnected = true
store.connectionStatus = 'connected'
store.connectWebSocket = () => undefined

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
