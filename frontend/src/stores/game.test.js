import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { useGameStore } from './game'

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3
  static instances = []

  constructor(url) {
    this.url = url
    this.readyState = FakeWebSocket.CONNECTING
    this.sent = []
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  send(message) {
    this.sent.push(JSON.parse(message))
  }
}

describe('game store WebSocket lifecycle', () => {
  let store

  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    store?.disconnect()
    store = null
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const connectedStore = () => {
    store = useGameStore(createPinia())
    store.currentPlayer = { id: 'p1', name: 'Player 1' }
    store.connectWebSocket('room-1')
    FakeWebSocket.instances[0].open()
    return store
  }

  it('reconnects after an unexpected close and rejoins with the persisted identity', () => {
    store = connectedStore()
    const firstSocket = FakeWebSocket.instances[0]
    expect(firstSocket.sent).toEqual([{ type: 'player_join', playerId: 'p1', playerName: 'Player 1' }])

    firstSocket.close()
    expect(store.connectionStatus).toBe('reconnecting')
    vi.advanceTimersByTime(1000)

    const secondSocket = FakeWebSocket.instances[1]
    expect(secondSocket.url).toContain('/ws/room-1')
    secondSocket.open()
    expect(store.isConnected).toBe(true)
    expect(secondSocket.sent[0]).toEqual({ type: 'player_join', playerId: 'p1', playerName: 'Player 1' })
  })

  it('reconnects immediately when the browser returns online', () => {
    store = connectedStore()
    FakeWebSocket.instances[0].close()

    window.dispatchEvent(new Event('online'))
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(store.connectionStatus).toBe('reconnecting')
  })

  it('does not replace a connection that is already opening', () => {
    store = useGameStore(createPinia())
    store.currentPlayer = { id: 'p1', name: 'Player 1' }
    store.connectWebSocket('room-1')

    window.dispatchEvent(new Event('online'))

    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('does not reconnect after an intentional disconnect', () => {
    store = connectedStore()
    store.disconnect()
    vi.advanceTimersByTime(30000)
    window.dispatchEvent(new Event('online'))

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(store.connectionStatus).toBe('disconnected')
  })

  it('keeps game membership when another player socket disconnects', () => {
    store = connectedStore()
    store.gameState = { players: [{ id: 'p1' }, { id: 'p2' }] }

    FakeWebSocket.instances[0].onmessage({
      data: JSON.stringify({ type: 'player_left', data: { playerId: 'p2' } }),
    })

    expect(store.gameState.players.map(player => player.id)).toEqual(['p1', 'p2'])
  })

  it('ignores callbacks from a socket that has been replaced', () => {
    store = useGameStore(createPinia())
    store.currentPlayer = { id: 'p1', name: 'Player 1' }
    store.connectWebSocket('room-1')
    const staleSocket = FakeWebSocket.instances[0]

    store.connectWebSocket('room-2')
    staleSocket.onopen?.()

    expect(store.isConnected).toBe(false)
    expect(store.connectionStatus).toBe('connecting')
  })
})
