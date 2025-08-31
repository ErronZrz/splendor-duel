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
        <div v-if="showWaitingArea" class="waiting-area">
          <h3>等待其他玩家加入...</h3>
          <div class="debug-info">
            <p><strong>调试信息:</strong></p>
            <p>房间ID: {{ roomId }}</p>
            <p>当前玩家: {{ currentPlayer?.name || '未设置' }}</p>
            <p>房间信息: {{ currentRoom?.name || '未设置' }}</p>
            <p>连接状态: {{ isConnected ? '已连接' : '未连接' }}</p>
          </div>
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
          <button @click="debugGameState" class="btn btn-secondary" style="margin-left: 10px;">
            调试状态
          </button>
        </div>
        
        <div v-else class="game-area">
          <div class="game-layout">
            <!-- 左侧：游戏版图 -->
            <div class="game-board">
              <div class="board-header">
                <h3>游戏版图</h3>
                <div class="game-status">
                  <span>状态: {{ gameState?.status || '进行中' }}</span>
                  <span v-if="gameState?.currentPlayerIndex !== undefined">
                    当前玩家: {{ getCurrentPlayerName() }}
                  </span>
                </div>
              </div>
              
              <!-- 宝石版图 -->
              <div class="gem-board">
                <h4>宝石版图 (5x5)</h4>
                <div class="gem-grid">
                  <div 
                    v-for="(row, rowIndex) in gameState?.gemBoard || []" 
                    :key="`row-${rowIndex}`"
                    class="gem-row"
                  >
                    <div 
                      v-for="(gem, colIndex) in row" 
                      :key="`cell-${rowIndex}-${colIndex}`"
                      class="gem-cell"
                      :class="{ 'has-gem': gem }"
                    >
                      <img 
                        v-if="gem" 
                        :src="`/images/gems/${getGemImageName(gem)}.jpg`" 
                        :alt="gem"
                        class="gem-image"
                        @error="handleImageError"
                        @click="handleGemClick(rowIndex, colIndex, gem)"
                      />
                      <span v-else class="empty-cell">空</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 发展卡区域 -->
              <div class="development-cards">
                <h4>发展卡</h4>
                <div class="card-levels">
                  <div v-for="level in [3, 2, 1]" :key="level" class="card-level">
                    <h5>等级 {{ level }}</h5>
                    <div class="cards-row">
                      <div 
                        v-for="card in getCardsByLevel(level)" 
                        :key="card.id"
                        class="card-item"
                        @click="handleCardClick(card)"
                      >
                        <img 
                          :src="`/images/cards/${card.id}.jpg`" 
                          :alt="card.name"
                          class="card-image"
                          @error="handleCardImageError"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 贵族卡区域 -->
              <div class="noble-cards">
                <h4>贵族卡</h4>
                <div class="nobles-row">
                  <div 
                    v-for="nobleId in gameState?.availableNobles || []" 
                    :key="nobleId"
                    class="noble-item"
                    @click="handleNobleSelected(nobleId)"
                  >
                    <img 
                      :src="`/images/nobles/${nobleId}.jpg`" 
                      :alt="getNobleName(nobleId)"
                      class="noble-image"
                      @error="handleNobleImageError"
                    />

                  </div>
                </div>
              </div>
            </div>
            
            <!-- 右侧：玩家状态和操作 -->
            <div class="game-sidebar">
              <!-- 玩家状态 -->
              <div class="player-status">
                <h3>玩家状态</h3>
                <div class="players-list">
                  <div 
                    v-for="player in gameState?.players || []" 
                    :key="player.id"
                    class="player-card"
                    :class="{ 'current-player': player.id === currentPlayer?.id, 'active-turn': isCurrentPlayerTurn(player.id) }"
                  >
                    <div class="player-header">
                      <span class="player-name">{{ player.name }}</span>
                      <span class="player-score">{{ player.points || 0 }}分</span>
                    </div>
                    
                    <!-- 宝石 -->
                    <div class="player-gems">
                      <h5>宝石:</h5>
                      <div class="gems-list">
                        <span v-for="(count, gemType) in player.gems || {}" :key="gemType" class="gem-count">
                          {{ gemType }}: {{ count }}
                        </span>
                      </div>
                    </div>
                    
                    <!-- 奖励 -->
                    <div class="player-bonuses">
                      <h5>奖励:</h5>
                      <div class="bonuses-list">
                        <div 
                          v-for="(count, color) in player.bonus || {}" 
                          :key="color" 
                          class="bonus-item"
                          @mouseenter="showBonusTooltip($event, player.id, color)"
                          @mouseleave="hideBonusTooltip"
                        >
                          <span class="bonus-count">
                            {{ getGemDisplayName(color) }}: {{ count }}
                          </span>
                          <!-- Bonus悬停提示 -->
                          <div 
                            v-if="activeTooltip.playerId === player.id && activeTooltip.color === color"
                            class="bonus-tooltip"
                            :style="tooltipStyle"
                          >
                            <h6>{{ getGemDisplayName(color) }} Bonus ({{ count }})</h6>
                            <div class="bonus-cards">
                              <img 
                                v-for="cardId in getBonusCards(player.id, color)" 
                                :key="cardId"
                                :src="`/images/cards/${cardId}.jpg`"
                                :alt="`Bonus卡${cardId}`"
                                class="bonus-card-image"
                                @error="handleCardImageError"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <!-- 皇冠 -->
                    <div class="player-crowns">
                      <h5>皇冠: {{ player.crowns || 0 }}</h5>
                    </div>
                    
                    <!-- 特权指示物 -->
                    <div class="player-privileges">
                      <h5>特权: {{ player.privilegeTokens || 0 }}</h5>
                    </div>
                    
                    <!-- 保留的发展卡 -->
                    <div class="player-reserved-cards">
                      <h5>保留的发展卡 ({{ player.reservedCards?.length || 0 }}/3):</h5>
                      <div class="reserved-cards-list">
                        <div 
                          v-for="(cardId, index) in player.reservedCards || []" 
                          :key="index"
                          class="reserved-card-item"
                          :class="{ 'clickable': isCurrentPlayerTurn(player.id) }"
                          @click="handleReservedCardClick({ cardId, playerId: player.id })"
                        >
                          <!-- 只有卡牌所有者能看到卡牌正面；对手只能看到牌背 -->
                          <img 
                            v-if="player.id === currentPlayer?.id"
                            :src="`/images/cards/${cardId}.jpg`" 
                            :alt="`保留卡${cardId}`"
                            class="reserved-card-image"
                            @error="handleCardImageError"
                          />
                          <img 
                            v-else
                            :src="`/images/cards/back${getCardLevel(cardId)}.jpg`" 
                            :alt="`保留卡牌背`"
                            class="reserved-card-image"
                            @error="handleCardImageError"
                          />
                        </div>
                        <!-- 填充空位 -->
                        <div 
                          v-for="i in (3 - (player.reservedCards?.length || 0))" 
                          :key="`empty-${i}`"
                          class="reserved-card-item empty"
                        >
                          <div class="empty-slot">空</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 操作面板 -->
              <div class="action-panel">
                <h3>游戏操作</h3>
                <div v-if="isMyTurn" class="available-actions">
                  <button @click="handleSpendPrivilege" class="btn btn-secondary">
                    花费特权
                  </button>
                  <button @click="handleRefillBoard" class="btn btn-secondary">
                    补充版图
                  </button>
                </div>
                <div v-else class="waiting-turn">
                  <p>等待其他玩家操作...</p>
                </div>
              </div>
            </div>
          </div>
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
    
    <!-- 通知组件 -->
    <GameNotification ref="notificationRef" />
    
    <!-- 操作确认对话框 -->
    <ActionDialog
      :visible="actionDialog.visible"
      :action-type="actionDialog.actionType"
      :title="actionDialog.title"
      :message="actionDialog.message"
      :gem-board="gameState?.gemBoard || []"
      :available-privileges="getCurrentPlayerData().privilegeTokens || 0"
      :flipped-cards="gameState?.flippedCards || {}"
      :unflipped-cards="gameState?.unflippedCards || {}"
      :selected-gold-position="actionDialog.selectedGold || null"
      :initial-gem-position="actionDialog.initialGemPosition || null"
      :player-data="actionDialog.playerData || null"
      :selected-card="actionDialog.selectedCard || null"
      :card-details="gameState?.cardDetails || {}"
      :gem-discard-target="gameState?.gemDiscardTarget || 10"
      @confirm="handleActionConfirm"
      @cancel="handleActionCancel"
              @discard-gem="handleDiscardGem"
        @discard-gems-batch="handleDiscardGemsBatch"
      @reset="handleReset"
    />

    <!-- 胜利对话框（全局） -->
    <div v-if="victoryDialog.visible" class="victory-overlay">
      <div class="victory-dialog">
        <div class="victory-header">
          <h3>游戏结束</h3>
        </div>
        <div class="victory-body">
          <p>{{ victoryDialog.message }}</p>
        </div>
        <div class="victory-footer">
          <button class="btn btn-primary" @click="victoryDialog.visible = false">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import { storeToRefs } from 'pinia'
