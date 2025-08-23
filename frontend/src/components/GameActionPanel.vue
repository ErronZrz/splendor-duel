<template>
  <div class="game-action-panel">
    <div class="panel-header">
      <h3>游戏操作</h3>
      <div class="current-turn" v-if="gameState">
        <span class="turn-indicator" :class="{ 'my-turn': isMyTurn }">
          {{ isMyTurn ? '你的回合' : '对手回合' }}
        </span>
      </div>
    </div>

    <div class="action-sections">
      <!-- 可选行动 -->
      <div class="action-section">
        <h4>可选行动 (0-2个)</h4>
        <div class="action-buttons">
          <button 
            class="action-btn optional"
            :disabled="!canSpendPrivilege"
            @click="spendPrivilege"
            title="花费特权指示物从版图选择宝石"
          >
            <div class="btn-icon">🎖️</div>
            <div class="btn-text">
              <div>花费特权</div>
              <div class="btn-desc">选择宝石</div>
            </div>
          </button>
          
          <button 
            class="action-btn optional"
            @click="refillBoard"
            title="补充版图，对手获得特权指示物"
          >
            <div class="btn-icon">🔄</div>
            <div class="btn-text">
              <div>补充版图</div>
              <div class="btn-desc">对手得特权</div>
            </div>
          </button>
        </div>
      </div>

      <!-- 强制行动 -->
      <div class="action-section">
        <h4>强制行动 (选择1个)</h4>
        <div class="action-buttons">
          <button 
            class="action-btn mandatory"
            :disabled="!canTakeGems"
            @click="toggleTakeGems"
            :class="{ 'active': actionMode === 'take_gems' }"
          >
            <div class="btn-icon">💎</div>
            <div class="btn-text">
              <div>拿取宝石</div>
              <div class="btn-desc">1-3个连续</div>
            </div>
          </button>
          
          <button 
            class="action-btn mandatory"
            :disabled="!canBuyCard"
            @click="toggleBuyCard"
            :class="{ 'active': actionMode === 'buy_card' }"
          >
            <div class="btn-icon">🃏</div>
            <div class="btn-text">
              <div>购买发展卡</div>
              <div class="btn-desc">从场上或保留</div>
            </div>
          </button>
          
          <button 
            class="action-btn mandatory"
            :disabled="!canReserveCard"
            @click="toggleReserveCard"
            :class="{ 'active': actionMode === 'reserve_card' }"
          >
            <div class="btn-icon">📚</div>
            <div class="btn-text">
              <div>保留发展卡</div>
              <div class="btn-desc">拿黄金</div>
            </div>
          </button>
        </div>
      </div>

      <!-- 当前选择的动作说明 -->
      <div v-if="actionMode" class="action-description">
        <div class="desc-header">{{ getActionDescription() }}</div>
        <div class="desc-content">{{ getActionInstructions() }}</div>
        
        <!-- 确认/取消按钮 -->
        <div class="action-controls">
          <button 
            class="btn btn-primary" 
            @click="confirmAction"
            :disabled="!canConfirmAction"
          >
            确认操作
          </button>
          <button 
            class="btn btn-secondary" 
            @click="cancelAction"
          >
            取消
          </button>
        </div>
      </div>

      <!-- 胜利条件显示 -->
      <div class="victory-conditions">
        <h4>胜利条件</h4>
        <div class="conditions-list">
          <div class="condition">
            <span class="condition-icon">🏆</span>
            <span>20分获胜</span>
          </div>
          <div class="condition">
            <span class="condition-icon">👑</span>
            <span>10皇冠获胜</span>
          </div>
          <div class="condition">
            <span class="condition-icon">🎨</span>
            <span>单色10bonus获胜</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  gameState: {
    type: Object,
    default: () => ({})
  },
  currentPlayer: {
    type: Object,
    default: () => ({})
  },
  isMyTurn: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['action-selected', 'action-confirmed'])

const actionMode = ref('')
const selectedGems = ref([])
const selectedCard = ref(null)

// 计算属性
const canSpendPrivilege = computed(() => {
  return props.currentPlayer?.privilegeTokens > 0
})

const canTakeGems = computed(() => {
  // 检查版图上是否有非黄金宝石
  if (!props.gameState?.gemBoard) return false
  
  for (let row of props.gameState.gemBoard) {
    for (let gem of row) {
      if (gem && gem !== 'gold') return true
    }
  }
  return false
})

const canBuyCard = computed(() => {
  // 检查玩家是否有足够资源购买任何卡牌
  return true // 简化处理
})

const canReserveCard = computed(() => {
  // 检查是否可以预购：少于3张保留卡且版图有黄金
  const reservedCount = props.currentPlayer?.reservedCards?.length || 0
  if (reservedCount >= 3) return false
  
  // 检查版图是否有黄金
  if (!props.gameState?.gemBoard) return false
  
  for (let row of props.gameState.gemBoard) {
    for (let gem of row) {
      if (gem === 'gold') return true
    }
  }
  return false
})

