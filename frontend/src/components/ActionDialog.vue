<template>
  <div v-if="visible" class="dialog-overlay" @click="handleOverlayClick">
    <div class="dialog-content" @click.stop>
      <div class="dialog-header">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="handleCancel">&times;</button>
      </div>
      
      <div class="dialog-body">
        <p>{{ message }}</p>
        
                 <!-- 拿取宝石操作 -->
         <div v-if="actionType === 'takeGems'" class="gem-selection">
            <h4>选择宝石 (1-3个，必须在一条直线上且连续)</h4>
            <div class="gem-selection-controls">
              <button 
                v-if="selectedGems.length > 0"
                @click="clearSelectedGems" 
                class="clear-btn"
              >
                清除选择
              </button>
            </div>
            <div class="gem-grid-preview">
              <div v-for="(row, rowIndex) in gemBoard" :key="rowIndex" class="gem-row">
                <div 
                  v-for="(gem, colIndex) in row" 
                  :key="colIndex"
                  class="gem-cell"
                  :class="{ 
                    'has-gem': gem, 
                    'selected': isGemSelected(rowIndex, colIndex),
                    'clickable': gem && !isGemSelected(rowIndex, colIndex) && selectedGems.length < 3 && gem !== 'gold'
                  }"
                  @click="selectGem(rowIndex, colIndex, gem)"
                >
                  <img 
                    v-if="gem" 
                    :src="`/images/gems/${getGemImageName(gem)}.jpg`" 
                    :alt="gem"
                    class="gem-image"
                  />
                  <span v-else class="empty-cell">空</span>
                </div>
              </div>
            </div>
          </div>
        
        <!-- 购买发展卡操作 -->
        <div v-if="actionType === 'buyCard'" class="card-selection">
          <h4>购买发展卡</h4>
          <div class="buy-card-content">
            <!-- 左侧：卡牌展示 -->
            <div class="card-preview-section">
              <img 
                :src="`/images/cards/${selectedCard?.id}.jpg`" 
                :alt="selectedCard?.name" 
                class="card-preview-large"
                @error="handleCardImageError"
              />
            </div>
            
            <!-- 右侧：支付方案 -->
            <div class="payment-section">
              <h5>支付方案</h5>
              
              <!-- 第一行：应支付的token -->
              <div class="payment-row">
                <div class="payment-label">应支付:</div>
                <div class="token-display">
                  <div 
                    v-for="(entry, index) in requiredTokenEntries" 
                    :key="`required-${index}-${entry[0]}`"
                    class="token-item"
                  >
                    <img 
                      :src="`/images/gems/${getGemImageName(entry[0])}.jpg`" 
                      :alt="entry[0]"
                      class="token-icon"
                      @error="handleGemImageError"
                    />
                    <span class="token-count">{{ entry[1] }}</span>
                  </div>
                </div>
              </div>
              
              <!-- 第二行：系统建议支付 -->
              <div class="payment-row">
                <div class="payment-label">建议支付:</div>
                <div class="token-display">
                  <div 
                    v-for="(entry, index) in suggestedPaymentEntries" 
                    :key="`suggested-${index}-${entry[0]}`"
                    class="token-item"
                    :class="{ 'clickable': entry[0] !== 'gold' && canConvertToGold(entry[0]) }"
                    @click="convertToGold(entry[0])"
                  >
                    <img 
                      :src="`/images/gems/${getGemImageName(entry[0])}.jpg`" 
                      :alt="entry[0]"
                      class="token-icon"
                      @error="handleGemImageError"
                    />
                    <span class="token-count">{{ entry[1] }}</span>
                  </div>
                </div>
              </div>
              
              <!-- 第三行：购买后剩余 -->
              <div class="payment-row">
                <div class="payment-label">购买后剩余:</div>
                <div class="token-display">
                  <div 
                    v-for="gemType in ['white', 'blue', 'green', 'red', 'black', 'pearl', 'gold']" 
                    :key="gemType"
                    class="token-item"
                  >
                    <img 
                      :src="`/images/gems/${gemType}.jpg`" 
                      :alt="gemType"
                      class="token-icon"
                      @error="handleGemImageError"
                    />
                    <span class="token-count">{{ getRemainingTokens(gemType) }}</span>
                  </div>
                </div>
              </div>
              
              <div class="payment-note">
                <p>💡 点击建议支付中的非黄金token可以转换为黄金支付</p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 保留发展卡操作 -->
        <div v-if="actionType === 'reserveCard'" class="reserve-selection">
          <h4>选择要保留的发展卡</h4>
          
          <!-- 按等级显示卡牌和牌堆 -->
          <div class="cards-by-level">
            <div 
              v-for="level in [3, 2, 1]" 
              :key="level" 
              class="level-section"
            >
              <h5>等级 {{ level }}</h5>
              <div class="level-content">
                <!-- 牌堆（左侧） -->
                <div class="deck-section">
                  <div class="deck-cards-grid">
                    <div 
                      v-if="getUnflippedCount(level) > 0"
                      class="deck-card-item"
                      :class="{ 'selected': selectedCard && selectedCard.type === 'deck' && selectedCard.level === level }"
                      @click="selectDeckCard(level)"
                    >
                      <img 
                        :src="`/images/cards/back${level}.jpg`" 
                        :alt="`等级${level}牌背`"
                        class="card-image"
                        @error="handleCardImageError"
                      />
                      <div class="deck-card-label">牌堆</div>
                    </div>
                  </div>
                </div>
                
                <!-- 已翻开的卡牌（右侧） -->
                <div class="field-cards-section">
                  <div class="cards-grid">
                    <div 
                      v-for="card in getCardsByLevel(level)" 
                      :key="card.id"
                      class="card-item"
                      :class="{ 'selected': selectedCard && selectedCard.id === card.id }"
                      @click="selectCard(card)"
                    >
                      <img 
                        :src="`/images/cards/${card.id}.jpg`" 
                        :alt="card.name"
                        class="card-image"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="selected-card" v-if="selectedCard">
            <img 
              v-if="selectedCard.type === 'deck'"
              :src="`/images/cards/back${selectedCard.level}.jpg`" 
              :alt="`等级${selectedCard.level}牌背`"
              class="card-preview"
            />
            <img 
              v-else
              :src="`/images/cards/${selectedCard.id}.jpg`" 
              :alt="selectedCard.name" 
              class="card-preview" 
            />
            <div class="card-info">
              <div class="card-name">
                {{ selectedCard.type === 'deck' ? `等级${selectedCard.level}牌堆` : selectedCard.name }}
              </div>
              <div v-if="selectedCard.type !== 'deck'" class="card-cost">
                费用: {{ formatCardCost(selectedCard.cost) }}
              </div>
              <div v-if="selectedCard.type === 'deck'" class="card-note">
                从牌堆随机抽取一张等级{{ selectedCard.level }}的卡牌
              </div>
            </div>
          </div>
        </div>
        
        <!-- 花费特权操作 -->
        <div v-if="actionType === 'spendPrivilege'" class="privilege-selection">
          <h4>选择要花费的特权指示物数量</h4>
          <div class="privilege-count">
            <button 
              v-for="count in [1, 2, 3]" 
              :key="count"
              :class="{ 'selected': privilegeCount === count, 'disabled': count > availablePrivileges }"
              @click="selectPrivilegeCount(count)"
              :disabled="count > availablePrivileges"
            >
              {{ count }}
            </button>
          </div>
          <div v-if="privilegeCount > 0" class="gem-selection">
            <h5>选择要拿取的宝石 ({{ privilegeCount }}个)</h5>
            <div class="selected-gems">
              <div v-for="(gem, index) in selectedGems" :key="index" class="selected-gem">
                <span>{{ gem.type }} ({{ gem.x }}, {{ gem.y }})</span>
                <button @click="removeGem(index)" class="remove-btn">×</button>
              </div>
            </div>
            <div class="gem-grid-preview">
              <div v-for="(row, rowIndex) in gemBoard" :key="rowIndex" class="gem-row">
                <div 
                  v-for="(gem, colIndex) in row" 
                  :key="colIndex"
                  class="gem-cell"
                  :class="{ 
                    'has-gem': gem, 
                    'selected': isGemSelected(rowIndex, colIndex),
                    'clickable': gem && !isGemSelected(rowIndex, colIndex) && selectedGems.length < privilegeCount
                  }"
                  @click="selectGem(rowIndex, colIndex, gem)"
                >
                  <img 
                    v-if="gem" 
                    :src="`/images/gems/${getGemImageName(gem)}.jpg`" 
                    :alt="gem"
                    class="gem-image"
                  />
                  <span v-else class="empty-cell">空</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="dialog-footer">
        <button class="btn btn-secondary" @click="handleCancel">取消</button>
        <button 
          class="btn btn-primary" 
          @click="handleConfirm"
          :disabled="!canConfirm"
        >
          确认
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  visible: Boolean,
  actionType: String,
  title: String,
  message: String,
  gemBoard: Array,
  availablePrivileges: Number,
  flippedCards: Object,
  unflippedCards: Object,
  selectedGoldPosition: Object,
  initialGemPosition: Object,
  playerData: Object,
  selectedCard: Object,
  cardDetails: Object // 新增：用于传递卡牌详细信息
})

