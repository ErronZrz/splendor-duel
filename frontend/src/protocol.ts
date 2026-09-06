export const connectionStatuses = [
  'disconnected',
  'connecting',
  'reconnecting',
  'connected'
] as const

export type ConnectionStatus = typeof connectionStatuses[number]

export interface ActionResult {
  requestId: string
  actionType: string
  success: boolean
  message?: string
  replayed?: boolean
}

export interface PendingAction<TData = unknown> {
  requestId: string
  actionType: string
  data: TData
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

export interface GameActionMessage<TData = unknown> {
  type: 'game_action'
  playerId: string
  playerName: string
  actionType: string
  data: TData
  requestId: string
}

export type ClientMessage<TData = unknown> =
  | PlayerJoinMessage
  | ChatMessage
  | GameActionMessage<TData>

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
