import { describe, expect, it } from 'vitest'
import { isGameState } from '../game-state'
import { createGameVisualFixture } from './game-fixture'

describe('game visual fixture', () => {
  it('provides a complete deterministic state accepted by the protocol boundary', () => {
    const fixture = createGameVisualFixture()

    expect(isGameState(fixture.room.gameState)).toBe(true)
    expect(fixture.currentPlayer.id).toBe(fixture.room.gameState.players[0].id)
    expect(fixture.room.gameState.gemBoard).toHaveLength(5)
    expect(fixture.room.gameState.gemBoard.every(row => row.length === 5)).toBe(true)
    expect(fixture.room.gameState.flippedCards).toEqual({
      '1': ['a1', 'b1', 'c1', 'd1', 'e1'],
      '2': ['h1', 'i1', 'j1', 'k1'],
      '3': ['m1', 'n1', 'o1']
    })
  })

  it('returns isolated state for each scenario setup', () => {
    const first = createGameVisualFixture()
    const second = createGameVisualFixture()

    first.room.gameState.players[0].gems.white = 0
    first.room.gameState.cardDetails.a1.cost.blue = 0
    expect(second.room.gameState.players[0].gems.white).toBe(3)
    expect(second.room.gameState.cardDetails.a1.cost.blue).toBe(2)
  })
})