import GameNotification from '../components/GameNotification.vue'
import ActionDialog from '../components/ActionDialog.vue'

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
const notificationRef = ref(null)

// 胜利对话框
const victoryDialog = ref({ visible: false, message: '' })

// 操作对话框状态
const actionDialog = ref({
  visible: false,
  actionType: '',
  title: '',
  message: '',
  selectedCard: null
})

// 暂存需要在确认后执行的拿取宝石位置
const pendingTakeGems = ref([])
// 暂存一次购买的支付方案与卡，用于额外token二次确认后统一提交
const pendingPurchase = ref(null)
const pendingEffects = ref({})
const openedFollowupDialog = ref(false)

// 在特效确认后再检查是否需要弹出贵族选择
const maybeOpenNobleDialogAfterEffects = () => {
  const me = getCurrentPlayerData()
  const detail = gameState.value?.cardDetails?.[pendingPurchase.value?.card?.id]
  if (!me || !detail) {
    pendingPurchase.value = null
    return
  }
  const crownsBefore = me.crowns || 0
  const crownsAfter = crownsBefore + (detail.crowns || 0)
  const owned = me.nobles?.length || 0
  const canChooseNoble = (owned === 0 && crownsBefore < 3 && crownsAfter >= 3) || (owned === 1 && crownsBefore < 6 && crownsAfter >= 6)
  if (canChooseNoble) {
    actionDialog.value = {
      visible: true,
      actionType: 'chooseNoble',
      title: '选择贵族',
      message: '请选择一个可获得的贵族',
      playerData: { 
        ownedNobles: me.nobles || [],
        availableNobles: gameState.value?.availableNobles || []
      },
      selectedCard: pendingPurchase.value.card
    }
  } else {
    pendingPurchase.value = null
  }
}

// 构建窃取对话框所需数据（包含对手宝石持有情况）
const buildStealDialogPlayerData = () => {
  const players = gameState.value?.players || []
  const meId = getCurrentPlayerData()?.id
  const opponent = players.find(p => p.id !== meId) || {}
  return { opponent: { gems: opponent.gems || {} } }
}

// 在特效链条结束时决定是否弹贵族或直接购买
const maybeOpenNobleOrBuyNow = () => {
  const me = getCurrentPlayerData()
  const detail = gameState.value?.cardDetails?.[pendingPurchase.value?.card?.id]
  if (!me || !detail) {
    pendingPurchase.value = null
    pendingEffects.value = {}
    openedFollowupDialog.value = false
    return
  }
  const crownsBefore = me.crowns || 0
  const crownsAfter = crownsBefore + (detail.crowns || 0)
  const owned = me.nobles?.length || 0
  const canChooseNoble = (owned === 0 && crownsBefore < 3 && crownsAfter >= 3) || (owned === 1 && crownsBefore < 6 && crownsAfter >= 6)
  if (canChooseNoble) {
    actionDialog.value = {
      visible: true,
      actionType: 'chooseNoble',
      title: '选择贵族',
      message: '请选择一个可获得的贵族',
      playerData: { 
        ownedNobles: me.nobles || [],
        availableNobles: gameState.value?.availableNobles || []
      },
      selectedCard: pendingPurchase.value.card
    }
    openedFollowupDialog.value = true
  } else {
    executeAction('buyCard', {
      cardId: pendingPurchase.value.card.id,
      paymentPlan: pendingPurchase.value.paymentPlan || {},
      effects: pendingEffects.value
    })
    pendingPurchase.value = null
    pendingEffects.value = {}
    openedFollowupDialog.value = false
  }
}

// Bonus工具提示状态
const activeTooltip = ref({
  playerId: null,
  color: null
})

const tooltipStyle = ref({
  position: 'absolute',
  top: '0px',
  left: '0px'
})

// 使用 storeToRefs 确保响应式
const { currentRoom, currentPlayer, gameState, isConnected, chatMessages, gameHistory } = storeToRefs(gameStore)

// 添加调试信息
console.log('Game.vue 初始化:', {
  gameStore: gameStore,
  currentRoom: currentRoom?.value,
  currentPlayer: currentPlayer?.value,
  gameState: gameState?.value,
  isConnected: isConnected?.value
})

// 计算属性
const canStartGame = computed(() => {
  // 检查是否有足够的玩家，并且当前玩家是房主
  const players = gameState.value?.players || []
  return players.length >= 2 && 
        currentPlayer?.value?.id === players[0]?.id &&
        gameState.value?.status === 'waiting'
})

// 等待玩家列表（从游戏状态中获取）
const waitingPlayers = computed(() => {
  return gameState.value?.players || []
})

// 是否显示等待区域
const showWaitingArea = computed(() => {
  return !gameState.value || 
        gameState.value.status === 'waiting' || 
        gameState.value.status === 'waiting_for_players'
})

const isMyTurn = computed(() => {
  if (!gameState?.value || !currentPlayer?.value) return false
  // 游戏结束后，任何人都不能操作
  if (gameState.value.status === 'finished') return false
  const currentPlayerIndex = gameState.value.currentPlayerIndex || 0
  const players = gameState.value.players || []
  const currentGamePlayer = players[currentPlayerIndex]
  return currentGamePlayer?.id === currentPlayer.value.id
})

const getCurrentPlayerData = () => {
  if (!gameState?.value || !currentPlayer?.value) return {}
  const players = gameState.value.players || []
  return players.find(p => p.id === currentPlayer.value.id) || {}
}

// 获取对手数据
const getOpponentData = () => {
  if (!gameState?.value || !currentPlayer?.value) return {}
  const players = gameState.value.players || []
  return players.find(p => p.id !== currentPlayer.value.id) || {}
}

// 获取当前玩家名称
const getCurrentPlayerName = () => {
  if (!gameState?.value || gameState.value.currentPlayerIndex === undefined) return ''
  const players = gameState.value.players || []
  const currentPlayer = players[gameState.value.currentPlayerIndex]
  return currentPlayer?.name || '未知玩家'
}