const emit = defineEmits(['confirm', 'cancel'])

const selectedGems = ref([])
const selectedCard = ref(null)
const selectedGold = ref(null)
const privilegeCount = ref(0)
const paymentPlan = ref({})

// 重置状态
watch(() => props.visible, (newVal) => {
  if (newVal) {
    selectedGems.value = []
    privilegeCount.value = 0
    paymentPlan.value = {} // 重置支付计划
    
    // 对于保留发展卡操作，不清空selectedGold，因为它是从父组件传递的
    if (props.actionType !== 'reserveCard') {
      selectedGold.value = null
    }
    
    // 对于购买发展卡操作，设置selectedCard并初始化支付计划
    if (props.actionType === 'buyCard') {
      // 从父组件传递的selectedCard中获取卡牌信息
      if (props.selectedCard) {
        selectedCard.value = props.selectedCard
      }
      if (props.playerData) {
        initializePaymentPlan()
      }
    } else {
      selectedCard.value = null
    }
    
    // 对于拿取宝石操作，自动选中初始宝石
    if (props.actionType === 'takeGems' && props.initialGemPosition) {
      const { x, y, type } = props.initialGemPosition
      selectedGems.value = [{ x, y, type }]
    }
  }
})

// 监听黄金位置变化
watch(() => props.selectedGoldPosition, (newVal) => {
  if (newVal && props.actionType === 'reserveCard') {
    selectedGold.value = { ...newVal }
  }
}, { immediate: true })

