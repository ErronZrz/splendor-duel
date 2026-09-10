export type GemType = 'white' | 'blue' | 'green' | 'red' | 'black' | 'pearl' | 'gold' | 'gray'
// The backend represents a token removed from the board with an empty string.
// It is a board-cell state, not a gem that can exist in a bag, cost, or player
// inventory.
export type BoardGem = GemType | ''
export type CardEffect = 'extra_token' | 'new_turn' | 'wildcard' | 'get_privilege' | 'steal'
export type GameStatus = 'waiting' | 'waiting_for_players' | 'playing' | 'finished'
type Timestamp = string

export interface DevelopmentCard {
  id: string
  level: number
  code: string
  color: GemType
  points: number
  crowns: number
  bonus: GemType
  cost: Partial<Record<GemType, number>>
  effects: CardEffect[]
  isSpecial: boolean
  imagePath: string
}

export interface Player {
  id: string
  name: string
  gems: Partial<Record<GemType, number>>
  bonus: Partial<Record<GemType, number>>
  reservedCards: string[]
  developmentCards: string[]
  privilegeTokens: number
  crowns: number
  nobles: string[]
  points: number
  isHost: boolean
  lastActive: Timestamp
}

interface PendingRefill {
  level: number
  index: number
}

export interface GameState {
  status: GameStatus
  currentPlayerIndex: number
  turnNumber: number
  players: Player[]
  winner?: string
  victoryReasons?: string[]
  gemBoard: BoardGem[][]
  gemBag: GemType[]
  availablePrivilegeTokens: number
  unflippedCards: Record<string, number>
  flippedCards: Record<string, string[]>
  level1Deck: string[]
  level2Deck: string[]
  level3Deck: string[]
  cardDetails: Record<string, DevelopmentCard>
  cardMap: Record<string, DevelopmentCard>
  availableNobles: string[]
  extraTurns: Record<string, number>
  cardToRefill: PendingRefill
  refilledThisTurn: boolean
  needsGemDiscard: boolean
  gemDiscardTarget: number
  gemDiscardPlayerID: string
  createdAt: Timestamp
  startedAt: Timestamp
}

export interface Room {
  id: string
  name: string
  gameState: GameState
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface RoomResponseData {
  room: Room
  playerId: string
}

export type RoomAPIResponse =
  | { success: true, data: RoomResponseData, message?: string }
  | { success: false, message?: string }

export const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const gemTypes: GemType[] = ['white', 'blue', 'green', 'red', 'black', 'pearl', 'gold', 'gray']
const cardEffects: CardEffect[] = ['extra_token', 'new_turn', 'wildcard', 'get_privilege', 'steal']
const gameStatuses: GameStatus[] = ['waiting', 'waiting_for_players', 'playing', 'finished']

const isGemType = (value: unknown): value is GemType => (
  typeof value === 'string' && gemTypes.some(gemType => gemType === value)
)

const isBoardGem = (value: unknown): value is BoardGem => (
  value === '' || isGemType(value)
)

const isGameStatus = (value: unknown): value is GameStatus => (
  typeof value === 'string' && gameStatuses.some(status => status === value)
)

const isCardEffect = (value: unknown): value is CardEffect => (
  typeof value === 'string' && cardEffects.some(effect => effect === value)
)

const isStringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every(item => typeof item === 'string')
)

const isNumberRecord = (value: unknown): value is Record<string, number> => (
  isRecord(value) && Object.values(value).every(item => typeof item === 'number')
)

const isStringArrayRecord = (value: unknown): value is Record<string, string[]> => (
  isRecord(value) && Object.values(value).every(isStringArray)
)

const isDevelopmentCard = (value: unknown): value is DevelopmentCard => (
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.level === 'number' &&
  typeof value.code === 'string' &&
  isGemType(value.color) &&
  typeof value.points === 'number' &&
  typeof value.crowns === 'number' &&
  isGemType(value.bonus) &&
  isNumberRecord(value.cost) &&
  Array.isArray(value.effects) && value.effects.every(isCardEffect) &&
  typeof value.isSpecial === 'boolean' &&
  typeof value.imagePath === 'string'
)

const isDevelopmentCardRecord = (value: unknown): value is Record<string, DevelopmentCard> => (
  isRecord(value) && Object.values(value).every(isDevelopmentCard)
)

const isPlayer = (value: unknown): value is Player => (
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  isNumberRecord(value.gems) &&
  isNumberRecord(value.bonus) &&
  isStringArray(value.reservedCards) &&
  isStringArray(value.developmentCards) &&
  typeof value.privilegeTokens === 'number' &&
  typeof value.crowns === 'number' &&
  isStringArray(value.nobles) &&
  typeof value.points === 'number' &&
  typeof value.isHost === 'boolean' &&
  typeof value.lastActive === 'string'
)

export const isGameState = (value: unknown): value is GameState => (
  isRecord(value) &&
  isGameStatus(value.status) &&
  typeof value.currentPlayerIndex === 'number' &&
  typeof value.turnNumber === 'number' &&
  Array.isArray(value.players) && value.players.every(isPlayer) &&
  Array.isArray(value.gemBoard) && value.gemBoard.every(row => Array.isArray(row) && row.every(isBoardGem)) &&
  Array.isArray(value.gemBag) && value.gemBag.every(isGemType) &&
  typeof value.availablePrivilegeTokens === 'number' &&
  isNumberRecord(value.unflippedCards) &&
  isStringArrayRecord(value.flippedCards) &&
  isStringArray(value.level1Deck) &&
  isStringArray(value.level2Deck) &&
  isStringArray(value.level3Deck) &&
  isDevelopmentCardRecord(value.cardDetails) &&
  isDevelopmentCardRecord(value.cardMap) &&
  isStringArray(value.availableNobles) &&
  isNumberRecord(value.extraTurns) &&
  isRecord(value.cardToRefill) &&
  typeof value.cardToRefill.level === 'number' &&
  typeof value.cardToRefill.index === 'number' &&
  typeof value.refilledThisTurn === 'boolean' &&
  typeof value.needsGemDiscard === 'boolean' &&
  typeof value.gemDiscardTarget === 'number' &&
  typeof value.gemDiscardPlayerID === 'string' &&
  typeof value.createdAt === 'string' &&
  typeof value.startedAt === 'string'
)

// Compatibility for the deployed backend: taking the final available noble
// currently serializes the empty slice as null. Keep the core guard strict and
// normalize only this known legacy wire shape at the WebSocket boundary.
export const parseGameStateSnapshot = (value: unknown): GameState | null => {
  const normalized = isRecord(value) && value.availableNobles === null
    ? { ...value, availableNobles: [] }
    : value
  return isGameState(normalized) ? normalized : null
}

export const parseRoomSnapshot = (value: unknown): Room | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' || value.id.length === 0 ||
    typeof value.name !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null
  }
  const gameState = parseGameStateSnapshot(value.gameState)
  return gameState ? { ...value, gameState } as unknown as Room : null
}

export const parseRoomAPIResponse = (value: unknown): RoomAPIResponse | null => {
  if (!isRecord(value) || typeof value.success !== 'boolean') return null
  const message = typeof value.message === 'string' ? value.message : undefined
  if (!value.success) return { success: false, message }
  const room = isRecord(value.data) ? parseRoomSnapshot(value.data.room) : null
  if (!isRecord(value.data) || !room || typeof value.data.playerId !== 'string') {
    return null
  }
  return {
    success: true,
    message,
    data: { room, playerId: value.data.playerId }
  }
}
