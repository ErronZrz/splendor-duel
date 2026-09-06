import { describe, expect, expectTypeOf, it } from 'vitest'
import { isGameState, parseRoomAPIResponse, type RoomAPIResponse } from './game-state'

const gameState = {
  status: 'waiting',
  currentPlayerIndex: 0,
  turnNumber: 0,
  players: [{
    id: 'p1',
    name: 'Player 1',
    gems: {},
    bonus: {},
    reservedCards: [],
    developmentCards: [],
    privilegeTokens: 0,
    crowns: 0,
    nobles: [],
    points: 0,
    isHost: true,
    lastActive: '2026-09-06T00:00:00Z'
  }],
  gemBoard: [],
  gemBag: [],
  availablePrivilegeTokens: 3,
  unflippedCards: {},
  flippedCards: {},
  level1Deck: [],
  level2Deck: [],
  level3Deck: [],
  cardDetails: {},
  cardMap: {},
  availableNobles: [],
  extraTurns: {},
  cardToRefill: { level: 0, index: 0 },
  refilledThisTurn: false,
  needsGemDiscard: false,
  gemDiscardTarget: 10,
  gemDiscardPlayerID: '',
  createdAt: '2026-09-06T00:00:00Z',
  startedAt: '0001-01-01T00:00:00Z'
}

const successfulResponse = {
  success: true,
  data: {
    playerId: 'p1',
    room: {
      id: 'room-1',
      name: 'Room 1',
      gameState,
      createdAt: '2026-09-06T00:00:00Z',
      updatedAt: '2026-09-06T00:00:00Z'
    }
  }
}

describe('game state boundary', () => {
  it('parses the current create/join response and preserves extension fields in state', () => {
    const response = parseRoomAPIResponse({
      ...successfulResponse,
      futureEnvelopeField: true,
      data: {
        ...successfulResponse.data,
        room: {
          ...successfulResponse.data.room,
          gameState: { ...gameState, futureStateField: 'kept' }
        }
      }
    })

    expect(response?.success).toBe(true)
    if (!response?.success) throw new Error('expected successful response')
    expect(response.data.room.gameState).toMatchObject({ futureStateField: 'kept' })
    expectTypeOf(response).toMatchTypeOf<RoomAPIResponse>()
  })

  it('preserves backend failure messages without requiring data', () => {
    expect(parseRoomAPIResponse({ success: false, message: '房间已满' })).toEqual({
      success: false,
      message: '房间已满'
    })
  })

  it.each([
    null,
    {},
    { success: 'yes' },
    { success: true },
    { ...successfulResponse, data: { ...successfulResponse.data, playerId: 1 } },
    {
      ...successfulResponse,
      data: {
        ...successfulResponse.data,
        room: { ...successfulResponse.data.room, gameState: { ...gameState, players: [{ id: 'bad' }] } }
      }
    }
  ])('rejects malformed room API responses', (value) => {
    expect(parseRoomAPIResponse(value)).toBeNull()
  })

  it('rejects invalid enum values in game state', () => {
    expect(isGameState({ ...gameState, gemBag: ['future-gem'] })).toBe(false)
  })
})