// 调试：监听 selectedCard 变化
watch(() => selectedCard.value, (newVal) => {
  console.log('selectedCard 变化:', newVal)
  if (newVal && props.actionType === 'buyCard') {
    console.log('准备初始化支付计划...')
    nextTick(() => {
      initializePaymentPlan()
    })
  }
}, { deep: true })

// 调试：监听 paymentPlan 变化
watch(() => paymentPlan.value, (newVal) => {
  console.log('paymentPlan 变化:', newVal)
}, { deep: true })

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

// 格式化卡牌费用
const formatCardCost = (cost) => {
  if (!cost || Object.keys(cost).length === 0) return '无'
  return Object.entries(cost).map(([gem, count]) => `${gem}:${count}`).join(', ')
}

// 根据等级获取发展卡
const getCardsByLevel = (level) => {
  if (!props.flippedCards) return []
  const cardIds = props.flippedCards[level] || []
  
  // 从父组件传递的卡牌详细信息中获取数据
  // 注意：这里需要从父组件传递cardDetails prop
  const cardDetails = props.cardDetails || {}
  
  return cardIds.map(id => {
    const cardDetail = cardDetails[id]
    if (!cardDetail) {
      console.warn(`未找到卡牌 ${id} 的详细信息`)
      return null
    }
    
    return {
      id: cardDetail.id,
      name: `卡牌${cardDetail.id}`,
      level: cardDetail.level,
      cost: cardDetail.cost,
      bonus: cardDetail.bonus
    }
  }).filter(card => card !== null)
}

// 选择宝石
const selectGem = (x, y, gemType) => {
  console.log('选择宝石:', { x, y, gemType, actionType: props.actionType })
  
  // 在拿取宝石操作中，禁止选择黄金
  if (props.actionType === 'takeGems' && gemType === 'gold') {
    console.log('拿取宝石操作中不能选择黄金')
    return
  }
  
  if (props.actionType === 'takeGems' && selectedGems.value.length >= 3) {
    console.log('已达到最大选择数量')
    return
  }
  if (props.actionType === 'spendPrivilege' && selectedGems.value.length >= privilegeCount.value) {
    console.log('已达到特权数量限制')
    return
  }
  
  // 检查是否已经选择过这个位置
  if (isGemSelected(x, y)) {
    console.log('该位置已被选择')
    return
  }
  
  // 检查是否已经在同一直线上
  if (props.actionType === 'takeGems' && selectedGems.value.length > 0) {
    if (!isInLine(x, y)) {
      console.log('宝石不在同一直线上')
      return
    }
  }
  
  selectedGems.value.push({ x, y, type: gemType })
  console.log('宝石选择成功，当前选择:', selectedGems.value)
}

// 移除宝石
const removeGem = (index) => {
  selectedGems.value.splice(index, 1)
}

// 清除已选择的宝石
const clearSelectedGems = () => {
  selectedGems.value = []
}

// 选择黄金
const selectGold = (x, y) => {
  selectedGold.value = { x, y }
}

// 选择卡牌
const selectCard = (card) => {
  selectedCard.value = card
}

// 选择特权数量
const selectPrivilegeCount = (count) => {
  privilegeCount.value = count
  selectedGems.value = [] // 清空已选择的宝石
}