const canConfirmAction = computed(() => {
  switch (actionMode.value) {
    case 'take_gems':
      return selectedGems.value.length >= 1 && selectedGems.value.length <= 3
    case 'buy_card':
      return selectedCard.value !== null
    case 'reserve_card':
      return selectedCard.value !== null
    default:
      return false
  }
})

// 方法
const spendPrivilege = () => {
  emit('action-selected', {
    type: 'spend_privilege',
    data: {}
  })
}

const refillBoard = () => {
  emit('action-selected', {
    type: 'refill_board',
    data: {}
  })
}

const toggleTakeGems = () => {
  if (actionMode.value === 'take_gems') {
    cancelAction()
  } else {
    actionMode.value = 'take_gems'
    selectedGems.value = []
  }
}

const toggleBuyCard = () => {
  if (actionMode.value === 'buy_card') {
    cancelAction()
  } else {
    actionMode.value = 'buy_card'
    selectedCard.value = null
  }
}

const toggleReserveCard = () => {
  if (actionMode.value === 'reserve_card') {
    cancelAction()
  } else {
    actionMode.value = 'reserve_card'
    selectedCard.value = null
  }
}

const confirmAction = () => {
  const actionData = {
    type: actionMode.value,
    data: {}
  }

  switch (actionMode.value) {
    case 'take_gems':
      actionData.data.gemPositions = selectedGems.value
      break
    case 'buy_card':
      actionData.data.cardId = selectedCard.value
      break
    case 'reserve_card':
      actionData.data.cardId = selectedCard.value
      break
  }

  emit('action-confirmed', actionData)
  cancelAction()
}

const cancelAction = () => {
  actionMode.value = ''
  selectedGems.value = []
  selectedCard.value = null
}

const getActionDescription = () => {
  switch (actionMode.value) {
    case 'take_gems':
      return '拿取宝石'
    case 'buy_card':
      return '购买发展卡'
    case 'reserve_card':
      return '保留发展卡'
    default:
      return ''
  }
}

const getActionInstructions = () => {
  switch (actionMode.value) {
    case 'take_gems':
      return '请在版图上选择1-3个连续的宝石（不能是黄金）'
    case 'buy_card':
      return '请选择场上翻开的发展卡或你保留的发展卡'
    case 'reserve_card':
      return '请选择场上的发展卡进行保留，并拿取一个黄金token'
    default:
      return ''
  }
}
</script>

<style scoped>
.game-action-panel {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  min-width: 300px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e9ecef;
}

.panel-header h3 {
  margin: 0;
  color: #495057;
}

.turn-indicator {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  background: #f8f9fa;
  color: #6c757d;
  transition: all 0.3s ease;
}

.turn-indicator.my-turn {
  background: linear-gradient(45deg, #667eea, #764ba2);
  color: white;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

.action-sections {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.action-section h4 {
  margin: 0 0 12px 0;
  color: #6c757d;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: left;
}

.action-btn:hover:not(:disabled) {
  border-color: #667eea;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
}

.action-btn.active {
  border-color: #667eea;
  background: #f8f9ff;
}

.action-btn.optional {
  border-left: 4px solid #28a745;
}

.action-btn.mandatory {
  border-left: 4px solid #dc3545;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #f8f9fa;
}

.btn-icon {
  font-size: 24px;
  min-width: 32px;
  text-align: center;
}

.btn-text {
  flex: 1;
}

.btn-text > div:first-child {
  font-weight: 600;
  color: #495057;
  margin-bottom: 2px;
}

.btn-desc {
  font-size: 12px;
  color: #6c757d;
}

.action-description {
  background: #f8f9ff;
  border: 2px solid #667eea;
  border-radius: 8px;
  padding: 16px;
  margin-top: 12px;
}

.desc-header {
  font-weight: 600;
  color: #495057;
  margin-bottom: 8px;
}

.desc-content {
  font-size: 14px;
  color: #6c757d;
  margin-bottom: 16px;
  line-height: 1.5;
}

.action-controls {
  display: flex;
  gap: 12px;
}

.action-controls .btn {
  flex: 1;
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #5a67d8;
}

.btn-primary:disabled {
  background: #cbd5e0;
  cursor: not-allowed;
}

.btn-secondary {
  background: #e2e8f0;
  color: #4a5568;
}

.btn-secondary:hover {
  background: #cbd5e0;
}

.victory-conditions {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 16px;
}

.victory-conditions h4 {
  margin: 0 0 12px 0;
  color: #495057;
  font-size: 14px;
}

.conditions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.condition {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #6c757d;
}

.condition-icon {
  font-size: 16px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .game-action-panel {
    min-width: auto;
    width: 100%;
  }
  
  .panel-header {
    flex-direction: column;
    gap: 8px;
  }
  
  .action-controls {
    flex-direction: column;
  }
}
</style>