// 检查是否是当前玩家的回合
const isCurrentPlayerTurn = (playerId) => {
  if (!gameState?.value || gameState.value.currentPlayerIndex === undefined) return false
  const players = gameState.value.players || []
  const currentPlayer = players[gameState.value.currentPlayerIndex]
  return currentPlayer?.id === playerId
}

// 根据等级获取发展卡（从后端数据中获取）
const getCardsByLevel = (level) => {
  if (!gameState?.value) return []
  
  // 直接从后端获取该等级已翻开的卡牌ID列表
  const flippedCards = gameState.value.flippedCards || {}
  const cardIds = flippedCards[level] || []
  
  // 从后端卡牌详细信息中获取完整数据
  const cardDetails = gameState.value.cardDetails || {}
  
  return cardIds.map(id => {
    const cardDetail = cardDetails[id]
    if (!cardDetail) {
      console.warn(`未找到卡牌 ${id} 的详细信息`)
      return null
    }
    
    return {
      id: cardDetail.id,
      name: `${cardDetail.code || cardDetail.id} (${cardDetail.points || 0}分)`,
      level: cardDetail.level,
      cost: cardDetail.cost,
      bonus: cardDetail.bonus,
      crowns: cardDetail.crowns,
      color: cardDetail.color,
      isSpecial: cardDetail.isSpecial
    }
  }).filter(card => card !== null)
}

// 获取宝石显示名称
const getGemDisplayName = (gemType) => {
  const gemMap = {
    'white': '白宝石',
    'blue': '蓝宝石',
    'green': '绿宝石',
    'red': '红宝石',
    'black': '黑宝石',
    'pearl': '珍珠',
    'gold': '黄金',
    'gray': '无色'
  }
  return gemMap[gemType] || gemType
}

// 获取宝石图片名称
const getGemImageName = (gemType) => {
  const gemMap = {
    'white': 'white',
    'blue': 'blue',
    'green': 'green',
    'red': 'red',
    'black': 'black',
    'pearl': 'pearl',
    'gold': 'gold'
  }
  return gemMap[gemType] || gemType
}

// 显示Bonus工具提示
const showBonusTooltip = (event, playerId, color) => {
  clearTimeout(hideTimer)
  const host = event.currentTarget // .bonus-item
  tooltipStyle.value = {
    position: 'absolute',
    top: `${host.offsetHeight + 6}px`, // 紧贴在条目下方
    left: '0px',
    zIndex: 1000
  }
  activeTooltip.value = { playerId, color }
}

// 隐藏Bonus工具提示
const hideBonusTooltip = () => {
  hideTimer = setTimeout(() => {
    activeTooltip.value = { playerId: null, color: null }
  }, 120) // 给一点时间让鼠标移到提示框
}

// 隐藏定时器
let hideTimer = null

// 获取指定玩家的指定颜色bonus卡牌列表
const getBonusCards = (playerId, color) => {
  console.log('getBonusCards 被调用:', { playerId, color, gameState: gameState?.value })
  
  if (!gameState?.value?.players || !gameState?.value?.cardDetails) {
    console.log('getBonusCards: 缺少必要数据')
    return []
  }
  
  const player = gameState.value.players.find(p => p.id === playerId)
  if (!player?.developmentCards) {
    console.log('getBonusCards: 玩家没有发展卡')
    return []
  }
  
  console.log('getBonusCards: 玩家发展卡:', player.developmentCards)
  console.log('getBonusCards: 卡牌详细信息:', gameState.value.cardDetails)
  
  // 过滤出指定颜色的发展卡
  const bonusCards = player.developmentCards.filter(cardId => {
    const cardDetail = gameState.value.cardDetails[cardId]
    console.log(`getBonusCards: 检查卡牌 ${cardId}:`, cardDetail)
    return cardDetail && cardDetail.bonus === color
  })
  
  console.log('getBonusCards: 找到的bonus卡牌:', bonusCards)
  return bonusCards
}

// 获取卡牌等级（从后端数据中获取）
const getCardLevel = (cardId) => {
  if (!cardId) return 1
  
  // 从后端卡牌详细信息中获取等级
  if (gameState?.value?.cardDetails && gameState.value.cardDetails[cardId]) {
    return gameState.value.cardDetails[cardId].level || 1
  }
  
  // 如果没有详细信息，尝试从卡牌ID推断等级
  if (cardId.includes('level1') || cardId.includes('_1_')) return 1
  if (cardId.includes('level2') || cardId.includes('_2_')) return 2
  if (cardId.includes('level3') || cardId.includes('_3_')) return 3
  
  // 默认返回等级1
  return 1
}

// 获取牌堆剩余数量（从后端数据中获取）
const getDeckRemainingCount = (level) => {
  if (!gameState?.value) return 0
  
  // 直接从后端获取未翻开的卡牌数量
  const unflippedCards = gameState.value.unflippedCards || {}
  return unflippedCards[level] || 0
}

// 获取贵族名称
const getNobleName = (nobleId) => {
  const nobleMap = {
    'noble1': '贵族1',
    'noble2': '贵族2', 
    'noble3': '贵族3',
    'noble4': '贵族4'
  }
  return nobleMap[nobleId] || `贵族${nobleId}`
}

// 获取贵族分数
const getNoblePoints = (nobleId) => {
  const pointsMap = {
    'noble1': 2,
    'noble2': 2, 
    'noble3': 2,
    'noble4': 3
  }
  return pointsMap[nobleId] || 0
}

// 处理图片加载错误
const handleImageError = (event) => {
  console.warn('宝石图片加载失败:', event.target.src)
  // 可以在这里设置默认图片或显示文本
  event.target.style.display = 'none'
  const textSpan = document.createElement('span')
  textSpan.textContent = event.target.alt || '宝石'
  textSpan.className = 'gem-text-fallback'
  event.target.parentNode.appendChild(textSpan)
}

// 处理发展卡图片加载错误
const handleCardImageError = (event) => {
  console.warn('发展卡图片加载失败:', event.target.src)
  event.target.style.display = 'none'
}

// 处理贵族卡图片加载错误
const handleNobleImageError = (event) => {
  console.warn('贵族卡图片加载失败:', event.target.src)
  event.target.style.display = 'none'
}

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
    type: 'start_game',
    data: {} // 添加空的data字段，避免后端panic
  })
}

// 离开游戏
const leaveGame = () => {
  gameStore.disconnect()
  router.push('/')
}

// 调试游戏状态
const debugGameState = () => {
  console.log('=== 调试游戏状态 ===')
  console.log('Store 状态:', {
    currentRoom: currentRoom?.value,
    currentPlayer: currentPlayer?.value,
    gameState: gameState?.value,
    isConnected: isConnected?.value
  })
  console.log('Props:', props)
  console.log('等待玩家:', waitingPlayers.value)
  console.log('==================')
}

// 处理宝石选择（简化版）
const handleGemSelected = (gemData) => {
  console.log('宝石选择:', gemData)
}

// 处理发展卡选择（简化版）
const handleCardSelected = (cardId) => {
  console.log('发展卡选择:', cardId)
}

// 处理贵族卡选择（简化版）
const handleNobleSelected = (nobleId) => {
  console.log('贵族卡选择:', nobleId)
}

