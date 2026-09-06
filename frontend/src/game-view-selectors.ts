import type { DevelopmentCard, GameState, GemType, Player } from './game-state'

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
