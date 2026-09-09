import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import axios from 'axios'
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

  it('accepts the backend game-state shape and ignores malformed replacements', () => {
    store = connectedStore()
    const socket = FakeWebSocket.instances[0]
    const state = {
      status: 'waiting', currentPlayerIndex: 0, turnNumber: 0,
      players: [{
        id: 'p1', name: 'Player 1', gems: {}, bonus: {}, reservedCards: [],
        developmentCards: [], privilegeTokens: 0, crowns: 0, nobles: [], points: 0,
        isHost: true, lastActive: '2026-09-06T00:00:00Z'
      }],
      gemBoard: [], gemBag: [], availablePrivilegeTokens: 3,
      unflippedCards: {}, flippedCards: {}, level1Deck: [], level2Deck: [], level3Deck: [],
      cardDetails: {}, cardMap: {}, availableNobles: [], extraTurns: {},
      cardToRefill: { level: 0, index: 0 }, refilledThisTurn: false,
      needsGemDiscard: false, gemDiscardTarget: 10, gemDiscardPlayerID: '',
      createdAt: '2026-09-06T00:00:00Z', startedAt: '0001-01-01T00:00:00Z'
    }

    socket.onmessage({ data: JSON.stringify({ type: 'game_state_update', gameState: state }) })
    expect(store.gameState).toEqual(state)

    socket.onmessage({
      data: JSON.stringify({ type: 'game_state_update', gameState: { ...state, players: [{ id: 'bad' }] } })
    })
    expect(store.gameState).toEqual(state)
  })

  it('installs an authoritative state update after a gem is removed from the board', () => {
    store = connectedStore()
    const socket = FakeWebSocket.instances[0]
    const stateAfterTake = {
      status: 'playing', currentPlayerIndex: 1, turnNumber: 2,
      players: [{
        id: 'p1', name: 'Player 1', gems: { blue: 1 }, bonus: {}, reservedCards: [],
        developmentCards: [], privilegeTokens: 0, crowns: 0, nobles: [], points: 0,
        isHost: true, lastActive: '2026-09-06T00:00:00Z'
      }],
      gemBoard: [['']], gemBag: [], availablePrivilegeTokens: 3,
      unflippedCards: {}, flippedCards: {}, level1Deck: [], level2Deck: [], level3Deck: [],
      cardDetails: {}, cardMap: {}, availableNobles: [], extraTurns: {},
      cardToRefill: { level: 0, index: 0 }, refilledThisTurn: false,
      needsGemDiscard: false, gemDiscardTarget: 10, gemDiscardPlayerID: '',
      createdAt: '2026-09-06T00:00:00Z', startedAt: '2026-09-06T00:00:00Z'
    }

    socket.onmessage({ data: JSON.stringify({ type: 'game_state_update', gameState: stateAfterTake }) })

    expect(store.gameState).toEqual(stateAfterTake)
  })

  it('installs and normalizes the authoritative state after the final noble is taken', () => {
    store = connectedStore()
    const socket = FakeWebSocket.instances[0]
    const exhaustedNoblesState = {
      status: 'playing', currentPlayerIndex: 1, turnNumber: 63,
      players: [{
        id: 'p1', name: 'Player 1', gems: { pearl: 1 }, bonus: { white: 5 }, reservedCards: [],
        developmentCards: ['f3'], privilegeTokens: 0, crowns: 6, nobles: ['noble1', 'noble4'], points: 19,
        isHost: true, lastActive: '2026-09-09T15:12:11Z'
      }],
      gemBoard: [['']], gemBag: ['pearl'], availablePrivilegeTokens: 0,
      unflippedCards: {}, flippedCards: {}, level1Deck: [], level2Deck: [], level3Deck: [],
      cardDetails: {}, cardMap: {}, availableNobles: null, extraTurns: {},
      cardToRefill: { level: 0, index: 0 }, refilledThisTurn: false,
      needsGemDiscard: false, gemDiscardTarget: 10, gemDiscardPlayerID: '',
      createdAt: '2026-09-09T14:48:05Z', startedAt: '2026-09-09T14:48:28Z'
    }

    socket.onmessage({ data: JSON.stringify({ type: 'game_state_update', gameState: exhaustedNoblesState }) })

    expect(store.gameState).toMatchObject({
      currentPlayerIndex: 1,
      availableNobles: [],
      players: [{ developmentCards: ['f3'], crowns: 6, nobles: ['noble1', 'noble4'], points: 19 }]
    })
  })

  it('does not install a malformed successful room response', async () => {
    store = useGameStore(createPinia())
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { success: true, data: { playerId: 'p1', room: { id: 'room-1' } } }
    })

    await expect(store.createRoom('Room 1', 'Player 1')).resolves.toEqual({
      success: false,
      message: '创建房间失败'
    })
    expect(store.currentRoom).toBeNull()
    expect(store.currentPlayer).toBeNull()
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

  it('adds a request id and tracks an action until acknowledgement', () => {
    store = connectedStore()
    const socket = FakeWebSocket.instances[0]
    const requestId = store.sendGameAction('refillBoard', {})
    const sent = socket.sent[1]

    expect(sent).toMatchObject({
      type: 'game_action', playerId: 'p1', actionType: 'refillBoard', data: {}, requestId
    })
    expect(requestId).toMatch(/^[A-Za-z0-9_.:-]+$/)
    expect(store.pendingActions[requestId]).toMatchObject({ actionType: 'refillBoard', status: 'pending' })

    socket.onmessage({
      data: JSON.stringify({ type: 'action_result', data: { requestId, actionType: 'refillBoard', success: true } })
    })
    expect(store.pendingActions[requestId]).toBeUndefined()
    expect(store.lastActionResult).toMatchObject({ requestId, actionType: 'refillBoard', success: true })
  })

  it('ignores unknown and action-mismatched acknowledgements', () => {
    store = connectedStore()
    const socket = FakeWebSocket.instances[0]
    const requestId = store.sendGameAction('refillBoard', {})

    socket.onmessage({
      data: JSON.stringify({ type: 'action_result', data: { requestId: 'unknown', actionType: 'refillBoard', success: true } })
    })
    socket.onmessage({
      data: JSON.stringify({ type: 'action_result', data: { requestId, actionType: 'takeGems', success: true } })
    })

    expect(store.pendingActions[requestId]).toBeDefined()
    expect(store.lastActionResult).toBeNull()
  })

  it('keeps disconnected actions as unknown without automatically resending them', () => {
    store = connectedStore()
    const firstSocket = FakeWebSocket.instances[0]
    const requestId = store.sendGameAction('refillBoard', {})
    firstSocket.close()

    expect(store.pendingActions[requestId].status).toBe('unknown')
    vi.advanceTimersByTime(1000)
    const secondSocket = FakeWebSocket.instances[1]
    secondSocket.open()
    expect(secondSocket.sent).toEqual([{ type: 'player_join', playerId: 'p1', playerName: 'Player 1' }])
    expect(store.pendingActions[requestId].status).toBe('unknown')
  })

  it('clears only locally retained receipt locks when a later authoritative turn resolves them', () => {
    store = connectedStore()
    const requestId = store.sendGameAction('refillBoard', {})
    store.clearResolvedPendingActions()
    expect(store.pendingActions[requestId]).toBeUndefined()
  })
})
