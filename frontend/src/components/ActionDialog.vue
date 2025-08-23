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
          <h4>选择要购买的发展卡</h4>
          <div class="available-cards">
            <div 
              v-for="level in [3, 2, 1]" 
              :key="level" 
              class="card-level"
            >
              <h5>等级 {{ level }}</h5>
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
          <div class="selected-card" v-if="selectedCard">
            <img :src="`/images/cards/${selectedCard.id}.jpg`" :alt="selectedCard.name" class="card-preview" />
            <div class="card-info">
              <div class="card-name">{{ selectedCard.name }}</div>
              <div class="card-cost">费用: {{ formatCardCost(selectedCard.cost) }}</div>
            </div>
          </div>
        </div>
        
        <!-- 保留发展卡操作 -->
        <div v-if="actionType === 'reserveCard'" class="reserve-selection">
          <h4>选择要保留的发展卡</h4>
          <div class="available-cards">
            <div 
              v-for="level in [3, 2, 1]" 
              :key="level" 
              class="card-level"
            >
              <h5>等级 {{ level }}</h5>
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
          <div class="selected-card" v-if="selectedCard">
            <img :src="`/images/cards/${selectedCard.id}.jpg`" :alt="selectedCard.name" class="card-preview" />
            <div class="card-info">
              <div class="card-name">{{ selectedCard.name }}</div>
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
import { ref, computed, watch } from 'vue'

const props = defineProps({
  visible: Boolean,
  actionType: String,
  title: String,
  message: String,
  gemBoard: Array,
  availablePrivileges: Number,
  flippedCards: Object,
  selectedGoldPosition: Object
})

const emit = defineEmits(['confirm', 'cancel'])

const selectedGems = ref([])
const selectedCard = ref(null)
const selectedGold = ref(null)
const privilegeCount = ref(0)

// 重置状态
watch(() => props.visible, (newVal) => {
  if (newVal) {
    selectedGems.value = []
    selectedCard.value = null
    privilegeCount.value = 0
    // 对于保留发展卡操作，不清空selectedGold，因为它是从父组件传递的
    if (props.actionType !== 'reserveCard') {
      selectedGold.value = null
    }
  }
})

// 监听黄金位置变化
watch(() => props.selectedGoldPosition, (newVal) => {
  if (newVal && props.actionType === 'reserveCard') {
    selectedGold.value = { ...newVal }
  }
}, { immediate: true })

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
  
  // 这里应该从全局卡牌数据中获取详细信息
  // 暂时返回简化的卡牌信息
  return cardIds.map(id => ({
    id: id,
    name: `卡牌${id}`,
    cost: {},
    bonus: null
  }))
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
      return selectedCard.value !== null
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
    privilegeCount: privilegeCount.value
  })
  
  const data = {
    actionType: props.actionType,
    selectedGems: selectedGems.value,
    selectedCard: selectedCard.value,
    selectedGold: selectedGold.value,
    privilegeCount: privilegeCount.value
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
</style>