// 处理拿取宝石操作
const handleTakeGems = () => {
  if (!isMyTurn.value) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '不是你的回合')
    }
    return
  }
  
  actionDialog.value = {
    visible: true,
    actionType: 'takeGems',
    title: '拿取宝石',
    message: '请选择1-3个宝石，必须在一条直线上且连续。',
    selectedCard: null
  }
}

// 处理购买发展卡操作
const handleBuyCard = () => {
  if (!isMyTurn.value) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '不是你的回合')
    }
    return
  }
  
  actionDialog.value = {
    visible: true,
    actionType: 'buyCard',
    title: '购买发展卡',
    message: '请选择要购买的发展卡。',
    selectedCard: null
  }
}

// 处理保留发展卡操作（向后端发送保留请求）
const handleReserveCard = (goldX, goldY) => {
  if (!isMyTurn.value) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '不是你的回合')
    }
    return
  }
  
  // 打开保留发展卡对话框
  // 前端只负责收集用户选择，具体保留逻辑由后端处理
  actionDialog.value = {
    visible: true,
    actionType: 'reserveCard',
    title: '保留发展卡',
    message: '请选择要保留的发展卡。',
    selectedCard: null,
    selectedGold: { x: goldX, y: goldY }
  }
}

// 处理花费特权操作（向后端发送特权请求）
const handleSpendPrivilege = () => {
  if (!isMyTurn.value) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '不是你的回合')
    }
    return
  }
  // 前置校验：本回合若已补充版图，则禁止使用特权
  if (gameState.value?.refilledThisTurn) {
    if (notificationRef.value) {
      notificationRef.value.info('不可用', '本回合已补充版图，不能使用特权指示物')
    }
    return
  }
  
  const currentPlayerData = getCurrentPlayerData()
  if (!currentPlayerData.privilegeTokens || currentPlayerData.privilegeTokens <= 0) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '你没有特权指示物')
    }
    return
  }
  
  // 打开花费特权对话框
  // 前端只负责收集用户输入，具体特权逻辑由后端处理
  actionDialog.value = {
    visible: true,
    actionType: 'spendPrivilege',
    title: '花费特权指示物',
    message: '请选择要花费的特权指示物数量和要拿取的宝石。',
    selectedCard: null
  }
}

// 处理补充版图操作（先确认对话框）
const handleRefillBoard = () => {
  if (!isMyTurn.value) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '不是你的回合')
    }
    return
  }

  // 若有状态可读，先判断袋子是否为空
  const bagCount = Array.isArray(gameState.value?.gemBag) ? gameState.value.gemBag.length : null
  if (bagCount !== null && bagCount <= 0) {
    if (notificationRef.value) {
      notificationRef.value.info('无法补充', '袋子为空，无法补充版图')
    }
    return
  }

  actionDialog.value = {
    visible: true,
    actionType: 'refillBoard',
    title: '确认补充版图',
    message: '补充版图将允许对手获得一个特权指示物，是否继续？',
    selectedCard: null
  }
}

