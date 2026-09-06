import type { DevelopmentCard, GameState, GemType, Player } from './game-state'

const DISPLAYED_GEM_ORDER: readonly GemType[] = ['white', 'blue', 'green', 'red', 'black', 'pearl', 'gold']

export interface GemCount {
  type: GemType
  count: number
}

export interface PlayerTokenLayout {
  firstRow: Array<GemType | null>
  secondRow: Array<GemType | null>
  overflowRows: GemType[][]
}

const paddedTokenRow = (tokens: readonly GemType[], start: number): Array<GemType | null> =>
  Array.from({ length: 5 }, (_, index) => tokens[start + index] ?? null)

export const countGemBagByDisplayOrder = (gemBag: readonly GemType[] | null | undefined): GemCount[] => {
  if (!gemBag?.length) return []
  const counts: Partial<Record<GemType, number>> = {}
  for (const type of gemBag) counts[type] = (counts[type] ?? 0) + 1
  return DISPLAYED_GEM_ORDER
    .filter(type => (counts[type] ?? 0) > 0)
    .map(type => ({ type, count: counts[type] ?? 0 }))
}

export const buildPlayerTokenLayout = (player: Player | null | undefined): PlayerTokenLayout => {
  const tokens: GemType[] = []
  for (const type of DISPLAYED_GEM_ORDER) {
    const count = player?.gems[type] ?? 0
    for (let index = 0; index < count; index += 1) tokens.push(type)
  }
  const overflowRows: GemType[][] = []
  for (let index = 10; index < tokens.length; index += 5) {
    overflowRows.push(tokens.slice(index, index + 5))
  }
  return {
    firstRow: paddedTokenRow(tokens, 0),
    secondRow: paddedTokenRow(tokens, 5),
    overflowRows
  }
}

export const findPlayerById = (players: readonly Player[] | undefined, playerId: string | null | undefined): Player | undefined =>
  players?.find(player => player.id === playerId)

export const findOpponent = (players: readonly Player[] | undefined, playerId: string | null | undefined): Player | undefined =>
  playerId ? players?.find(player => player.id !== playerId) : undefined

export const orderPlayersLocalFirst = (players: readonly Player[] | undefined, localPlayerId: string | null | undefined): Player[] => {
  const list = players ?? []
  if (!localPlayerId) return [...list]
  return [...list.filter(player => player.id === localPlayerId), ...list.filter(player => player.id !== localPlayerId)]
}

export const getTurnPlayer = (gameState: GameState | null | undefined): Player | undefined =>
  gameState?.players[gameState.currentPlayerIndex]

export const isLocalPlayersTurn = (gameState: GameState | null | undefined, localPlayerId: string | null | undefined): boolean =>
  Boolean(gameState && localPlayerId && gameState.status !== 'finished' && getTurnPlayer(gameState)?.id === localPlayerId)

export const isPlayersTurn = (gameState: GameState | null | undefined, playerId: string): boolean =>
  getTurnPlayer(gameState)?.id === playerId

export const getFlippedCardsByLevel = (gameState: GameState | null | undefined, level: number): DevelopmentCard[] =>
  (gameState?.flippedCards[level] ?? [])
    .map(cardId => gameState?.cardDetails[cardId])
    .filter((card): card is DevelopmentCard => card !== undefined)

export const getCardLevel = (
  cardId: string | null | undefined,
  cardDetails: Readonly<Record<string, DevelopmentCard>> | null | undefined
): number => {
  if (!cardId) return 1
  const level = cardDetails?.[cardId]?.level
  if (level) return level
  if (cardId.includes('level1') || cardId.includes('_1_')) return 1
  if (cardId.includes('level2') || cardId.includes('_2_')) return 2
  if (cardId.includes('level3') || cardId.includes('_3_')) return 3
  return 1
}

export const getOwnedBonusCardIds = (
  player: Player | null | undefined,
  cardDetails: Readonly<Record<string, DevelopmentCard>> | null | undefined,
  color: GemType
): string[] => (player?.developmentCards ?? []).filter(cardId => cardDetails?.[cardId]?.bonus === color)

export const getMaxSameColorPoints = (
  player: Player | null | undefined,
  cardDetails: Readonly<Record<string, DevelopmentCard>> | null | undefined
): number => {
  const colorPoints: Partial<Record<GemType, number>> = {
    white: 0, blue: 0, green: 0, red: 0, black: 0
  }
  for (const cardId of player?.developmentCards ?? []) {
    const card = cardDetails?.[cardId]
    if (card && colorPoints[card.color] !== undefined) {
      colorPoints[card.color] = (colorPoints[card.color] ?? 0) + card.points
    }
  }
  return Math.max(...Object.values(colorPoints))
}

export const getPlayerNobleIds = (player: Player | null | undefined): string[] => player?.nobles ?? []

export const getDeckRemainingCount = (gameState: GameState | null | undefined, level: number): number =>
  gameState?.unflippedCards[level] ?? 0

export interface CardPaymentShortfall {
  canAfford: boolean
  missingGems: Record<string, number>
  totalMissing: number
  availableGold: number
}

interface PlayerPaymentState {
  gems?: Partial<Record<GemType, number>>
  bonus?: Partial<Record<GemType, number>>
}

export const calculateCardPaymentShortfall = (card: DevelopmentCard, player: PlayerPaymentState): CardPaymentShortfall => {
  const missingGems: Record<string, number> = {}
  let totalMissing = 0
  const getCount = (counts: Partial<Record<GemType, number>> | undefined, type: string): number =>
    Object.entries(counts ?? {}).find(([gemType]) => gemType === type)?.[1] ?? 0

  for (const [gemType, required = 0] of Object.entries(card.cost)) {
    const bonus = getCount(player.bonus, gemType)
    const available = getCount(player.gems, gemType)
    const actualRequired = Math.max(0, required - bonus)
    if (actualRequired > available) {
      const missing = actualRequired - available
      missingGems[gemType] = missing
      totalMissing += missing
    }
  }

  const availableGold = player.gems?.gold ?? 0
  return { canAfford: totalMissing <= availableGold, missingGems, totalMissing, availableGold }
}
