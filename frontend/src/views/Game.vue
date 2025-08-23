<template>
  <div class="game-container">
    <!-- 游戏头部信息 -->
    <div class="game-header">
      <div class="room-info">
        <h2>{{ currentRoom?.name || '游戏房间' }}</h2>
        <p>房间ID: {{ roomId }}</p>
      </div>
      <div class="player-info">
        <span>玩家: {{ currentPlayer?.name }}</span>
        <span :class="['status', isConnected ? 'connected' : 'disconnected']">
          {{ isConnected ? '已连接' : '未连接' }}
        </span>
      </div>
      <button @click="leaveGame" class="btn btn-secondary">离开游戏</button>
    </div>

         <!-- 游戏主体 -->
     <div class="game-main">
       <!-- 游戏版图区域 -->
       <div class="game-board-area">
         <div v-if="!gameState" class="waiting-area">
           <h3>等待其他玩家加入...</h3>
           <div class="players-list">
             <div v-for="player in waitingPlayers" :key="player.id" class="player-item">
               {{ player.name }}
             </div>
           </div>
           <button 
             v-if="canStartGame" 
             @click="startGame" 
             class="btn btn-primary"
           >
             开始游戏
           </button>
         </div>
         
         <div v-else class="game-area">
           <GameBoard
             :game-state="gameState"
             :current-player-id="currentPlayer?.id"
             @gem-selected="handleGemSelected"
             @card-selected="handleCardSelected"
             @noble-selected="handleNobleSelected"
           />
         </div>
       </div>

       <!-- 底部面板区域 -->
       <div class="bottom-panels">
         <!-- 聊天面板 -->
         <div class="chat-panel">
           <h3>聊天</h3>
           <div class="chat-messages" ref="chatMessagesRef">
             <div 
               v-for="(message, index) in chatMessages" 
               :key="index" 
               class="chat-message"
               :class="{ 'own-message': message.playerId === currentPlayer?.id }"
             >
               <span class="player-name">{{ message.playerName }}:</span>
               <span class="message-text">{{ message.message }}</span>
             </div>
           </div>
           <div class="chat-input">
             <input 
               v-model="newMessage" 
               @keyup.enter="sendMessage"
               placeholder="输入消息..."
               maxlength="100"
             />
             <button @click="sendMessage" class="btn btn-primary">发送</button>
           </div>
         </div>

         <!-- 历史记录面板 -->
         <div class="history-panel">
           <h3>操作历史</h3>
           <div class="history-list">
             <div 
               v-for="(action, index) in gameHistory" 
               :key="index" 
               class="history-item"
             >
               <span class="action-time">{{ formatTime(action.timestamp) }}</span>
               <span class="action-player">{{ action.playerName }}</span>
               <span class="action-text">{{ action.description }}</span>
             </div>
           </div>
         </div>
       </div>
     </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import GameBoard from '../components/GameBoard.vue'

const props = defineProps({
  roomId: {
    type: String,
    required: true
  }
})

const router = useRouter()
const gameStore = useGameStore()

const newMessage = ref('')
const chatMessagesRef = ref(null)
const waitingPlayers = ref([])

// 从 store 获取状态
const { 
  currentRoom, 
  currentPlayer, 
  gameState, 
  isConnected, 
  chatMessages, 
  gameHistory 
} = gameStore

// 计算属性
const canStartGame = computed(() => {
  return waitingPlayers.value.length >= 2 && 
         currentPlayer.value?.id === waitingPlayers.value[0]?.id
})

// 发送聊天消息
const sendMessage = () => {
  if (newMessage.value.trim()) {
    gameStore.sendChatMessage(newMessage.value)
    newMessage.value = ''
    scrollToBottom()
  }
}

// 滚动到聊天底部
const scrollToBottom = async () => {
  await nextTick()
  if (chatMessagesRef.value) {
    chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
  }
}

// 开始游戏
const startGame = () => {
  gameStore.performGameAction({
    type: 'start_game'
  })
}