// 处理操作对话框确认
const handleActionConfirm = (data) => {
  console.log('操作确认:', data)
  
  switch (data.actionType) {
    case 'confirmTakeGemsGrantPrivilege':
      // 在上方 switch 已处理，此处兜底
      if (pendingTakeGems.value && pendingTakeGems.value.length) {
        executeAction('grantOpponentPrivilege', {})
        executeAction('takeGems', { gemPositions: pendingTakeGems.value })
        pendingTakeGems.value = []
      }
      break
    case 'takeGems':
      console.log('向后端发送拿取宝石请求:', data.selectedGems)
      // 二次确认：3个同色或包含2个珍珠时提示对手获得P
      if (shouldGrantPrivilegeForTakeGems(data.selectedGems)) {
        actionDialog.value = {
          visible: true,
          actionType: 'confirmTakeGemsGrantPrivilege',
          title: '确认操作',
          message: getGrantPrivilegeMessage(data.selectedGems),
          selectedCard: null
        }
        // 暂存本次选择，待确认后再执行
        pendingTakeGems.value = data.selectedGems.map(g => ({ x: g.x, y: g.y }))
        return
      }
      // 正常直接执行
      executeAction('takeGems', { gemPositions: data.selectedGems.map(gem => ({ x: gem.x, y: gem.y })) })
      break
    case 'confirmTakeGemsGrantPrivilege':
      // 先让对手拿取P，再执行拿取宝石
      if (pendingTakeGems.value && pendingTakeGems.value.length) {
        executeAction('grantOpponentPrivilege', {})
        executeAction('takeGems', { gemPositions: pendingTakeGems.value })
        pendingTakeGems.value = []
      }
      break
    case 'buyCard':
      console.log('准备购买发展卡（第一步：确认支付方案）:', data.selectedCard, data.paymentPlan)
      if (!data.selectedCard?.id) {
        if (notificationRef.value) {
          notificationRef.value.error('错误', '没有选择要购买的发展卡')
        }
        return
      }
      // 暂存购买参数
      const selectedCard = data.selectedCard
      const paymentPlan = data.paymentPlan || {}
      const effects = data.effects || undefined

      // 判断是否需要额外token对话框（优先从 cardDetails 读取完整 effects）
      const detail = gameState.value?.cardDetails?.[selectedCard.id]
      const effectsArr = (detail?.effects) || (selectedCard.effects) || []
      const hasExtra = Array.isArray(effectsArr) && effectsArr.includes('extra_token')
      const hasSteal = Array.isArray(effectsArr) && effectsArr.includes('steal')
      const hasWildcard = Array.isArray(effectsArr) && effectsArr.includes('wildcard')
      if (hasExtra) {
        // 缓存购买信息，二次确认后再一次性请求
        pendingPurchase.value = { card: selectedCard, paymentPlan }
        pendingEffects.value = {}

        // 弹出额外token对话框（第二步）：重用 takeGems 视图，但限制选择1个且色彩匹配
        actionDialog.value = {
          visible: true,
          actionType: 'takeExtraToken',
          title: '选择额外 token',
          message: `请选择一个${getGemDisplayName(selectedCard.bonus || selectedCard.color)} token，若场上无${getGemDisplayName(selectedCard.bonus || selectedCard.color)} token 可点击跳过`,
          playerData: getCurrentPlayerData(),
          selectedCard: selectedCard
        }
        // 在统一确认回调中处理：见下方 'takeExtraToken'
        return
      } else if (hasSteal) {
        // 窃取对话框：展示对手可被窃取的非黄金token
        pendingPurchase.value = { card: selectedCard, paymentPlan }
        pendingEffects.value = {}
        actionDialog.value = {
          visible: true,
          actionType: 'stealToken',
          title: '选择要窃取的宝石',
          message: '请选择一种对手拥有的非黄金宝石；若没有可窃取的宝石可点击跳过',
          playerData: buildStealDialogPlayerData(),
          selectedCard: selectedCard
        }
        return
      } else if (hasWildcard) {
        // 百搭颜色对话框：依据玩家bonus可选颜色
        pendingPurchase.value = { card: selectedCard, paymentPlan }
        pendingEffects.value = {}
        actionDialog.value = {
          visible: true,
          actionType: 'chooseWildcardColor',
          title: '选择百搭颜色',
          message: '请选择一个你已拥有优惠的颜色作为本卡的百搭颜色',
          playerData: { bonus: getCurrentPlayerData()?.bonus || {} },
          selectedCard: selectedCard
        }
        return
      } else {
        // 判断是否需要选择贵族（前端判定条件）
        const me = getCurrentPlayerData()
        const crownsBefore = me?.crowns || 0
        const crownsAfter = crownsBefore + (detail?.crowns || 0)
        const owned = me?.nobles?.length || 0
        const canChooseNoble = (owned === 0 && crownsBefore < 3 && crownsAfter >= 3) || (owned === 1 && crownsBefore < 6 && crownsAfter >= 6)
        if (canChooseNoble) {
          pendingPurchase.value = { card: selectedCard, paymentPlan }
          pendingEffects.value = {}
          actionDialog.value = {
            visible: true,
            actionType: 'chooseNoble',
            title: '选择贵族',
            message: '请选择一个可获得的贵族',
            playerData: { 
            ownedNobles: me?.nobles || [],
            availableNobles: gameState.value?.availableNobles || []
          },
            selectedCard: selectedCard
          }
          return
        }
        // 无需特效/贵族，直接一次性请求
        executeAction('buyCard', {
          cardId: selectedCard.id,
          paymentPlan,
          effects: {}
        })
      }
      break
    case 'takeExtraToken':
      if (!pendingPurchase.value?.card?.id) { actionDialog.value.visible = false; break }
      pendingEffects.value = {
        ...pendingEffects.value,
        extraToken: data.selectedGems?.[0] ? { selectedGem: { x: data.selectedGems[0].x, y: data.selectedGems[0].y } } : { skipped: true }
      }
      maybeOpenNobleOrBuyNow()
      break
    case 'stealToken':
      if (!pendingPurchase.value?.card?.id) { actionDialog.value.visible = false; break }
      pendingEffects.value = {
        ...pendingEffects.value,
        steal: data.stealGemType ? { gemType: data.stealGemType } : { skipped: true }
      }
      
      // 检查是否已经选择了贵族（noble1），如果是则直接购买，不再检查贵族选择
      if (pendingEffects.value.noble?.id === 'noble1') {
        executeAction('buyCard', {
          cardId: pendingPurchase.value.card.id,
          paymentPlan: pendingPurchase.value.paymentPlan || {},
          effects: pendingEffects.value
        })
        pendingPurchase.value = null
        pendingEffects.value = {}
        openedFollowupDialog.value = false
      } else {
        // 普通的窃取效果，继续检查贵族选择
        maybeOpenNobleOrBuyNow()
      }
      break
    case 'chooseNoble':
      if (!pendingPurchase.value?.card?.id) { actionDialog.value.visible = false; break }
      pendingEffects.value = {
        ...pendingEffects.value,
        noble: { id: data.nobleId }
      }
      
      // 如果选择的是 noble1，需要先弹出窃取对话框（无论对手是否有宝石）
      if (data.nobleId === 'noble1') {
        actionDialog.value = {
          visible: true,
          actionType: 'stealToken',
          title: '选择要窃取的宝石',
          message: '请选择一种对手拥有的非黄金宝石；若没有可窃取的宝石可点击跳过',
          playerData: buildStealDialogPlayerData(),
          selectedCard: pendingPurchase.value.card
        }
        openedFollowupDialog.value = true
        return
      } else {
        // 其他贵族直接购买
        executeAction('buyCard', {
          cardId: pendingPurchase.value.card.id,
          paymentPlan: pendingPurchase.value.paymentPlan || {},
          effects: pendingEffects.value
        })
        pendingPurchase.value = null
        pendingEffects.value = {}
        openedFollowupDialog.value = false
      }
      break
    case 'chooseWildcardColor':
      if (!pendingPurchase.value?.card?.id) { actionDialog.value.visible = false; break }
      pendingEffects.value = {
        ...pendingEffects.value,
        wildcard: { color: data.wildcardColor }
      }
      // 关闭当前对话框后，再异步检查（确保UI已更新），避免被对话框closing覆盖
      setTimeout(() => {
        maybeOpenNobleOrBuyNow()
      }, 0)
      break
    case 'takeExtraToken':
      // 保留旧分支作为兜底（不应走到这里）
      break
    case 'reserveCard':
      console.log('向后端发送保留发展卡请求:', data.selectedCard, actionDialog.value.selectedGold)
      if (data.selectedCard?.type === 'deck') {
        // 从牌堆盲抽卡牌 - 向后端发送等级信息
        executeAction('reserveCard', {
          cardId: `deck_level_${data.selectedCard.level}`, // 传递等级信息
          goldX: actionDialog.value.selectedGold?.x,
          goldY: actionDialog.value.selectedGold?.y
        })
      } else {
        // 保留场上已翻开的卡牌
        executeAction('reserveCard', {
          cardId: data.selectedCard?.id,
          goldX: actionDialog.value.selectedGold?.x,
          goldY: actionDialog.value.selectedGold?.y
        })
      }
      break
    case 'spendPrivilege':
      console.log('向后端发送花费特权请求:', data.privilegeCount, data.selectedGems)
      // 向后端发送花费特权请求，让后端处理所有特权逻辑
      executeAction('spendPrivilege', {
        privilegeCount: data.privilegeCount,
        gemPositions: data.selectedGems.map(gem => ({ x: gem.x, y: gem.y }))
      })
      break
    case 'refillBoard':
      console.log('向后端发送补充版图请求')
      executeAction('refillBoard', {})
      break
    case 'discardGems':
      if (data.completed) {
        console.log('宝石丢弃完成，关闭对话框')
        // 宝石丢弃已完成，关闭对话框
        actionDialog.value.visible = false
        
        // 设置完成标志
        discardCompleted = true
        
        // 立即停止宝石丢弃对话框检查定时器
        stopDiscardDialogCheck()
        
        // 调用后端的回合结束处理，这会检查宝石数量并切换回合
        executeAction('endTurn', {})
      }
      break
  }
  
  actionDialog.value.visible = false
}

// 处理操作对话框取消
const handleActionCancel = (data) => {
  console.log('取消操作:', data)

  const canceledType = data?.actionType || actionDialog.value?.actionType

  // 如果是宝石丢弃对话框被关闭，记录状态但不重置游戏状态
  if (canceledType === 'discardGems' && data?.closed) {
    console.log('宝石丢弃对话框被关闭，但游戏状态仍需要丢弃')
    // 对话框关闭，但游戏状态仍然需要丢弃宝石
    // 设置一个定时器，定期检查是否需要重新打开对话框
    startDiscardDialogCheck()
    actionDialog.value.visible = false
    return
  }

  // noble1 场景：从贵族触发的窃取对话框，允许玩家取消并返回贵族选择
  if (canceledType === 'stealToken' && pendingEffects.value?.noble?.id === 'noble1' && pendingPurchase.value?.card?.id) {
    console.log('取消 noble1 的窃取选择，返回贵族选择对话框')
    // 清除已暂存的 noble 选择，让玩家可重新选择
    const { noble, ...rest } = pendingEffects.value
    pendingEffects.value = { ...rest }

    const me = getCurrentPlayerData()
    actionDialog.value = {
      visible: true,
      actionType: 'chooseNoble',
      title: '选择贵族',
      message: '请选择一个可获得的贵族',
      playerData: {
        ownedNobles: me?.nobles || [],
        availableNobles: gameState.value?.availableNobles || []
      },
      selectedCard: pendingPurchase.value.card
    }
    return
  }
  
  actionDialog.value.visible = false
}

// 处理丢弃宝石
const handleDiscardGem = (data) => {
  const { gemType } = data
  console.log('处理丢弃宝石:', gemType)
  
  // 向后端发送丢弃宝石请求
  executeAction('discardGem', {
    gemType: gemType
  })
}

