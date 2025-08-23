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
      const response = await axios.post('/api/rooms', {
        roomName,
        playerName
      })
      
      if (response.data.success) {
        currentRoom.value = response.data.room
        currentPlayer.value = {
          id: response.data.playerId,
          name: playerName
        }
        return { success: true, roomId: response.data.room.id }
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
        currentRoom.value = response.data.room
        currentPlayer.value = {
          id: response.data.playerId,
          name: playerName
        }
        return { success: true, roomId: response.data.room.id }
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
    switch (data.type) {
      case 'game_state_update':
        gameState.value = data.gameState
        break
      case 'chat_message':
        chatMessages.value.push(data.message)
        break
      case 'game_action':
        gameHistory.value.push(data.action)
        break
      case 'player_joined':
        // 处理玩家加入
        break
      case 'player_left':
        // 处理玩家离开
        break
      case 'game_start':
        // 游戏开始
        break
      case 'game_end':
        // 游戏结束
        break
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
      websocket.value.send(JSON.stringify({
        type: 'game_action',
        playerId: currentPlayer.value.id,
        action: action
      }))
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
    disconnect,
    reset
  }
})