// 检查宝石是否在同一直线上
const isInLine = (x, y) => {
  if (selectedGems.value.length === 0) return true
  
  const gems = [...selectedGems.value, { x, y }]
  if (gems.length < 2) return true
  
  // 检查是否在水平线
  const sameRow = gems.every(gem => gem.x === gems[0].x)
  if (sameRow) {
    const sorted = gems.sort((a, b) => a.y - b.y)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].y !== sorted[i-1].y + 1) return false
    }
    return true
  }
  
  // 检查是否在垂直线
  const sameCol = gems.every(gem => gem.y === gems[0].y)
  if (sameCol) {
    const sorted = gems.sort((a, b) => a.x - b.x)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x !== sorted[i-1].x + 1) return false
    }
    return true
  }
  
  // 检查是否在对角线（从左上到右下）
  const sameDiagonal1 = gems.every(gem => gem.x - gem.y === gems[0].x - gems[0].y)
  if (sameDiagonal1) {
    const sorted = gems.sort((a, b) => a.x - b.x)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x !== sorted[i-1].x + 1) return false
    }
    return true
  }
  
  // 检查是否在对角线（从右上到左下）
  const sameDiagonal2 = gems.every(gem => gem.x + gem.y === gems[0].x + gems[0].y)
  if (sameDiagonal2) {
    const sorted = gems.sort((a, b) => a.x - b.x)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x !== sorted[i-1].x + 1) return false
    }
    return true
  }
  
  return false
}

// 检查宝石是否已选择
const isGemSelected = (x, y) => {
  return selectedGems.value.some(gem => gem.x === x && gem.y === y)
}

// 是否可以确认
const canConfirm = computed(() => {
  switch (props.actionType) {
    case 'takeGems':
      return selectedGems.value.length >= 1 && selectedGems.value.length <= 3
    case 'buyCard':
      if (!selectedCard.value) {
        console.log('canConfirm buyCard: 没有选择卡牌')
        return false
      }
      
      // 检查支付计划是否完整
      let totalPaid = 0
      let totalRequired = 0
      
      // 计算总费用（考虑奖励优惠）
      for (const gemType in selectedCard.value.cost) {
        const required = selectedCard.value.cost[gemType]
        const bonus = props.playerData?.bonus?.[gemType] || 0
        const actualRequired = Math.max(0, required - bonus)
        totalRequired += actualRequired
      }
      
      // 计算已支付（包括宝石和黄金）
      for (const gemType in paymentPlan.value) {
        totalPaid += paymentPlan.value[gemType] || 0
      }
      
      const canConfirm = totalPaid >= totalRequired
      console.log('canConfirm buyCard:', { totalPaid, totalRequired, canConfirm })
      return canConfirm
    case 'reserveCard':
      // 对于保留发展卡，只需要选择卡牌即可，黄金位置已经通过点击确定
      return selectedCard.value !== null
    case 'spendPrivilege':
      return privilegeCount.value > 0 && selectedGems.value.length === privilegeCount.value
    default:
      return true
  }
})

// 处理确认
const handleConfirm = () => {
  console.log('ActionDialog: 确认操作，当前状态:', {
    actionType: props.actionType,
    selectedGems: selectedGems.value,
    selectedCard: selectedCard.value,
    selectedGold: selectedGold.value,
    privilegeCount: privilegeCount.value,
    paymentPlan: paymentPlan.value
  })
  
  const data = {
    actionType: props.actionType,
    selectedGems: selectedGems.value,
    selectedCard: selectedCard.value,
    selectedGold: selectedGold.value,
    privilegeCount: privilegeCount.value,
    paymentPlan: paymentPlan.value
  }
  
  console.log('ActionDialog: 发送确认事件:', data)
  emit('confirm', data)
}

// 处理取消
const handleCancel = () => {
  emit('cancel')
}

// 处理遮罩点击
const handleOverlayClick = () => {
  handleCancel()
}

// 处理卡牌图片加载失败
const handleCardImageError = (event) => {
  event.target.src = '/images/cards/back1.jpg'; // 默认的牌背图片
  event.target.alt = '加载失败';
};

// 处理宝石图片加载失败
const handleGemImageError = (event) => {
  event.target.src = '/images/gems/white.jpg'; // 默认的宝石图片
  event.target.alt = '加载失败';
};

// 获取未翻开的卡牌数量（从后端数据中获取）
const getUnflippedCount = (level) => {
  if (!props.unflippedCards) return 0;
  // 直接从后端获取该等级未翻开的卡牌数量
  return props.unflippedCards[level] || 0;
};

// 选择牌堆卡牌
const selectDeckCard = (level) => {
  if (getUnflippedCount(level) === 0) {
    console.log('该等级牌堆已无未翻开的卡牌');
    return;
  }
  selectedCard.value = { type: 'deck', level: level };
};