// 离开游戏
const leaveGame = () => {
  gameStore.disconnect()
  router.push('/')
}

// 处理宝石选择
const handleGemSelected = (gemType) => {
  gameStore.performGameAction({
    type: 'take_gems',
    gemType: gemType
  })
}

// 处理发展卡选择
const handleCardSelected = (card) => {
  gameStore.performGameAction({
    type: 'buy_card',
    cardId: card.id
  })
}

// 处理贵族卡选择
const handleNobleSelected = (noble) => {
  gameStore.performGameAction({
    type: 'claim_noble',
    nobleId: noble.id
  })
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

// 生命周期
onMounted(async () => {
  // 连接 WebSocket
  gameStore.connectWebSocket(props.roomId)
  
  // 模拟等待玩家（实际应该从 WebSocket 获取）
  waitingPlayers.value = [
    { id: currentPlayer.value?.id, name: currentPlayer.value?.name }
  ]
})

onUnmounted(() => {
  gameStore.disconnect()
})

// 监听聊天消息变化，自动滚动
watch(chatMessages, () => {
  scrollToBottom()
}, { deep: true })
</script>

<style scoped>
.game-container {
  min-height: 100vh;
  background: #f8f9fa;
}

.game-header {
  background: white;
  padding: 16px 24px;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.room-info h2 {
  margin: 0;
  color: #495057;
}

.room-info p {
  margin: 4px 0 0 0;
  color: #6c757d;
  font-size: 14px;
}

.player-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.status {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.status.connected {
  background: #d4edda;
  color: #155724;
}

.status.disconnected {
  background: #f8d7da;
  color: #721c24;
}

 .game-main {
   display: flex;
   flex-direction: column;
   gap: 24px;
   padding: 24px;
   max-width: 1400px;
   margin: 0 auto;
 }

 .game-board-area {
   background: white;
   border-radius: 12px;
   padding: 24px;
   box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
   min-height: 600px;
 }

.waiting-area {
  text-align: center;
  padding: 60px 20px;
}

.players-list {
  margin: 24px 0;
}

.player-item {
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  margin: 8px 0;
  border: 2px solid #dee2e6;
}

 .bottom-panels {
   display: flex;
   gap: 24px;
 }

.chat-panel, .history-panel {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.chat-panel h3, .history-panel h3 {
  margin: 0 0 16px 0;
  color: #495057;
  border-bottom: 2px solid #e9ecef;
  padding-bottom: 8px;
}

.chat-messages {
  height: 300px;
  overflow-y: auto;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  background: #f8f9fa;
}

.chat-message {
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 8px;
  background: white;
}

.chat-message.own-message {
  background: #e3f2fd;
  text-align: right;
}

.player-name {
  font-weight: 600;
  color: #495057;
  margin-right: 8px;
}

.message-text {
  color: #212529;
}

.chat-input {
  display: flex;
  gap: 8px;
}

.chat-input input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #dee2e6;
  border-radius: 6px;
}

.chat-input button {
  padding: 8px 16px;
  font-size: 14px;
}

.history-list {
  height: 200px;
  overflow-y: auto;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 12px;
  background: #f8f9fa;
}

.history-item {
  padding: 8px;
  border-bottom: 1px solid #e9ecef;
  font-size: 14px;
}

.history-item:last-child {
  border-bottom: none;
}

.action-time {
  color: #6c757d;
  font-size: 12px;
  margin-right: 8px;
}

.action-player {
  font-weight: 600;
  color: #495057;
  margin-right: 8px;
}

.action-text {
  color: #212529;
}

.game-placeholder {
  text-align: center;
  padding: 60px 20px;
  color: #6c757d;
}

 @media (max-width: 1200px) {
   .bottom-panels {
     flex-direction: column;
   }
   
   .chat-panel, .history-panel {
     width: 100%;
   }
 }

 @media (max-width: 768px) {
   .game-header {
     flex-direction: column;
     gap: 16px;
     text-align: center;
   }
   
   .bottom-panels {
     flex-direction: column;
   }
 }
</style>
