import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useGameStore = defineStore('game', () => {
  // 状态
  const currentRoom = ref(null)
  const currentPlayer = ref(null)
  const gameState = ref(null)
  const isConnected = ref(false)
  const chatMessages = ref([])
  const gameHistory = ref([])
  const websocket = ref(null)

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
    const wsUrl = `ws://${window.location.hostname}:8080/ws/${roomId}`
    websocket.value = new WebSocket(wsUrl)

    websocket.value.onopen = () => {
      console.log('WebSocket 连接已建立')
      isConnected.value = true
      
      // 发送玩家信息
      websocket.value.send(JSON.stringify({
        type: 'player_join',
        playerId: currentPlayer.value.id,
        playerName: currentPlayer.value.name
      }))
    }

    websocket.value.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleWebSocketMessage(data)
    }

    websocket.value.onclose = () => {
      console.log('WebSocket 连接已关闭')
      isConnected.value = false
    }

    websocket.value.onerror = (error) => {
      console.error('WebSocket 错误:', error)
      isConnected.value = false
    }
  }

  // 处理 WebSocket 消息
  const handleWebSocketMessage = (data) => {
    console.log('收到WebSocket消息:', data)
    
    switch (data.type) {
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
            timestamp: data.action.timestamp || new Date()
          })
        }
        break
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
        // 从玩家列表中移除离开的玩家
        if (data.data && data.data.playerId && gameState.value?.players) {
          gameState.value.players = gameState.value.players.filter(p => p.id !== data.data.playerId)
        }
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
    if (websocket.value && isConnected.value) {
      websocket.value.send(JSON.stringify({
        type: 'chat_message',
        playerId: currentPlayer.value.id,
        playerName: currentPlayer.value.name,
        message: message.trim()
      }))
    }
  }

  // 执行游戏动作
  const performGameAction = (action) => {
    if (websocket.value && isConnected.value) {
      // 确保action.data存在，如果不存在则使用空对象
      const data = action.data || {}
      
      websocket.value.send(JSON.stringify({
        type: 'game_action',
        playerId: currentPlayer.value.id,
        playerName: currentPlayer.value.name,
        data: data,
        actionType: action.type
      }))
    }
  }

  // 发送游戏操作
  const sendGameAction = (actionType, data) => {
    console.log('Store: 准备发送游戏操作:', { actionType, data })
    console.log('Store: WebSocket状态:', { websocket: !!websocket.value, isConnected: isConnected.value })
    
    if (websocket.value && isConnected.value) {
      const message = {
        type: 'game_action',
        playerId: currentPlayer.value.id,
        playerName: currentPlayer.value.name,
        actionType: actionType,
        data: data
      }
      
      console.log('Store: 发送WebSocket消息:', message)
      
      try {
        websocket.value.send(JSON.stringify(message))
        console.log('Store: 游戏操作发送成功')
      } catch (error) {
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
    if (websocket.value) {
      websocket.value.close()
      websocket.value = null
    }
    isConnected.value = false
    currentRoom.value = null
    currentPlayer.value = null
    gameState.value = null
    chatMessages.value = []
    gameHistory.value = []
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
    
    // 方法
    createRoom,
    joinRoom,
    connectWebSocket,
    sendChatMessage,
    performGameAction,
    sendGameAction,
    disconnect,
    reset
  }
})