// 获取宝石显示名称
const getGemDisplayName = (gemType) => {
  const gemMap = {
    'white': '白宝石',
    'blue': '蓝宝石',
    'green': '绿宝石',
    'red': '红宝石',
    'black': '黑宝石',
    'pearl': '珍珠',
    'gold': '黄金'
  }
  return gemMap[gemType] || gemType
}

// 获取卡牌总费用（从后端卡牌数据中获取）
const getTotalCost = () => {
  if (!selectedCard.value?.cost) return 0;
  let total = 0;
  // 从后端卡牌数据中计算总费用
  for (const gemType in selectedCard.value.cost) {
    total += selectedCard.value.cost[gemType];
  }
  return total;
};

// 获取总支付金额
const getTotalPaid = () => {
  let total = 0
  // 从用户输入的支付计划中计算总支付金额
  for (const gemType in paymentPlan.value) {
    total += paymentPlan.value[gemType] || 0
  }
  return total
}

// 获取所需支付数量（从后端卡牌数据中获取）
const getRequiredCost = (gemType) => {
  if (!selectedCard.value?.cost) {
    console.log('getRequiredCost: 没有卡牌费用信息')
    return 0
  }
  // 从后端卡牌数据中获取该宝石类型的费用
  const cost = selectedCard.value.cost[gemType] || 0
  return cost
}

// 获取可用宝石数量（从后端玩家数据中获取）
const getAvailableTokens = (gemType) => {
  if (!props.playerData?.gems) {
    console.log('getAvailableTokens: 没有玩家宝石数据')
    return 0
  }
  // 从后端玩家数据中获取该宝石类型的可用数量
  const count = props.playerData.gems[gemType] || 0
  return count
}

// 获取宝石最大支付数量
const getMaxPayment = (gemType) => {
  if (!selectedCard.value?.cost) return 0;
  const required = selectedCard.value.cost[gemType] || 0;
  const available = getAvailableTokens(gemType);
  return Math.min(required, available);
};

// 获取黄金所需支付数量
const getGoldRequired = () => {
  if (!selectedCard.value?.cost) {
    console.log('getGoldRequired: 没有卡牌费用信息')
    return 0
  }
  
  let totalRequired = 0
  for (const gemType in selectedCard.value.cost) {
    const required = selectedCard.value.cost[gemType]
    const available = getAvailableTokens(gemType)
    const bonus = props.playerData?.bonus?.[gemType] || 0
    const actualRequired = Math.max(0, required - bonus)
    if (actualRequired > available) {
      totalRequired += (actualRequired - available)
    }
  }
  
  console.log('getGoldRequired:', totalRequired)
  return totalRequired
}

// 获取应支付的token数量
const getRequiredTokens = () => {
  try {
    console.log('getRequiredTokens 被调用:', { 
      selectedCard: selectedCard.value, 
      hasCost: !!selectedCard.value?.cost,
      cost: selectedCard.value?.cost 
    })
    
    if (!selectedCard.value?.cost || typeof selectedCard.value.cost !== 'object') {
      console.log('getRequiredTokens: 没有卡牌费用信息或费用不是对象')
      return {}
    }
    
    const required = {}
    for (const gemType in selectedCard.value.cost) {
      if (gemType && typeof gemType === 'string') {
        const cost = selectedCard.value.cost[gemType]
        if (typeof cost === 'number' && cost > 0) {
          const bonus = props.playerData?.bonus?.[gemType] || 0
          const actualRequired = Math.max(0, cost - bonus)
          if (actualRequired > 0) {
            required[gemType] = actualRequired
          }
        }
      }
    }
    
    console.log('getRequiredTokens:', required)
    return required
  } catch (error) {
    console.error('getRequiredTokens 发生错误:', error)
    return {}
  }
}

// 获取系统建议支付的token数量
const getSuggestedPayment = () => {
  try {
    if (!selectedCard.value?.cost || !props.playerData) {
      console.log('getSuggestedPayment: 缺少必要数据')
      return {}
    }
    
    const suggested = {}
    
    // 显示当前支付计划
    for (const gemType in paymentPlan.value) {
      if (gemType && typeof gemType === 'string') {
        const amount = paymentPlan.value[gemType]
        if (typeof amount === 'number' && amount > 0) {
          if (gemType === 'gold') {
            suggested.gold = amount
          } else {
            suggested[gemType] = amount
          }
        }
      }
    }
    
    console.log('getSuggestedPayment:', suggested)
    return suggested
  } catch (error) {
    console.error('getSuggestedPayment 发生错误:', error)
    return {}
  }
}

