import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { WebSocketClient } from '../websocket-client'

export const useGameStore = defineStore('game', () => {
  // 状态
  const currentRoom = ref(null)
  const currentPlayer = ref(null)
  const gameState = ref(null)
  const isConnected = ref(false)
  const chatMessages = ref([])
  const gameHistory = ref([])
  const websocket = new WebSocketClient()
  const connectionStatus = ref('disconnected')
  const pendingActions = ref({})
  const lastActionResult = ref(null)

  let activeRoomId = null
  let reconnectTimer = null
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
    reconnectAttempts += 1
    connectionStatus.value = 'reconnecting'
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connectWebSocket(activeRoomId)
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
  const createRoom = async (roomName, playerName) => {
    try {
      console.log('Store: 开始创建房间API调用')
      const response = await axios.post('/api/rooms', {
        roomName,
        playerName
      })
      
      console.log('Store: API响应完整数据:', response.data)
      
      if (response.data.success) {
        console.log('Store: 设置currentRoom:', response.data.data.room)
        console.log('Store: 设置currentPlayer:', { id: response.data.data.playerId, name: playerName })

        currentRoom.value = response.data.data.room
        currentPlayer.value = {
          id: response.data.data.playerId,
          name: playerName
        }

        // 持久化本地会话，便于断线重连
        try {
          const roomId = response.data.data.room.id
          localStorage.setItem(`sd:room:${roomId}:playerId`, response.data.data.playerId)
          localStorage.setItem(`sd:room:${roomId}:playerName`, playerName)
        } catch (e) {
          console.warn('持久化玩家身份失败:', e)
        }
        
        console.log('Store: 设置后的状态:', { currentRoom: currentRoom.value, currentPlayer: currentPlayer.value })
        
        return { success: true, roomId: response.data.data.room.id }
      } else {
        return { success: false, message: response.data.message }
      }
    } catch (error) {
      console.error('创建房间失败:', error)
      return { success: false, message: '创建房间失败' }
    }
  }

  // 加入房间
  const joinRoom = async (roomName, playerName) => {
    try {
      const response = await axios.post('/api/rooms/join', {
        roomName,
        playerName
      })
      
      if (response.data.success) {
        currentRoom.value = response.data.data.room
        currentPlayer.value = {
          id: response.data.data.playerId,
          name: playerName
        }

        // 持久化本地会话，便于断线重连
        try {
          const roomId = response.data.data.room.id
          localStorage.setItem(`sd:room:${roomId}:playerId`, response.data.data.playerId)
          localStorage.setItem(`sd:room:${roomId}:playerName`, playerName)
        } catch (e) {
          console.warn('持久化玩家身份失败:', e)
        }
        return { success: true, roomId: response.data.data.room.id }
      } else {
        return { success: false, message: response.data.message }
      }
    } catch (error) {
      console.error('加入房间失败:', error)
      return { success: false, message: '加入房间失败' }
    }
  }

  // 连接 WebSocket
  const connectWebSocket = (roomId) => {
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
          playerId: currentPlayer.value.id,
          playerName: currentPlayer.value.name
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
  const handleWebSocketMessage = (data) => {
    console.log('收到WebSocket消息:', data)
    
    switch (data.type) {
      case 'history_snapshot': {
        const chat = (data.data && data.data.chat) || []
        const history = (data.data && data.data.history) || []
        if (Array.isArray(chat)) {
          // 覆盖填充聊天记录
          chatMessages.value = chat.map(m => ({
            playerId: m.playerId,
            playerName: m.playerName,
            message: m.message,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
          }))
        }
        if (Array.isArray(history)) {
          // 覆盖填充操作历史
          gameHistory.value = history.map(a => ({
            playerId: a.playerId,
            playerName: a.playerName,
            description: a.description || `执行了${a.type}操作` ,
            descriptionHtml: a.descriptionHtml || '',
            timestamp: a.timestamp ? new Date(a.timestamp) : new Date()
          }))
        }
        break
      }
      case 'game_state_update':
        console.log('收到游戏状态更新:', data.gameState)
        if (data.gameState) {
          gameState.value = data.gameState
          console.log('游戏状态已更新:', gameState.value)
        }
        break
      case 'chat_message':
        if (data.message) {
          chatMessages.value.push({
            playerId: data.playerId,
            playerName: data.playerName,
            message: data.message,
            timestamp: new Date()
          })
        }
        break
      case 'game_action':
        if (data.action) {
          gameHistory.value.push({
            playerId: data.action.playerId,
            playerName: data.action.playerName,
            description: data.action.description || `执行了${data.action.type}操作`,
            descriptionHtml: data.action.descriptionHtml || '',
            timestamp: data.action.timestamp || new Date()
          })
        }
        break
      case 'action_result': {
        const result = data.data
        if (!result?.requestId || typeof result.success !== 'boolean') break
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
        if (data.data && data.data.playerId) {
          // 如果游戏状态还没有玩家列表，创建一个
          if (!gameState.value) {
            gameState.value = {
              status: 'waiting',
              players: []
            }
          }
          
          // 检查玩家是否已经存在
          const existingPlayer = gameState.value.players.find(p => p.id === data.data.playerId)
          if (!existingPlayer) {
            gameState.value.players.push({
              id: data.data.playerId,
              name: data.data.playerName,
              gems: {},
              bonuses: {},
              reservedCards: [],
              crowns: 0,
              privilegeTokens: 0,
              points: 0
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
        if (data.gameState) {
          gameState.value = data.gameState
        } else if (data.data && data.data.gameState) {
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
  const sendChatMessage = (message) => {
    if (isConnected.value && isSocketOpen()) {
      websocket.send({
        type: 'chat_message',
        playerId: currentPlayer.value.id,
        playerName: currentPlayer.value.name,
        message: message.trim()
      })
    }
  }

  // 执行游戏动作
  const performGameAction = (action) => {
    return sendGameAction(action.type, action.data || {})
  }

  // 发送游戏操作
  const sendGameAction = (actionType, data) => {
    console.log('Store: 准备发送游戏操作:', { actionType, data })
    console.log('Store: WebSocket状态:', { websocket: websocket.hasSocket(), isConnected: isConnected.value })
    
    if (isConnected.value && isSocketOpen()) {
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
  const restoreSession = (roomId) => {
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
