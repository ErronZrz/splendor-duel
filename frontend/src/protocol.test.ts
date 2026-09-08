import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  isActionResult,
  parseWebSocketMessage,
  type ActionResult,
  type GameActionPayloadMap,
  type GameActionMessage
} from './protocol'

describe('WebSocket protocol boundary', () => {
  it('accepts the current action result and preserves extension fields', () => {
    const message = parseWebSocketMessage({
      type: 'action_result',
      data: {
        requestId: 'request-1',
        actionType: 'takeGems',
        success: true,
        replayed: true,
        futureField: 'kept'
      },
      futureEnvelopeField: 1
    })

    expect(message).not.toBeNull()
    expect(message?.futureEnvelopeField).toBe(1)
    expect(message?.data).toMatchObject({ futureField: 'kept' })
    expect(isActionResult(message?.data)).toBe(true)
  })

  it.each([
    null,
    {},
    { type: '' },
    { type: 'action_result' },
    { type: 'action_result', data: { requestId: 'r', actionType: 'takeGems', success: 'yes' } },
    { type: 'action_result', data: { requestId: 'r', actionType: '', success: true } }
  ])('rejects malformed server messages without throwing', (value) => {
    expect(parseWebSocketMessage(value)).toBeNull()
  })

  it('keeps the existing game action envelope field names', () => {
    const message: GameActionMessage<'takeGems'> = {
      type: 'game_action',
      playerId: 'p1',
      playerName: 'Player 1',
      actionType: 'takeGems',
      data: { gemPositions: [{ x: 0, y: 0 }] },
      requestId: 'request-1'
    }

    expectTypeOf(message).toMatchTypeOf<GameActionMessage>()
    expect(Object.keys(message)).toEqual([
      'type', 'playerId', 'playerName', 'actionType', 'data', 'requestId'
    ])
  })

  it('maps every current action type to its exact payload while allowing extensions', () => {
    const fixtures: { [K in keyof GameActionPayloadMap]: GameActionPayloadMap[K] } = {
      start_game: { future: true },
      takeGems: { gemPositions: [{ x: 0, y: 1, future: true }] },
      buyCard: { cardId: 'a1', paymentPlan: { white: 1 }, effects: { steal: { skipped: true } } },
      reserveCard: { cardId: 'a1', goldX: 1, goldY: 2 },
      spendPrivilege: { privilegeCount: 1, gemPositions: [{ x: 0, y: 0 }] },
      refillBoard: {},
      grantOpponentPrivilege: {},
      discardGem: { gemType: 'white' },
      discardGemsBatch: { gemDiscards: { white: 1 } },
      endTurn: {}
    }
    expect(Object.keys(fixtures)).toHaveLength(10)
  })

  it('rejects mismatched known payload fields at compile time', () => {
    // @ts-expect-error takeGems requires gemPositions, not cardId.
    const invalid: GameActionMessage<'takeGems'> = { type: 'game_action', playerId: 'p1', playerName: 'P1', actionType: 'takeGems', data: { cardId: 'a1' }, requestId: 'r1' }
    expect(invalid.data).toEqual({ cardId: 'a1' })
  })

  it('models the backend action result JSON contract', () => {
    const result: ActionResult = {
      requestId: 'request-1',
      actionType: 'takeGems',
      success: false,
      message: 'rejected'
    }
    expect(isActionResult(result)).toBe(true)
  })
})