// 更新支付计划
const updatePaymentPlan = () => {
  // 确保支付计划合理
  for (const gemType in paymentPlan.value) {
    if (gemType === 'gold') {
      paymentPlan.value[gemType] = Math.max(0, Math.min(paymentPlan.value[gemType] || 0, getAvailableTokens(gemType)));
    } else {
      paymentPlan.value[gemType] = Math.max(0, Math.min(paymentPlan.value[gemType] || 0, getMaxPayment(gemType)));
    }
  }
};

// 初始化支付计划
const initializePaymentPlan = () => {
  console.log('initializePaymentPlan 被调用:', { 
    selectedCard: selectedCard.value, 
    playerData: props.playerData,
    hasCost: !!selectedCard.value?.cost,
    hasPlayerData: !!props.playerData
  })
  
  if (!selectedCard.value?.cost || !props.playerData) {
    console.log('初始化支付计划失败:', { selectedCard: selectedCard.value, playerData: props.playerData })
    return
  }
  
  console.log('开始初始化支付计划:', { selectedCard: selectedCard.value, playerData: props.playerData })
  
  paymentPlan.value = {}
  
  // 为每种宝石类型设置初始支付数量
  for (const gemType in selectedCard.value.cost) {
    const required = selectedCard.value.cost[gemType]
    const available = getAvailableTokens(gemType)
    const bonus = props.playerData.bonus?.[gemType] || 0
    const actualRequired = Math.max(0, required - bonus)
    
    // 初始时尽量使用对应颜色的宝石支付
    paymentPlan.value[gemType] = Math.min(actualRequired, available)
  }
  
  // 计算需要多少黄金来补足短缺
  let totalGoldNeeded = 0
  for (const gemType in selectedCard.value.cost) {
    const required = selectedCard.value.cost[gemType]
    const available = getAvailableTokens(gemType)
    const bonus = props.playerData?.bonus?.[gemType] || 0
    const actualRequired = Math.max(0, required - bonus)
    
    if (actualRequired > available) {
      totalGoldNeeded += (actualRequired - available)
    }
  }
  
  paymentPlan.value.gold = totalGoldNeeded
  
  console.log('支付计划初始化完成:', paymentPlan.value)
}

// 安全地获取应支付token的entries（防止undefined值）
const getRequiredTokensEntries = () => {
  try {
    const tokens = getRequiredTokens()
    if (!tokens || typeof tokens !== 'object') {
      console.warn('getRequiredTokensEntries: tokens不是有效对象', tokens)
      return []
    }
    
    const entries = Object.entries(tokens)
    if (!Array.isArray(entries)) {
      console.warn('getRequiredTokensEntries: Object.entries返回的不是数组', entries)
      return []
    }
    
    // 过滤掉任何包含undefined或null的条目
    const safeEntries = entries.filter(entry => 
      entry && 
      Array.isArray(entry) &&
      entry.length === 2 && 
      entry[0] !== undefined && 
      entry[0] !== null && 
      entry[1] !== undefined && 
      entry[1] !== null &&
      typeof entry[0] === 'string' &&
      typeof entry[1] === 'number'
    )
    
    console.log('getRequiredTokensEntries:', { original: tokens, safe: safeEntries })
    return safeEntries
  } catch (error) {
    console.error('getRequiredTokensEntries 发生错误:', error)
    return []
  }
}

// 预过滤的应支付token entries（计算属性）
const requiredTokenEntries = computed(() => {
  const arr = getRequiredTokensEntries()
  return Array.isArray(arr)
    ? arr.filter(([k, v]) => typeof k === 'string' && typeof v === 'number' && v > 0)
    : []
})

// 安全地获取建议支付token的entries（防止undefined值）
const getSuggestedPaymentEntries = () => {
  try {
    const tokens = getSuggestedPayment()
    if (!tokens || typeof tokens !== 'object') {
      console.warn('getSuggestedPaymentEntries: tokens不是有效对象', tokens)
      return []
    }
    
    const entries = Object.entries(tokens)
    if (!Array.isArray(entries)) {
      console.warn('getSuggestedPaymentEntries: Object.entries返回的不是数组', entries)
      return []
    }
    
    // 过滤掉任何包含undefined或null的条目
    const safeEntries = entries.filter(entry => 
      entry && 
      Array.isArray(entry) &&
      entry.length === 2 && 
      entry[0] !== undefined && 
      entry[0] !== null && 
      entry[1] !== undefined && 
      entry[1] !== null &&
      typeof entry[0] === 'string' &&
      typeof entry[1] === 'number'
    )
    
    console.log('getSuggestedPaymentEntries:', { original: tokens, safe: safeEntries })
    return safeEntries
  } catch (edit) {
    console.error('getSuggestedPaymentEntries 发生错误:', edit)
    return []
  }
}

