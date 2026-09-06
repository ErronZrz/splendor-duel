import { describe, expect, it } from 'vitest'
import type { DevelopmentCard, GameState, Player } from './game-state'
import {
  calculateCardPaymentShortfall, findOpponent, findPlayerById, getCardLevel,
  getFlippedCardsByLevel, getOwnedBonusCardIds, getTurnPlayer, isLocalPlayersTurn,
  isPlayersTurn, orderPlayersLocalFirst
} from './game-view-selectors'

const player = (id: string, overrides: Partial<Player> = {}): Player => ({
  id, name: id, gems: {}, bonus: {}, reservedCards: [], developmentCards: [],
  privilegeTokens: 0, crowns: 0, nobles: [], points: 0, isHost: id === 'p1',
  lastActive: '2026-09-06T00:00:00Z', ...overrides
})

const card = (id: string, overrides: Partial<DevelopmentCard> = {}): DevelopmentCard => ({
  id, level: 1, code: id, color: 'blue', points: 0, crowns: 0, bonus: 'blue',
  cost: {}, effects: [], isSpecial: false, imagePath: '', ...overrides
})

const state = (overrides: Partial<GameState> = {}): GameState => ({
  status: 'playing', currentPlayerIndex: 0, turnNumber: 1,
  players: [player('p1'), player('p2')], gemBoard: [], gemBag: [],
  availablePrivilegeTokens: 3, unflippedCards: {}, flippedCards: {},
  level1Deck: [], level2Deck: [], level3Deck: [], cardDetails: {}, cardMap: {},
  availableNobles: [], extraTurns: {}, cardToRefill: { level: 0, index: 0 },
  refilledThisTurn: false, needsGemDiscard: false, gemDiscardTarget: 10,
  gemDiscardPlayerID: '', createdAt: '2026-09-06T00:00:00Z',
  startedAt: '2026-09-06T00:00:00Z', ...overrides
})

describe('game player selectors', () => {
  it('finds the local player and opponent and handles missing state', () => {
    const players = [player('p1'), player('p2')]
    expect(findPlayerById(players, 'p2')?.id).toBe('p2')
    expect(findOpponent(players, 'p1')?.id).toBe('p2')
    expect(findPlayerById(undefined, 'p1')).toBeUndefined()
    expect(findOpponent([], 'p1')).toBeUndefined()
    expect(findOpponent(players, undefined)).toBeUndefined()
  })

  it('orders the local player first without mutating the source', () => {
    const players = [player('p2'), player('p1')]
    expect(orderPlayersLocalFirst(players, 'p1').map(item => item.id)).toEqual(['p1', 'p2'])
    expect(players.map(item => item.id)).toEqual(['p2', 'p1'])
    expect(orderPlayersLocalFirst(players, null)).toEqual(players)
  })

  it('selects and identifies the current turn while disabling finished games', () => {
    const game = state({ currentPlayerIndex: 1 })
    expect(getTurnPlayer(game)?.id).toBe('p2')
    expect(isPlayersTurn(game, 'p2')).toBe(true)
    expect(isLocalPlayersTurn(game, 'p2')).toBe(true)
    expect(isLocalPlayersTurn({ ...game, status: 'finished' }, 'p2')).toBe(false)
    expect(getTurnPlayer(state({ players: [] }))).toBeUndefined()
    expect(isLocalPlayersTurn(null, 'p1')).toBe(false)
    expect(isLocalPlayersTurn(game, undefined)).toBe(false)
  })
})

describe('game card selectors', () => {
  it('returns known flipped cards in board order and skips unknown cards', () => {
    const game = state({
      flippedCards: { 2: ['c2', 'missing', 'c1'] },
      cardDetails: { c1: card('c1'), c2: card('c2', { level: 2 }) }
    })
    expect(getFlippedCardsByLevel(game, 2).map(item => item.id)).toEqual(['c2', 'c1'])
    expect(getFlippedCardsByLevel(game, 3)).toEqual([])
    expect(getFlippedCardsByLevel(null, 1)).toEqual([])
  })

  it('uses card details for levels and preserves legacy ID fallbacks', () => {
    expect(getCardLevel('special', { special: card('special', { level: 3 }) })).toBe(3)
    expect(getCardLevel('deck_level2_card', {})).toBe(2)
    expect(getCardLevel('legacy_3_card', undefined)).toBe(3)
    expect(getCardLevel('unknown', {})).toBe(1)
    expect(getCardLevel(null, {})).toBe(1)
  })

  it('filters owned bonus cards and ignores missing card details', () => {
    const owner = player('p1', { developmentCards: ['blue', 'red', 'missing'] })
    const details = { blue: card('blue'), red: card('red', { bonus: 'red' }) }
    expect(getOwnedBonusCardIds(owner, details, 'blue')).toEqual(['blue'])
    expect(getOwnedBonusCardIds(owner, details, 'green')).toEqual([])
    expect(getOwnedBonusCardIds(undefined, details, 'blue')).toEqual([])
  })
})

describe('card payment shortfall', () => {
  it('applies bonuses and held gems before using gold', () => {
    expect(calculateCardPaymentShortfall(
      card('costly', { cost: { white: 4, blue: 2 } }),
      player('p1', { gems: { white: 1, blue: 1, gold: 2 }, bonus: { white: 2, blue: 1 } })
    )).toEqual({ canAfford: true, missingGems: { white: 1 }, totalMissing: 1, availableGold: 2 })
  })

  it('reports every color shortage when gold is insufficient', () => {
    expect(calculateCardPaymentShortfall(
      card('costly', { cost: { white: 3, red: 2 } }),
      player('p1', { gems: { white: 1, gold: 1 } })
    )).toEqual({ canAfford: false, missingGems: { white: 2, red: 2 }, totalMissing: 4, availableGold: 1 })
  })

  it('accepts an empty cost with empty player resources', () => {
    expect(calculateCardPaymentShortfall(card('free'), player('p1'))).toEqual({
      canAfford: true, missingGems: {}, totalMissing: 0, availableGold: 0
    })
  })
})