// 处理批量丢弃宝石
const handleDiscardGemsBatch = (data) => {
  const { gemDiscards } = data
  console.log('处理批量丢弃宝石:', gemDiscards)
  
  // 向后端发送批量丢弃宝石请求
  executeAction('discardGemsBatch', {
    gemDiscards: gemDiscards
  })
}

// 处理重置宝石丢弃
const handleReset = () => {
  console.log('重置宝石丢弃选择')
  // 关闭对话框，让玩家重新开始
  actionDialog.value.visible = false
}

// 执行游戏操作（向后端发送请求）
const executeAction = (actionType, data) => {
  if (!isMyTurn.value) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '不是你的回合')
    }
    return
  }
  
  console.log('向后端发送操作:', actionType, data)
  console.log('当前回合状态:', isMyTurn.value)
  console.log('WebSocket连接状态:', gameStore.isConnected)
  
  // 向后端发送操作请求，让后端处理所有游戏逻辑
  try {
    gameStore.sendGameAction(actionType, data)
    console.log('操作请求已发送到后端')
    if (notificationRef.value) {
      notificationRef.value.success('成功', '操作请求已发送')
    }
  } catch (error) {
    console.error('发送操作请求失败:', error)
    if (notificationRef.value) {
      notificationRef.value.error('错误', '发送操作请求失败')
    }
  }
}



// 宝石丢弃对话框检查定时器
let discardDialogCheckTimer = null

// 宝石丢弃完成标志
let discardCompleted = false

// 开始宝石丢弃对话框检查
const startDiscardDialogCheck = () => {
  console.log('开始宝石丢弃对话框检查定时器')
  
  // 清除之前的定时器
  if (discardDialogCheckTimer) {
    clearInterval(discardDialogCheckTimer)
    console.log('清除之前的定时器')
  }
  
  // 设置定时器，每500ms检查一次是否需要重新打开对话框
  discardDialogCheckTimer = setInterval(() => {
    const gameState = gameStore.gameState
    console.log('定时检查宝石丢弃状态:', {
      needsGemDiscard: gameState?.needsGemDiscard,
      gemDiscardPlayerID: gameState?.gemDiscardPlayerID,
      currentPlayerID: currentPlayer.value?.id,
      dialogVisible: actionDialog.value?.visible,
      dialogType: actionDialog.value?.actionType
    })
    
    // 如果游戏状态显示不需要丢弃宝石，立即停止定时器
    if (!gameState?.needsGemDiscard) {
      console.log('游戏状态显示不需要丢弃宝石，停止定时器')
      clearInterval(discardDialogCheckTimer)
      discardDialogCheckTimer = null
      discardCompleted = false // 重置完成标志
      return
    }
    
    // 如果宝石丢弃已完成，不重新打开对话框
    if (discardCompleted) {
      console.log('宝石丢弃已完成，不重新打开对话框')
      return
    }
    
    if (gameState?.needsGemDiscard && 
        gameState?.gemDiscardPlayerID === currentPlayer.value?.id &&
        (!actionDialog.value?.visible || actionDialog.value?.actionType !== 'discardGems')) {
      
      console.log('定时检查：需要重新打开宝石丢弃对话框')
      
      // 重新打开对话框
      actionDialog.value = {
        visible: true,
        actionType: 'discardGems',
        title: '丢弃宝石',
        message: '您的宝石总数超过10个，请丢弃一些宝石',
        selectedCard: null,
        playerData: getCurrentPlayerData()
      }
      
      // 清除定时器
      clearInterval(discardDialogCheckTimer)
      discardDialogCheckTimer = null
      console.log('定时器已清除')
    }
  }, 500)
  
  console.log('定时器已设置，ID:', discardDialogCheckTimer)
}

// 停止宝石丢弃对话框检查
const stopDiscardDialogCheck = () => {
  if (discardDialogCheckTimer) {
    console.log('停止宝石丢弃对话框检查定时器，ID:', discardDialogCheckTimer)
    clearInterval(discardDialogCheckTimer)
    discardDialogCheckTimer = null
  } else {
    console.log('没有运行中的定时器需要停止')
  }
}

// 处理宝石点击（向后端发送操作请求）
const handleGemClick = (rowIndex, colIndex, gemType) => {
  if (!isMyTurn.value) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '不是你的回合')
    }
    return
  }
  
  // 如果点击的是黄金，打开保留发展卡对话框
  if (gemType === 'gold') {
    const me = getCurrentPlayerData()
    const reserved = me?.reservedCards?.length || 0
    if (reserved >= 3) {
      if (notificationRef.value) {
        notificationRef.value.error('无法保留', '已经保留 3 张发展卡')
      }
      return
    }
    handleReserveCard(rowIndex, colIndex)
  } else {
    // 如果点击的是其他宝石，直接打开拿取宝石对话框
    // 前端只负责收集用户输入，具体逻辑由后端处理
    actionDialog.value = {
      visible: true,
      actionType: 'takeGems',
      title: '拿取宝石',
      message: '选择要拿取的宝石 (1-3个，必须在一条直线上且连续)',
      selectedGold: null,
      initialGemPosition: { x: rowIndex, y: colIndex, type: gemType }
    }
  }
}

// 判断是否触发“让对手获得P”的条件
const shouldGrantPrivilegeForTakeGems = (selectedGems) => {
  if (!Array.isArray(selectedGems) || selectedGems.length === 0) return false
  // 统计颜色数量
  const colorCount = {}
  let pearlCount = 0
  for (const g of selectedGems) {
    const t = g.type
    if (t === 'pearl') pearlCount++
    colorCount[t] = (colorCount[t] || 0) + 1
  }
  // 条件1：3个同色（排除黄金）
  if (selectedGems.length === 3) {
    for (const [t, c] of Object.entries(colorCount)) {
      if (t !== 'gold' && c === 3) return true
    }
  }
  // 条件2：包含2个珍珠
  if (pearlCount >= 2) return true
  return false
}

// 生成提示文案
const getGrantPrivilegeMessage = (selectedGems) => {
  // 判断是哪种情况
  const colorCount = {}
  let pearlCount = 0
  for (const g of selectedGems) {
    const t = g.type
    if (t === 'pearl') pearlCount++
    colorCount[t] = (colorCount[t] || 0) + 1
  }
  let reason = ''
  for (const [t, c] of Object.entries(colorCount)) {
    if (t !== 'gold' && c === 3) { reason = '拿取 3 个同色宝石'; break }
  }
  if (!reason && pearlCount >= 2) reason = '拿取 2 枚珍珠'
  const msg = `${reason}将允许对手获得一个特权指示物，是否继续？`
  return msg
}

// 统一的购买发展卡点击处理函数
const handleBuyCardClick = (card, isReserved = false, playerId = null) => {
  if (!isMyTurn.value) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '不是你的回合')
    }
    return
  }

  // 如果是保留卡，需要额外验证
  if (isReserved) {
    // 检查是否为当前玩家的保留卡
    if (playerId !== getCurrentPlayerData()?.id) {
      if (notificationRef.value) {
        notificationRef.value.error('错误', '只能操作自己的保留卡')
      }
      return
    }
  }

  // 检查是否买得起这张卡（前端只做基本验证，具体逻辑由后端处理）
  const canAfford = checkCanAffordCard(card.id)
  if (!canAfford) {
    return
  }

  // 购买百搭颜色卡的附加前置判断：若卡含 wildcard 且玩家没有任何颜色的 bonus，则提示并不弹支付对话框
  const detail = gameState.value?.cardDetails?.[card.id]
  const hasWildcard = Array.isArray(detail?.effects) && detail.effects.includes('wildcard')
  if (hasWildcard) {
    const myBonus = getCurrentPlayerData()?.bonus || {}
    const bonusSum = (myBonus.white||0)+(myBonus.blue||0)+(myBonus.green||0)+(myBonus.red||0)+(myBonus.black||0)
    if (bonusSum <= 0) {
      if (notificationRef.value) {
        notificationRef.value.error('无法购买', '请在获得优惠后再购买百搭颜色发展卡')
      }
      return
    }
  }

  // 打开购买发展卡对话框
  actionDialog.value = {
    visible: true,
    actionType: 'buyCard',
    title: isReserved ? '购买保留的发展卡' : '购买发展卡',
    message: '请确认要支付的token数量',
    selectedCard: card,
    playerData: getCurrentPlayerData()
  }
}

