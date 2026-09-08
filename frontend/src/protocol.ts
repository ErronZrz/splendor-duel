export const connectionStatuses = [
  'disconnected',
  'connecting',
  'reconnecting',
  'connected'
] as const

export type ConnectionStatus = typeof connectionStatuses[number]

export interface ExtensiblePayload { [extension: string]: unknown }
export interface BoardPosition extends ExtensiblePayload { x: number; y: number }
export type PaymentPlan = Record<string, number>
export interface PurchaseEffects extends ExtensiblePayload {
  extraToken?: ({ selectedGem: BoardPosition; skipped?: boolean } | { selectedGem?: BoardPosition; skipped: true }) & ExtensiblePayload
  steal?: ({ gemType: string; skipped?: boolean } | { gemType?: string; skipped: true }) & ExtensiblePayload
  wildcard?: { color: string } & ExtensiblePayload
  noble?: { id: string } & ExtensiblePayload
}

export interface GameActionPayloadMap {
  start_game: ExtensiblePayload
  takeGems: { gemPositions: BoardPosition[] } & ExtensiblePayload
  buyCard: { cardId: string; paymentPlan: PaymentPlan; effects?: PurchaseEffects } & ExtensiblePayload
  reserveCard: { cardId: string; goldX: number; goldY: number } & ExtensiblePayload
  spendPrivilege: { privilegeCount: number; gemPositions: BoardPosition[] } & ExtensiblePayload
  refillBoard: ExtensiblePayload
  grantOpponentPrivilege: ExtensiblePayload
  discardGem: { gemType: string } & ExtensiblePayload
  discardGemsBatch: { gemDiscards: Record<string, number> } & ExtensiblePayload
  endTurn: ExtensiblePayload
}

export type GameActionType = keyof GameActionPayloadMap
export type GameActionInput = {
  [K in GameActionType]: { type: K; data: GameActionPayloadMap[K] }
}[GameActionType]

export interface ActionResult {
  requestId: string
  actionType: string
  success: boolean
  message?: string
  replayed?: boolean
}

export interface PendingAction {
  requestId: string
  actionType: GameActionType
  data: GameActionPayloadMap[GameActionType]
  status: 'pending' | 'unknown'
  sentAt: number
}

export interface PlayerJoinMessage {
  type: 'player_join'
  playerId: string
  playerName: string
}

export interface ChatMessage {
  type: 'chat_message'
  playerId: string
  playerName: string
  message: string
}

export type GameActionMessage<TAction extends GameActionType = GameActionType> = {
  [K in TAction]: {
    type: 'game_action'
    playerId: string
    playerName: string
    actionType: K
    data: GameActionPayloadMap[K]
    requestId: string
  }
}[TAction]

export type ClientMessage =
  | PlayerJoinMessage
  | ChatMessage
  | GameActionMessage

export interface ServerMessage {
  type: string
  playerId?: string
  playerName?: string
  actionType?: string
  requestId?: string
  data?: unknown
  message?: string
  action?: unknown
  gameState?: unknown
  [extension: string]: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

export const isActionResult = (value: unknown): value is ActionResult => (
  isRecord(value) &&
  typeof value.requestId === 'string' &&
  value.requestId.length > 0 &&
  typeof value.actionType === 'string' &&
  value.actionType.length > 0 &&
  typeof value.success === 'boolean' &&
  (value.message === undefined || typeof value.message === 'string') &&
  (value.replayed === undefined || typeof value.replayed === 'boolean')
)

export const parseWebSocketMessage = (value: unknown): ServerMessage | null => {
  if (!isRecord(value) || typeof value.type !== 'string' || value.type.length === 0) {
    return null
  }
  if (value.type === 'action_result' && !isActionResult(value.data)) {
    return null
  }
  return value as ServerMessage
}
