import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { WebSocketClient } from '../websocket-client'
import {
  isActionResult,
  type ActionResult,
  type ConnectionStatus,
  type PendingAction,
  type ServerMessage
} from '../protocol'
import {
  isGameState,
  isRecord,
  parseRoomAPIResponse,
  type GameState,
  type Room
} from '../game-state'

export type {
  CardEffect,
  DevelopmentCard,
  GameState,
  GameStatus,
  GemType,
  Player,
  Room
} from '../game-state'

export interface CurrentPlayer {
  id: string
  name: string
}

export interface ChatHistoryEntry {
  playerId?: string
  playerName?: string
  message: string
  timestamp: Date
}

export interface GameHistoryEntry {
  playerId?: string
  playerName?: string
  description: string
  descriptionHtml: string
  timestamp: Date | string
}

interface StoreResult {
  success: boolean
  roomId?: string
  message?: string
}

interface GameActionInput<TData = Record<string, unknown>> {
  type: string
  data?: TData
}

type PendingActions = Record<string, PendingAction>
type CompletedActionResult = ActionResult & { completedAt: number }

const toDate = (value: unknown): Date => (
  typeof value === 'string' || value instanceof Date ? new Date(value) : new Date()
)

const createWaitingGameState = (): GameState => ({
  status: 'waiting',
  currentPlayerIndex: 0,
  turnNumber: 0,
  players: [],
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
  createdAt: new Date().toISOString(),
  startedAt: '0001-01-01T00:00:00Z'
})