// 处理发展卡点击（向后端发送购买请求）
const handleCardClick = (card) => {
  handleBuyCardClick(card, false)
}

// 处理保留卡点击
const handleReservedCardClick = (data) => {
  const { cardId, playerId } = data
  
  // 从卡牌详细信息中获取完整的卡牌信息
  const cardDetail = gameState.value?.cardDetails?.[cardId]
  if (!cardDetail) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '无法获取保留卡的详细信息')
    }
    return
  }
  
  // 构建保留卡对象
  const reservedCard = {
    id: cardDetail.id,
    name: `保留卡${cardDetail.id}`,
    cost: cardDetail.cost,
    bonus: cardDetail.bonus
  }
  
  // 使用统一的购买函数处理
  handleBuyCardClick(reservedCard, true, playerId)
}

// 检查玩家是否可以购买卡牌
const checkCanAffordCard = (cardId) => {
  if (!gameState?.value?.cardDetails || !getCurrentPlayerData()) {
    console.log('checkCanAffordCard: 缺少必要数据')
    return false
  }
  
  const cardDetail = gameState.value.cardDetails[cardId]
  if (!cardDetail) {
    console.log(`checkCanAffordCard: 未找到卡牌 ${cardId} 的详细信息`)
    return false
  }
  
  const player = getCurrentPlayerData()
  let totalRequired = 0
  const missingGems = {}
  
  // 计算总费用（考虑奖励优惠）
  for (const gemType in cardDetail.cost) {
    const required = cardDetail.cost[gemType]
            const bonus = player.bonus?.[gemType] || 0
    const available = player.gems?.[gemType] || 0
    const actualRequired = Math.max(0, required - bonus)
    
    if (actualRequired > 0) {
      totalRequired += actualRequired
      if (actualRequired > available) {
        missingGems[gemType] = actualRequired - available
      }
    }
  }
  
  // 检查是否有足够的黄金来补足短缺
  const availableGold = player.gems?.gold || 0
  let totalMissing = 0
  for (const gemType in missingGems) {
    totalMissing += missingGems[gemType]
  }
  
  if (totalMissing <= availableGold) {
    return true
  }
  
  // 构建缺失宝石的详细信息
  const missingDetails = []
  for (const gemType in missingGems) {
    const gemName = getGemDisplayName(gemType)
    missingDetails.push(`${gemName}×${missingGems[gemType]}`)
  }
  
  const message = `宝石不足，缺少: ${missingDetails.join(', ')}`
  
  if (notificationRef.value) {
    notificationRef.value.error('无法购买', message)
  }
  
  return false
}

// 处理操作面板事件（简化版）
const handleActionSelected = (actionData) => {
  console.log('操作选择:', actionData)
}

const handleActionConfirmed = (actionData) => {
  console.log('操作确认:', actionData)
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

// 初始化游戏的函数
const initializeGame = () => {
  if (currentPlayer.value && currentRoom.value) {
    console.log('玩家和房间信息验证通过:', {
      currentPlayer: currentPlayer.value,
      currentRoom: currentRoom.value
    })
    
    // 连接 WebSocket
    gameStore.connectWebSocket(props.roomId)
    
    // 模拟等待玩家（实际应该从 WebSocket 获取）
    // waitingPlayers.value = [
    //   { id: currentPlayer.value?.id, name: currentPlayer.value?.name }
    // ]
  }
}

// 生命周期
onMounted(async () => {
  console.log('Game.vue onMounted 执行')
  
  // 立即检查一次
  if (currentPlayer.value && currentRoom.value) {
    initializeGame()
  } else {
    console.log('等待store状态更新...')
    // 等待最多2秒让store状态更新
    let attempts = 0
    const maxAttempts = 20
    
    const checkInterval = setInterval(() => {
      attempts++
      console.log(`检查状态 (${attempts}/${maxAttempts}):`, {
        currentPlayer: currentPlayer.value,
        currentRoom: currentRoom.value
      })
      
      if (currentPlayer.value && currentRoom.value) {
        clearInterval(checkInterval)
        initializeGame()
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval)
        // 尝试从本地存储恢复并直接连接房间（断线重连）
        const restored = gameStore.restoreSession(props.roomId)
        if (!restored) {
          console.warn('没有玩家或房间信息，重定向到首页')
          router.push('/')
        }
      }
    }, 100)
  }
})

onUnmounted(() => {
  // 停止宝石丢弃对话框检查定时器
  stopDiscardDialogCheck()
  
  gameStore.disconnect()
})

// 监听聊天消息变化，自动滚动
watch(chatMessages, () => {
  scrollToBottom()
}, { deep: true })

// 监听回合变化
watch(isMyTurn, (newValue, oldValue) => {
  if (newValue !== oldValue && notificationRef.value) {
    if (newValue) {
      notificationRef.value.info('回合开始', '轮到你行动了！', 4000)
    }
  }
})

// 监听游戏状态变化
watch(gameState, (newState, oldState) => {
  if (!notificationRef.value) return
  
  // 游戏开始
  if (newState?.status === 'playing' && oldState?.status !== 'playing') {
    notificationRef.value.game('游戏开始', 'Splendor Duel 正式开始！', 5000)
  }
  
  // 游戏结束：弹出胜利对话框，禁止继续操作
  if (newState?.status === 'finished' && oldState?.status !== 'finished') {
    const winnerId = newState?.winner
    const players = newState?.players || []
    const winner = players.find(p => p.id === winnerId)
    const playerName = winner?.name || '未知玩家'
    const reasons = Array.isArray(newState?.victoryReasons) ? newState.victoryReasons : []
    const reasonsStr = reasons.length ? reasons.join('；') : '达成胜利条件'
    victoryDialog.value = {
      visible: true,
      message: `${playerName} 因为 ${reasonsStr} 获得本局游戏胜利！`
    }
  }
  
  // 检查是否需要丢弃宝石
  console.log('检查宝石丢弃状态:', {
    newNeedsDiscard: newState?.needsGemDiscard,
    oldNeedsDiscard: oldState?.needsGemDiscard,
    newGemDiscardTarget: newState?.gemDiscardTarget,
    oldGemDiscardTarget: oldState?.gemDiscardTarget,
    newGemDiscardPlayerID: newState?.gemDiscardPlayerID,
    oldGemDiscardPlayerID: oldState?.gemDiscardPlayerID,
    currentPlayerID: currentPlayer.value?.id
  })
  
  // 检查是否需要显示宝石丢弃对话框
  if (newState?.needsGemDiscard && newState.gemDiscardPlayerID === currentPlayer.value?.id) {
    // 如果对话框当前不可见，则显示它
    if (!actionDialog.value?.visible || actionDialog.value?.actionType !== 'discardGems') {
      console.log('当前玩家需要丢弃宝石，显示对话框')
      
      // 重置完成标志
      discardCompleted = false
      
      // 停止定时器检查（如果正在运行）
      stopDiscardDialogCheck()
      
      // 显示宝石丢弃对话框
      actionDialog.value = {
        visible: true,
        actionType: 'discardGems',
        title: '丢弃宝石',
        message: '您的宝石总数超过10个，请丢弃一些宝石',
        selectedCard: null,
        playerData: getCurrentPlayerData()
      }
    }
  }
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

.game-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.game-layout > *:first-child {
  flex: 1;
}

/* 游戏版图样式 */
.game-board {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #dee2e6;
}

.board-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid #e9ecef;
}

.board-header h3 {
  margin: 0;
  color: #495057;
}

.game-status {
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: #6c757d;
}

/* 宝石版图样式 */
.gem-board {
  margin-bottom: 24px;
}

.gem-board h4 {
  margin: 0 0 12px 0;
  color: #495057;
}

.gem-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 300px;
}

