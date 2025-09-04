<template>
  <div class="container">
    <div class="text-center">
      <h1 class="title">Splendor Duel</h1>
      <p class="subtitle">经典双人策略桌游的在线版本</p>
    </div>

    <div class="card">
      <h2>创建或加入房间</h2>
      
      <div class="input-group">
        <label for="roomName">房间名称</label>
        <input 
          id="roomName"
          v-model="roomName" 
          type="text" 
          placeholder="输入房间名称，例如：我的游戏"
          maxlength="20"
        />
      </div>

      <div class="input-group">
        <label for="playerName">你的名字</label>
        <input 
          id="playerName"
          v-model="playerName" 
          type="text" 
          placeholder="输入你的名字"
          maxlength="15"
        />
      </div>

      <div class="button-group">
        <button 
          @click="createRoom" 
          class="btn btn-primary"
          :disabled="!canProceed"
        >
          创建房间
        </button>
        <button 
          @click="joinRoom" 
          class="btn btn-secondary"
          :disabled="!canProceed"
        >
          加入房间
        </button>
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>
    </div>

    <div class="card">
      <h3>游戏说明</h3>
      <ul class="game-rules">
        <li>通过收集宝石代币来购买发展卡</li>
        <li>发展卡提供宝石奖励、皇冠与声望点数</li>
        <li>积累皇冠与声望点数来赢取贵族并达成胜利</li>
        <li>游戏支持实时聊天和历史操作记录</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import { storeToRefs } from 'pinia'

const router = useRouter()
const gameStore = useGameStore()

const roomName = ref('')
const playerName = ref('')
const error = ref('')

const canProceed = computed(() => {
  return roomName.value.trim() && playerName.value.trim()
})

const createRoom = async () => {
  if (!canProceed.value) return
  
  try {
    error.value = ''
    console.log('开始创建房间:', { roomName: roomName.value.trim(), playerName: playerName.value.trim() })
    
    const response = await gameStore.createRoom(roomName.value.trim(), playerName.value.trim())
    console.log('创建房间响应:', response)
    
    if (response.success) {
      console.log('房间创建成功，准备跳转到:', `/game/${response.roomId}`)
      const { currentRoom, currentPlayer } = storeToRefs(gameStore)
      console.log('当前store状态:', {
        currentRoom: currentRoom.value,
        currentPlayer: currentPlayer.value
      })
      router.push(`/game/${response.roomId}`)
    } else {
      error.value = response.message || '创建房间失败'
    }
  } catch (err) {
    console.error('创建房间出错:', err)
    error.value = '网络错误，请重试'
  }
}

const joinRoom = async () => {
  if (!canProceed.value) return
  
  try {
    error.value = ''
    const response = await gameStore.joinRoom(roomName.value.trim(), playerName.value.trim())
    if (response.success) {
      router.push(`/game/${response.roomId}`)
    } else {
      error.value = response.message || '加入房间失败'
    }
  } catch (err) {
    error.value = '网络错误，请重试'
  }
}
</script>

<style scoped>
.title {
  font-size: 3rem;
  color: white;
  margin-bottom: 1rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.subtitle {
  font-size: 1.2rem;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 3rem;
}

.button-group {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 24px;
}

.error-message {
  color: #dc3545;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 8px;
  padding: 12px;
  margin-top: 16px;
  text-align: center;
}

.game-rules {
  list-style: none;
  padding: 0;
}

.game-rules li {
  padding: 8px 0;
  border-bottom: 1px solid #eee;
  position: relative;
  padding-left: 20px;
}

.game-rules li:before {
  content: "•";
  color: #667eea;
  font-weight: bold;
  position: absolute;
  left: 0;
}

.game-rules li:last-child {
  border-bottom: none;
}

@media (max-width: 768px) {
  .button-group {
    flex-direction: column;
  }
  
  .title {
    font-size: 2rem;
  }
}
</style>