export const useGameStore = defineStore('game', () => {
  // 状态
  const currentRoom = ref<Room | null>(null)
  const currentPlayer = ref<CurrentPlayer | null>(null)
  const gameState = ref<GameState | null>(null)
  const isConnected = ref(false)
  const chatMessages = ref<ChatHistoryEntry[]>([])
  const gameHistory = ref<GameHistoryEntry[]>([])
  const websocket = new WebSocketClient()
  const connectionStatus = ref<ConnectionStatus>('disconnected')
  const pendingActions = ref<PendingActions>({})
  const lastActionResult = ref<CompletedActionResult | null>(null)

  let activeRoomId: string | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let shouldReconnect = false
  let lifecycleListenersAttached = false

  const isSocketOpen = () => websocket.isOpen()

  const isSocketConnecting = () => websocket.isConnecting()

  const createRequestId = () => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID()
    }
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }

  const markPendingActionsUnknown = () => {
    pendingActions.value = Object.fromEntries(
      Object.entries(pendingActions.value).map(([requestId, action]) => [
        requestId,
        { ...action, status: 'unknown' }
      ])
    )
  }

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const removeLifecycleListeners = () => {
    if (!lifecycleListenersAttached) return
    window.removeEventListener('online', reconnectImmediately)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    lifecycleListenersAttached = false
  }

  const addLifecycleListeners = () => {
    if (lifecycleListenersAttached) return
    window.addEventListener('online', reconnectImmediately)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    lifecycleListenersAttached = true
  }

  const scheduleReconnect = () => {
    if (!shouldReconnect || !activeRoomId || !currentPlayer.value || reconnectTimer !== null) return

    const delay = Math.min(1000 * (2 ** reconnectAttempts), 10000)
    const roomId = activeRoomId
    reconnectAttempts += 1
    connectionStatus.value = 'reconnecting'
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connectWebSocket(roomId)
    }, delay)
  }

  function reconnectImmediately() {
    if (!shouldReconnect || !activeRoomId || !currentPlayer.value || isSocketOpen() || isSocketConnecting()) return
    clearReconnectTimer()
    connectWebSocket(activeRoomId)
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      reconnectImmediately()
    }
  }

  // 创建房间
  const createRoom = async (roomName: string, playerName: string): Promise<StoreResult> => {
    try {
      console.log('Store: 开始创建房间API调用')
      const response = await axios.post<unknown>('/api/rooms', {
        roomName,
        playerName
      })
      const result = parseRoomAPIResponse(response.data)
      
      console.log('Store: API响应完整数据:', response.data)
      
      if (!result) throw new Error('创建房间响应无效')
      if (result.success) {
        console.log('Store: 设置currentRoom:', result.data.room)
        console.log('Store: 设置currentPlayer:', { id: result.data.playerId, name: playerName })

        currentRoom.value = result.data.room
        currentPlayer.value = {
          id: result.data.playerId,
          name: playerName
        }

        // 持久化本地会话，便于断线重连
        try {
          const roomId = result.data.room.id
          localStorage.setItem(`sd:room:${roomId}:playerId`, result.data.playerId)
          localStorage.setItem(`sd:room:${roomId}:playerName`, playerName)
        } catch (e) {
          console.warn('持久化玩家身份失败:', e)
        }
        
        console.log('Store: 设置后的状态:', { currentRoom: currentRoom.value, currentPlayer: currentPlayer.value })
        
        return { success: true, roomId: result.data.room.id }
      } else {
        return { success: false, message: result.message }
      }
    } catch (error) {
      console.error('创建房间失败:', error)
      return { success: false, message: '创建房间失败' }
    }
  }

  // 加入房间
  const joinRoom = async (roomName: string, playerName: string): Promise<StoreResult> => {
    try {
      const response = await axios.post<unknown>('/api/rooms/join', {
        roomName,
        playerName
      })
      const result = parseRoomAPIResponse(response.data)
      
      if (!result) throw new Error('加入房间响应无效')
      if (result.success) {
        currentRoom.value = result.data.room
        currentPlayer.value = {
          id: result.data.playerId,
          name: playerName
        }

        // 持久化本地会话，便于断线重连
        try {
          const roomId = result.data.room.id
          localStorage.setItem(`sd:room:${roomId}:playerId`, result.data.playerId)
          localStorage.setItem(`sd:room:${roomId}:playerName`, playerName)
        } catch (e) {
          console.warn('持久化玩家身份失败:', e)
        }
        return { success: true, roomId: result.data.room.id }
      } else {
        return { success: false, message: result.message }
      }
    } catch (error) {
      console.error('加入房间失败:', error)
      return { success: false, message: '加入房间失败' }
    }
  }

  // 连接 WebSocket
  const connectWebSocket = (roomId: string): void => {
    if (!roomId || !currentPlayer.value) {
      console.warn('WebSocket 连接缺少房间或玩家信息')
      return
    }

    if (activeRoomId === roomId && (isSocketOpen() || isSocketConnecting())) {
      return
    }

    clearReconnectTimer()
    shouldReconnect = true
    activeRoomId = roomId
    const player = currentPlayer.value
    connectionStatus.value = reconnectAttempts > 0 ? 'reconnecting' : 'connecting'
    addLifecycleListeners()

    // 使用相对路径，让 Caddy/Nginx 处理 WebSocket 升级
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/${roomId}`
    websocket.connect(wsUrl, {
      onOpen: () => {
        console.log('WebSocket 连接已建立')
        isConnected.value = true
        connectionStatus.value = 'connected'
        reconnectAttempts = 0

        // 发送玩家信息
        websocket.send({
          type: 'player_join',
          playerId: player.id,
          playerName: player.name
        })
      },
      onMessage: (data) => {
        handleWebSocketMessage(data)
      },
      onMessageError: (error) => {
        console.error('WebSocket 消息解析失败:', error)
      },
      onClose: () => {
        console.log('WebSocket 连接已关闭')
        isConnected.value = false
        connectionStatus.value = 'disconnected'
        markPendingActionsUnknown()
        scheduleReconnect()
      },
      onError: (error) => {
        console.error('WebSocket 错误:', error)
        isConnected.value = false
      }
    })
  }

  // 处理 WebSocket 消息
  const handleWebSocketMessage = (data: ServerMessage): void => {
    console.log('收到WebSocket消息:', data)
    
    switch (data.type) {
      case 'history_snapshot': {
        const snapshot = isRecord(data.data) ? data.data : {}
        const chat = snapshot.chat
        const history = snapshot.history
        if (Array.isArray(chat)) {
          // 覆盖填充聊天记录
          chatMessages.value = chat.flatMap((entry) => {
            if (!isRecord(entry) || typeof entry.message !== 'string') return []
            return [{
              playerId: typeof entry.playerId === 'string' ? entry.playerId : undefined,
              playerName: typeof entry.playerName === 'string' ? entry.playerName : undefined,
              message: entry.message,
              timestamp: toDate(entry.timestamp)
            }]
          })
        }
        if (Array.isArray(history)) {
          // 覆盖填充操作历史
          gameHistory.value = history.flatMap((entry) => {
            if (!isRecord(entry)) return []
            const actionType = typeof entry.type === 'string' ? entry.type : ''
            return [{
              playerId: typeof entry.playerId === 'string' ? entry.playerId : undefined,
              playerName: typeof entry.playerName === 'string' ? entry.playerName : undefined,
              description: typeof entry.description === 'string' && entry.description
                ? entry.description
                : `执行了${actionType}操作`,
              descriptionHtml: typeof entry.descriptionHtml === 'string' ? entry.descriptionHtml : '',
              timestamp: toDate(entry.timestamp)
            }]
          })
        }
        break
      }
      case 'game_state_update':
        console.log('收到游戏状态更新:', data.gameState)
        if (isGameState(data.gameState)) {
          gameState.value = data.gameState
          console.log('游戏状态已更新:', gameState.value)
        }
        break
      case 'chat_message':
        if (typeof data.message === 'string' && data.message) {
          chatMessages.value.push({
            playerId: typeof data.playerId === 'string' ? data.playerId : undefined,
            playerName: typeof data.playerName === 'string' ? data.playerName : undefined,
            message: data.message,
            timestamp: new Date()
          })
        }
        break
      case 'game_action':
        if (isRecord(data.action)) {
          const actionType = typeof data.action.type === 'string' ? data.action.type : ''
          gameHistory.value.push({
            playerId: typeof data.action.playerId === 'string' ? data.action.playerId : undefined,
            playerName: typeof data.action.playerName === 'string' ? data.action.playerName : undefined,
            description: typeof data.action.description === 'string' && data.action.description
              ? data.action.description
              : `执行了${actionType}操作`,
            descriptionHtml: typeof data.action.descriptionHtml === 'string' ? data.action.descriptionHtml : '',
            timestamp: typeof data.action.timestamp === 'string' ? data.action.timestamp : new Date()
          })
        }
        break
      case 'action_result': {
        const result = data.data
        if (!isActionResult(result)) break
        const pending = pendingActions.value[result.requestId]
        if (!pending || pending.actionType !== result.actionType) break
        const remaining = { ...pendingActions.value }
        delete remaining[result.requestId]
        pendingActions.value = remaining
        lastActionResult.value = {
          ...result,
          completedAt: Date.now()
        }
        break
      }
      case 'player_joined':
        console.log('玩家加入:', data.data)
        // 更新游戏状态以反映新玩家
        if (isRecord(data.data) && typeof data.data.playerId === 'string') {
          const joinedPlayer = data.data
          const joinedPlayerId: string = data.data.playerId
          // 如果游戏状态还没有玩家列表，创建一个
          if (!gameState.value) {
            gameState.value = createWaitingGameState()
          }
          
          // 检查玩家是否已经存在
          const existingPlayer = gameState.value.players.find(p => p.id === joinedPlayerId)
          if (!existingPlayer) {
            gameState.value.players.push({
              id: joinedPlayerId,
              name: typeof joinedPlayer.playerName === 'string' ? joinedPlayer.playerName : '',
              gems: {},
              bonus: {},
              reservedCards: [],
              developmentCards: [],
              crowns: 0,
              privilegeTokens: 0,
              nobles: [],
              points: 0,
              isHost: false,
              lastActive: new Date().toISOString()
            })
          }
          
          console.log('更新后的游戏状态:', gameState.value)
        }
        break
      case 'player_left':
        console.log('玩家离开:', data.data)
        // player_left 只表示当前 socket 断开，不代表玩家退出对局。
        // 房间成员始终以服务器的 game_state_update 为准。
        break
      case 'game_start':
        console.log('收到游戏开始消息:', data)
        if (isGameState(data.gameState)) {
          gameState.value = data.gameState
        } else if (isRecord(data.data) && isGameState(data.data.gameState)) {
          gameState.value = data.data.gameState
        }
        console.log('游戏开始后的状态:', gameState.value)
        break
      case 'game_end':
        console.log('游戏结束')
        break
      case 'error':
        console.error('服务器错误:', data.message)
        break
      default:
        console.log('未知消息类型:', data.type)
    }
  }

  // 发送聊天消息
  const sendChatMessage = (message: string): void => {
    if (isConnected.value && isSocketOpen() && currentPlayer.value) {
      websocket.send({
        type: 'chat_message',
        playerId: currentPlayer.value.id,
        playerName: currentPlayer.value.name,
        message: message.trim()
      })
    }
  }

  // 执行游戏动作
  const performGameAction = (action: GameActionInput): string => {
    return sendGameAction(action.type, action.data || {})
  }

  // 发送游戏操作
  const sendGameAction = (actionType: string, data: Record<string, unknown>): string => {
    console.log('Store: 准备发送游戏操作:', { actionType, data })
    console.log('Store: WebSocket状态:', { websocket: websocket.hasSocket(), isConnected: isConnected.value })
    
    if (isConnected.value && isSocketOpen() && currentPlayer.value) {
      const requestId = createRequestId()
      const message = {
        type: 'game_action',
        playerId: currentPlayer.value.id,
        playerName: currentPlayer.value.name,
        actionType: actionType,
        data: data,
        requestId
      }

      pendingActions.value = {
        ...pendingActions.value,
        [requestId]: { requestId, actionType, data, status: 'pending', sentAt: Date.now() }
      }
      
      console.log('Store: 发送WebSocket消息:', message)
      
      try {
        websocket.send(message)
        console.log('Store: 游戏操作发送成功')
        return requestId
      } catch (error) {
        const remaining = { ...pendingActions.value }
        delete remaining[requestId]
        pendingActions.value = remaining
        console.error('Store: 发送游戏操作失败:', error)
        throw error
      }
    } else {
      console.error('Store: WebSocket未连接，无法发送操作')
      throw new Error('WebSocket未连接')
    }
  }

  // 断开连接
  const disconnect = () => {
    shouldReconnect = false
    activeRoomId = null
    reconnectAttempts = 0
    clearReconnectTimer()
    removeLifecycleListeners()
    websocket.close()
    isConnected.value = false
    connectionStatus.value = 'disconnected'
    currentRoom.value = null
    currentPlayer.value = null
    gameState.value = null
    chatMessages.value = []
    gameHistory.value = []
    pendingActions.value = {}
    lastActionResult.value = null
  }

  // 从本地存储恢复玩家身份（断线重连）
  const restoreSession = (roomId: string): boolean => {
    try {
      const storedPlayerId = localStorage.getItem(`sd:room:${roomId}:playerId`)
      const storedPlayerName = localStorage.getItem(`sd:room:${roomId}:playerName`)
      if (storedPlayerId && storedPlayerName) {
        // 若当前store缺失玩家信息，则恢复
        if (!currentPlayer.value) {
          currentPlayer.value = { id: storedPlayerId, name: storedPlayerName }
        }
        // 如果未连接，则直接连接WS，服务端会按玩家ID识别为原玩家
        if (!isConnected.value) {
          connectWebSocket(roomId)
        }
        return true
      }
    } catch (e) {
      console.warn('恢复本地会话失败:', e)
    }
    return false
  }

  // 清理状态
  const reset = () => {
    disconnect()
  }

  return {
    // 状态
    currentRoom,
    currentPlayer,
    gameState,
    isConnected,
    chatMessages,
    gameHistory,
    connectionStatus,
    pendingActions,
    lastActionResult,
    
    // 方法
    createRoom,
    joinRoom,
    connectWebSocket,
    sendChatMessage,
    performGameAction,
    sendGameAction,
    disconnect,
    reset,
    restoreSession
  }
})