.gem-row {
  display: flex;
  gap: 4px;
}

.gem-cell {
  aspect-ratio: 1;
  border: 2px solid #dee2e6;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  font-size: 12px;
  font-weight: 600;
  color: #6c757d;
  width: 50px;
  height: 50px;
}

.gem-cell.has-gem {
  background: #e3f2fd;
  border-color: #2196f3;
  color: #1976d2;
}

.gem-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.gem-image:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.empty-cell {
  color: #6c757d;
  font-size: 10px;
}

.gem-text-fallback {
  color: #495057;
  font-size: 12px;
  font-weight: 600;
}

/* 发展卡样式 */
.development-cards {
  margin-bottom: 24px;
}

.development-cards h4 {
  margin: 0 0 16px 0;
  color: #495057;
}

.card-levels {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-level h5 {
  margin: 0 0 8px 0;
  color: #495057;
  font-size: 14px;
}

.cards-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.card-item {
  background: transparent;
  border: none;
  padding: 4px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.card-item:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.card-image {
  width: 80px;
  height: 120px;
  object-fit: cover;
  border-radius: 8px;
}

.card-info {
  text-align: center;
  width: 100%;
}

.card-header {
  font-weight: 600;
  color: #495057;
  margin-bottom: 4px;
  font-size: 11px;
}

.card-cost {
  font-size: 10px;
  color: #6c757d;
  margin-bottom: 4px;
}

.card-bonus {
  font-size: 10px;
  color: #28a745;
  font-weight: 600;
}

/* 贵族卡样式 */
.noble-cards {
  margin-bottom: 24px;
}

.noble-cards h4 {
  margin: 0 0 12px 0;
  color: #495057;
}

.nobles-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.noble-item {
  background: transparent;
  border: none;
  padding: 4px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.noble-item:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.noble-image {
  width: 60px;
  height: 90px;
  object-fit: cover;
  border-radius: 8px;
}

.noble-info {
  text-align: center;
  width: 100%;
}

.noble-name {
  font-weight: 600;
  color: #495057;
  margin-bottom: 4px;
  font-size: 11px;
}

.noble-points {
  font-size: 10px;
  color: #28a745;
  font-weight: 600;
}

/* 游戏侧边栏样式 */
.game-sidebar {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.player-status {
  background: white;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #dee2e6;
}

.player-status h3 {
  margin: 0 0 16px 0;
  color: #495057;
  border-bottom: 2px solid #e9ecef;
  padding-bottom: 8px;
}

.players-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.player-card {
  background: #f8f9fa;
  border: 2px solid #dee2e6;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}

.player-card.current-player {
  border-color: #2196f3;
  background: #e3f2fd;
}

.player-card.active-turn {
  border-color: #28a745;
  background: #d4edda;
  box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.2);
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.player-name {
  font-weight: 600;
  color: #495057;
}

.player-score {
  background: #28a745;
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.player-gems, .player-bonuses, .player-crowns, .player-privileges {
  margin-bottom: 8px;
}

.player-gems h5, .player-bonuses h5, .player-crowns h5, .player-privileges h5 {
  margin: 0 0 4px 0;
  font-size: 12px;
  color: #6c757d;
}

/* 保留区样式 */
.player-reserved-cards {
  margin-bottom: 8px;
}

.player-reserved-cards h5 {
  margin: 0 0 4px 0;
  font-size: 12px;
  color: #6c757d;
}

.reserved-cards-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.reserved-card-item {
  width: 40px;
  height: 60px;
  border: 2px solid #e9ecef;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  transition: all 0.3s ease;
}

.reserved-card-item.clickable {
  cursor: pointer;
}

.reserved-card-item.clickable:hover {
  border-color: #667eea;
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.reserved-card-item.empty {
  background: #f8f9fa;
  border: 2px dashed #ced4da;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reserved-card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.reserved-card-id {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 8px;
  padding: 2px;
  text-align: center;
  line-height: 1;
}

.empty-slot {
  font-size: 10px;
  color: #6c757d;
}

.gems-list, .bonuses-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.bonus-item {
  position: relative;
  cursor: pointer;
  overflow: visible; /* 确保提示框不会被裁切 */
}

.bonus-count {
  display: inline-block;
  background: #e9ecef;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  color: #495057;
  transition: background-color 0.2s ease;
}

.bonus-item:hover .bonus-count {
  background: #667eea;
  color: white;
}

.bonus-tooltip {
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 200px;
  z-index: 1000;
  /* position 由行内样式控制，确保本地定位 */
}

.bonus-tooltip h6 {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #495057;
  text-align: center;
}

.bonus-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
}

.bonus-card-image {
  width: 30px;
  height: 45px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #dee2e6;
}

.gem-count, .bonus-count {
  background: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  color: #495057;
  border: 1px solid #dee2e6;
}

/* 操作面板样式 */
.action-panel {
  background: white;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #dee2e6;
}

.action-panel h3 {
  margin: 0 0 16px 0;
  color: #495057;
  border-bottom: 2px solid #e9ecef;
  padding-bottom: 8px;
}

.available-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.available-actions .btn {
  width: 100%;
  text-align: left;
  padding: 12px;
  font-size: 14px;
}

.waiting-turn {
  text-align: center;
  color: #6c757d;
  font-style: italic;
}

.game-board-placeholder, .action-panel-placeholder {
  background: #f8f9fa;
  border: 2px dashed #dee2e6;
  border-radius: 12px;
  padding: 40px;
  text-align: center;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.game-board-placeholder h3, .action-panel-placeholder h3 {
  margin: 0 0 16px 0;
  color: #495057;
}

.game-board-placeholder p, .action-panel-placeholder p {
  margin: 8px 0;
  color: #6c757d;
  font-size: 14px;
}

.waiting-area {
  text-align: center;
  padding: 60px 20px;
}

.debug-info {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 16px;
  margin: 20px 0;
  text-align: left;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}

.debug-info p {
  margin: 4px 0;
  font-size: 14px;
  color: #495057;
}

.debug-info strong {
  color: #6c757d;
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
  .game-layout {
    flex-direction: column;
  }
  
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
.victory-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.victory-dialog {
  background: #ffffff;
  border-radius: 12px;
  padding: 20px 24px;
  max-width: 420px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
}
.victory-header h3 { margin: 0 0 8px 0; }
.victory-body { margin: 8px 0 16px 0; font-size: 14px; color: #333; }
.victory-footer { text-align: right; }

</style>