// 预过滤的建议支付token entries（计算属性）
const suggestedPaymentEntries = computed(() => {
  const arr = getSuggestedPaymentEntries()
  return Array.isArray(arr)
    ? arr.filter(([k, v]) => typeof k === 'string' && typeof v === 'number' && v > 0)
    : []
})

// 是否可以转换为黄金支付
const canConvertToGold = (gemType) => {
  if (!props.playerData?.gems?.gold) {
    console.log('canConvertToGold: 没有黄金')
    return false
  }
  
  const required = getRequiredCost(gemType)
  const available = getAvailableTokens(gemType)
  const bonus = props.playerData?.bonus?.[gemType] || 0
  const actualRequired = Math.max(0, required - bonus)
  
  // 当前支付数量
  const currentPaid = paymentPlan.value[gemType] || 0
  // 可用黄金数量
  const availableGold = props.playerData.gems.gold - (paymentPlan.value.gold || 0)
  
  // 可以转换的条件：
  // 1. 当前支付数量 > 0（有宝石可以转换）
  // 2. 有足够的黄金来替代（每次转换1个）
  const canConvert = currentPaid > 0 && availableGold >= 1
  
  console.log(`canConvertToGold(${gemType}):`, { 
    required, available, bonus, actualRequired, 
    currentPaid, availableGold, canConvert 
  })
  
  return canConvert
}

// 将非黄金token转换为黄金支付
const convertToGold = (gemType) => {
  if (!canConvertToGold(gemType)) {
    console.log(`convertToGold(${gemType}): 无法转换`)
    return
  }
  
  const currentPaid = paymentPlan.value[gemType] || 0
  
  // 每次只转换1个宝石，而不是全部
  if (currentPaid > 0) {
    paymentPlan.value[gemType] = currentPaid - 1
    paymentPlan.value.gold = (paymentPlan.value.gold || 0) + 1
    
    console.log('转换支付:', { 
      gemType, 
      currentPaid, 
      newPaid: paymentPlan.value[gemType],
      newGold: paymentPlan.value.gold,
      message: `已将1个${getGemDisplayName(gemType)}转换为1个黄金支付`
    })
  }
}

// 获取购买后剩余的token数量
const getRemainingTokens = (gemType) => {
  const available = getAvailableTokens(gemType)
  const paid = paymentPlan.value[gemType] || 0
  const remaining = Math.max(0, available - paid)
  
  // 调试信息
  if (gemType === 'white') {
    console.log(`getRemainingTokens(${gemType}):`, { available, paid, remaining })
  }
  
  return remaining
}

</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-content {
  background: white;
  border-radius: 12px;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 0;
  border-bottom: 1px solid #e9ecef;
}

.dialog-header h3 {
  margin: 0;
  color: #495057;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6c757d;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #495057;
}

.dialog-body {
  padding: 24px;
}

.dialog-body p {
  margin: 0 0 20px 0;
  color: #495057;
}

.gem-selection, .card-selection, .reserve-selection, .privilege-selection {
  margin-top: 20px;
}

.gem-selection h4, .card-selection h4, .reserve-selection h4, .privilege-selection h4 {
  margin: 0 0 12px 0;
  color: #495057;
  font-size: 16px;
}

.selected-gems {
  margin-bottom: 16px;
}

.selected-gem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8f9fa;
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
}

.remove-btn {
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  cursor: pointer;
  font-size: 12px;
}

.gem-grid-preview {
  border: 2px solid #dee2e6;
  border-radius: 8px;
  padding: 12px;
  background: #f8f9fa;
}

.gem-row {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}

.gem-row:last-child {
  margin-bottom: 0;
}

.gem-cell {
  width: 40px;
  height: 40px;
  border: 1px solid #dee2e6;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 2px;
  border-radius: 50%;
  position: relative;
}

.gem-cell.has-gem {
  background: white;
}

.gem-cell.clickable {
  cursor: pointer;
}

.gem-cell.clickable:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.gem-cell.selected {
  border-color: #28a745;
  background: #d4edda;
  box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.3);
  transform: scale(1.1);
  z-index: 2;
}

.gem-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.empty-cell {
  color: #6c757d;
  font-size: 10px;
}

.selected-card {
  display: flex;
  align-items: center;
  background: #f8f9fa;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.card-preview {
  width: 60px;
  height: 90px;
  object-fit: cover;
  border-radius: 6px;
  margin-right: 12px;
}

.card-preview-large {
  width: 120px;
  height: 180px;
  object-fit: cover;
  border-radius: 8px;
  margin-right: 12px;
}

.card-info {
  flex: 1;
}

.card-name {
  font-weight: 600;
  color: #495057;
  margin-bottom: 4px;
}

.card-cost {
  font-size: 12px;
  color: #6c757d;
}

