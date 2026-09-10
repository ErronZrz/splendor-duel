import type { DevelopmentCard, GameState, GemType, Player, Room } from '../game-state'
import type { ChatHistoryEntry, CurrentPlayer, GameHistoryEntry } from '../stores/game'

const timestamp = '2026-09-06T12:00:00Z'

const makeCard = (
  id: string,
  level: number,
  bonus: GemType,
  points: number,
  cost: Partial<Record<GemType, number>>
): DevelopmentCard => ({
  id,
  level,
  code: id,
  color: bonus,
  points,
  crowns: id === 'm1' ? 1 : 0,
  bonus,
  cost,
  effects: [],
  isSpecial: false,
  imagePath: `/images/cards/${id}.jpg`
})

const cards = [
  makeCard('a1', 1, 'white', 0, { blue: 2 }),
  makeCard('b1', 1, 'blue', 0, { white: 1, green: 1 }),
  makeCard('c1', 1, 'green', 1, { red: 2 }),
  makeCard('d1', 1, 'red', 1, { black: 2 }),
  makeCard('e1', 1, 'black', 1, { white: 2 }),
  makeCard('h1', 2, 'white', 2, { blue: 3, green: 2 }),
  makeCard('i1', 2, 'blue', 2, { red: 3, black: 2 }),
  makeCard('j1', 2, 'green', 3, { white: 3, pearl: 1 }),
  makeCard('k1', 2, 'red', 3, { blue: 3, black: 2 }),
  makeCard('m1', 3, 'black', 5, { white: 4, blue: 3 }),
  makeCard('n1', 3, 'white', 4, { green: 4, red: 3 }),
  makeCard('o1', 3, 'blue', 5, { black: 4, pearl: 2 }),
  makeCard('a2', 1, 'white', 1, { blue: 1 }),
  makeCard('b2', 1, 'blue', 1, { green: 1 }),
  makeCard('c2', 1, 'green', 2, { red: 1 }),
  makeCard('d2', 1, 'red', 0, { white: 1 }),
  makeCard('e2', 1, 'black', 1, { blue: 1 }),
  makeCard('f2', 1, 'white', 2, { black: 1 }),
  makeCard('g2', 1, 'blue', 0, { green: 1 })
]

const createCardDetails = (): Record<string, DevelopmentCard> => Object.fromEntries(
  cards.map(card => [card.id, { ...card, cost: { ...card.cost }, effects: [...card.effects] }])
)

const makePlayer = (overrides: Partial<Player>): Player => ({
  id: 'player-local',
  name: '本地玩家',
  gems: {},
  bonus: {},
  reservedCards: [],
  developmentCards: [],
  privilegeTokens: 0,
  crowns: 0,
  nobles: [],
  points: 0,
  isHost: false,
  lastActive: timestamp,
  ...overrides
})

export interface GameVisualFixture {
  currentPlayer: CurrentPlayer
  room: Room
  chatMessages: ChatHistoryEntry[]
  gameHistory: GameHistoryEntry[]
}

export const createGameVisualFixture = (): GameVisualFixture => {
  const cardDetails = createCardDetails()
  const players = [
    makePlayer({
      isHost: true,
      gems: { white: 3, blue: 2, green: 2, red: 2, black: 2, pearl: 1, gold: 2 },
      bonus: { white: 1, blue: 1, green: 1 },
      reservedCards: ['d2'],
      developmentCards: ['a2', 'b2', 'c2'],
      privilegeTokens: 2,
      crowns: 2,
      nobles: ['noble2'],
      points: 7
    }),
    makePlayer({
      id: 'player-opponent',
      name: '对手玩家',
      gems: { white: 1, blue: 1, green: 2, red: 3, black: 1, pearl: 1 },
      bonus: { red: 1, black: 1 },
      reservedCards: ['g2'],
      developmentCards: ['e2', 'f2'],
      privilegeTokens: 1,
      crowns: 1,
      points: 4
    })
  ]

  const gameState: GameState = {
    status: 'playing',
    currentPlayerIndex: 0,
    turnNumber: 8,
    players,
    gemBoard: [
      ['white', 'blue', 'green', 'red', 'black'],
      ['pearl', 'gold', 'white', 'blue', 'green'],
      ['red', 'black', 'pearl', 'white', 'gold'],
      ['blue', 'green', 'red', 'black', 'white'],
      ['gold', 'blue', 'green', 'red', 'black']
    ],
    gemBag: ['white', 'blue', 'green', 'red', 'black', 'pearl', 'white', 'blue'],
    availablePrivilegeTokens: 2,
    unflippedCards: { '1': 15, '2': 12, '3': 8 },
    flippedCards: {
      '1': ['a1', 'b1', 'c1', 'd1', 'e1'],
      '2': ['h1', 'i1', 'j1', 'k1'],
      '3': ['m1', 'n1', 'o1']
    },
    level1Deck: Array.from({ length: 15 }, (_, index) => `level1-${index}`),
    level2Deck: Array.from({ length: 12 }, (_, index) => `level2-${index}`),
    level3Deck: Array.from({ length: 8 }, (_, index) => `level3-${index}`),
    cardDetails,
    cardMap: cardDetails,
    availableNobles: ['noble1', 'noble2', 'noble3', 'noble4'],
    extraTurns: {},
    cardToRefill: { level: 0, index: 0 },
    refilledThisTurn: false,
    needsGemDiscard: false,
    gemDiscardTarget: 10,
    gemDiscardPlayerID: '',
    createdAt: timestamp,
    startedAt: timestamp
  }

  return {
    currentPlayer: { id: players[0].id, name: players[0].name },
    room: {
      id: 'visual-fixture-room',
      name: '视觉基线房间',
      gameState,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    chatMessages: [
      { playerId: players[1].id, playerName: players[1].name, message: '轮到你了', timestamp: new Date(timestamp) },
      { playerId: players[0].id, playerName: players[0].name, message: '正在考虑', timestamp: new Date(timestamp) }
    ],
    gameHistory: [
      { playerId: players[1].id, playerName: players[1].name, description: '拿取了三枚宝石', descriptionHtml: '', timestamp },
      { playerId: players[0].id, playerName: players[0].name, description: '购买了发展卡 a2', descriptionHtml: '购买了<span class="hist-link" data-preview="/images/cards/a2.jpg">发展卡</span> a2', timestamp },
      { playerId: players[0].id, playerName: players[0].name, description: '获得了贵族 noble2', descriptionHtml: '获得了<span class="hist-link" data-preview="/images/nobles/noble2.jpg">贵族</span> noble2', timestamp }
    ]
  }
}