.privilege-count {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.privilege-count button {
  width: 48px;
  height: 48px;
  border: 2px solid #dee2e6;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  font-weight: 600;
  transition: all 0.2s;
}

.privilege-count button:hover:not(.disabled) {
  border-color: #2196f3;
  background: #e3f2fd;
}

.privilege-count button.selected {
  border-color: #2196f3;
  background: #2196f3;
  color: white;
}

.privilege-count button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e9ecef;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background: #2196f3;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1976d2;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

.available-cards {
  margin-bottom: 20px;
}

.card-level {
  margin-bottom: 16px;
}

.card-level h5 {
  margin: 0 0 8px 0;
  color: #495057;
  font-size: 14px;
}

.cards-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.card-item {
  width: 60px;
  height: 90px;
  border: 2px solid #dee2e6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.card-item:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.card-item.selected {
  border-color: #28a745;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
}

.card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.deck-cards-grid {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.deck-card-item {
  width: 60px;
  height: 90px;
  border: 2px solid #dee2e6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
  position: relative;
}

.deck-card-item:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.deck-card-item.selected {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.deck-card-item .card-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.deck-card-label {
  position: absolute;
  bottom: 4px;
  left: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
  text-align: center;
  z-index: 1;
}

.card-note {
  font-size: 10px;
  color: #6c757d;
  margin-top: 4px;
}

.cards-by-level {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.level-section {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  background: #f8f9fa;
}

.level-section h5 {
  margin: 0 0 16px 0;
  color: #495057;
  font-size: 16px;
  text-align: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #dee2e6;
}

.level-content {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.deck-section {
  flex: 0 0 auto;
  text-align: center;
}

.field-cards-section {
  flex: 1;
}

.level-section h6 {
  margin: 0 0 12px 0;
  color: #495057;
  font-size: 14px;
  text-align: center;
}

.gem-selection-controls {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.clear-btn {
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: #c82333;
}

.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.payment-section {
  margin-top: 20px;
}

.payment-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.payment-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8f9fa;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #dee2e6;
}

.payment-option:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.payment-option.selected {
  border-color: #28a745;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
}

.gem-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gem-icon {
  width: 24px;
  height: 24px;
  object-fit: cover;
  border-radius: 50%;
}

.gem-name {
  font-size: 14px;
  color: #495057;
}

.cost-info {
  font-size: 12px;
  color: #6c757d;
  display: flex;
  gap: 8px;
}

.required-cost {
  font-weight: 600;
  color: #dc3545;
}

.available-tokens {
  font-size: 12px;
  color: #6c757d;
}

.payment-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.payment-input-field {
  width: 60px;
  height: 36px;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  color: #495057;
  padding: 0 8px;
}

.payment-input-field:focus {
  outline: none;
  border-color: #2196f3;
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.3);
}

.payment-input-field::-webkit-inner-spin-button,
.payment-input-field::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.payment-input-field[type="number"] {
  -moz-appearance: textfield;
}

.payment-summary {
  border-top: 1px solid #e9ecef;
  padding-top: 16px;
  margin-top: 16px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #495057;
  margin-bottom: 8px;
}

.summary-item:last-child {
  margin-bottom: 0;
}

.summary-item .insufficient {
  color: #dc3545;
  font-weight: 600;
}

.buy-card-content {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.card-preview-section {
  flex: 0 0 auto;
}

.payment-section {
  flex: 1;
}

.payment-row {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  padding: 8px 0;
}

.payment-label {
  font-size: 14px;
  color: #495057;
  font-weight: 500;
  margin-right: 16px;
  min-width: 80px;
}

.token-display {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
}

.token-item {
  display: flex;
  align-items: center;
  background: #f8f9fa;
  border: 2px solid #dee2e6;
  border-radius: 20px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #495057;
  transition: all 0.2s;
  min-width: 40px;
  justify-content: center;
}

.token-item:hover {
  background: #e9ecef;
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.token-item.clickable {
  cursor: pointer;
  background: #e3f2fd;
  border-color: #2196f3;
}

.token-item.clickable:hover {
  background: #bbdefb;
  transform: translateY(-1px);
}

.token-icon {
  width: 20px;
  height: 20px;
  object-fit: cover;
  border-radius: 50%;
  margin-right: 6px;
}

.token-count {
  font-weight: 600;
  color: #dc3545;
  min-width: 16px;
  text-align: center;
}

.payment-note {
  margin-top: 20px;
  padding: 12px 16px;
  background: #e3f2fd;
  border-radius: 8px;
  border-left: 4px solid #2196f3;
  font-size: 12px;
  color: #1976d2;
}

.payment-note p {
  margin: 0;
  line-height: 1.4;
}
</style>




