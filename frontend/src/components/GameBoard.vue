<template>
  <div class="game-board">
    <!-- 左侧游戏主板图 -->
    <div class="game-main-board">
      <!-- 左上方：宝石袋子 -->
      <div class="gem-bag">
        <h3>宝石袋子</h3>
        <div class="bag-content">
          <div class="bag-icon">💎</div>
          <div class="bag-count">{{ totalGemsInBag }}</div>
        </div>
      </div>

      <!-- 左边中间：胜利目标提示卡 -->
      <div class="victory-objectives">
        <h3>胜利目标</h3>
        <div class="objectives-content">
          <div class="goal-item">
            <span class="goal-icon">🏆</span>
            <span>20分获胜</span>
          </div>
          <div class="goal-item">
            <span class="goal-icon">👑</span>
            <span>10皇冠获胜</span>
          </div>
          <div class="goal-item">
            <span class="goal-icon">🎨</span>
            <span>单色10bonus获胜</span>
          </div>
        </div>
      </div>

      <!-- 中间：5x5宝石版图 -->
      <div class="gem-board">
        <h3>宝石版图</h3>
        <div class="gem-board-grid">
          <!-- 5x5 宝石网格 -->
          <div 
            v-for="(row, x) in gameState.gemBoard || []" 
            :key="`row-${x}`"
            class="gem-row"
          >
            <div 
              v-for="(gemType, y) in row" 
              :key="`gem-${x}-${y}`"
              class="gem-slot"
              :class="{ 'empty': !gemType, 'selectable': canSelectGem(x, y) }"
              @click="selectGemPosition(x, y)"
            >
              <div v-if="gemType" class="gem-token">
                <img :src="getGemImage(gemType)" :alt="gemType" class="gem-image" />
              </div>
              <div v-else class="empty-slot"></div>
            </div>
          </div>
          
          <!-- 如果没有宝石版图数据，显示占位符 -->
          <div v-if="!gameState.gemBoard" class="board-placeholder">
            <div class="placeholder-text">等待游戏开始...</div>
          </div>
        </div>
      </div>

      <!-- 右边最下方：未被获得的贵族卡 -->
      <div class="available-nobles">
        <h3>贵族卡</h3>
        <div class="nobles-grid">
          <div 
            v-for="nobleId in availableNobles" 
            :key="nobleId"
            class="noble-card"
            @click="selectNoble(nobleId)"
          >
            <div class="noble-image">
              <div class="noble-placeholder">👑</div>
            </div>
            <div class="noble-info">{{ nobleId }}</div>
          </div>
        </div>
      </div>

      <!-- 右边：公共发展卡区域 -->
      <div class="development-cards-area">
        <h3>发展卡</h3>
        
        <!-- 特权指示物 -->
        <div class="privilege-tokens-board">
          <h4>特权指示物</h4>
          <div class="tokens-count">{{ availablePrivilegeTokens }}</div>
        </div>

        <!-- 未被翻开的发展卡堆 -->
        <div class="card-piles">
          <div class="card-pile level-3">
            <h4>3级</h4>
            <div class="pile-back">
              <div class="card-back-placeholder">🃏</div>
            </div>
            <div class="pile-count">{{ unflippedCards[3] }}</div>
          </div>
          <div class="card-pile level-2">
            <h4>2级</h4>
            <div class="pile-back">
              <div class="card-back-placeholder">🃏</div>
            </div>
            <div class="pile-count">{{ unflippedCards[2] }}</div>
          </div>
          <div class="card-pile level-1">
            <h4>1级</h4>
            <div class="pile-back">
              <div class="card-back-placeholder">🃏</div>
            </div>
            <div class="pile-count">{{ unflippedCards[1] }}</div>
          </div>
        </div>

        <!-- 被翻开的发展卡 -->
        <div class="flipped-cards">
          <div 
            v-for="level in [3, 2, 1]" 
            :key="level"
            class="flipped-level"
          >
            <h4>等级 {{ level }}</h4>
            <div class="cards-row">
              <div 
                v-for="cardId in getFlippedCardsByLevel(level)" 
                :key="cardId"
                class="development-card"
                :class="`level-${level}`"
                @click="selectCard(cardId)"
              >
                <div class="card-image">
                  <div class="card-placeholder">🃏</div>
                </div>
                <div class="card-info">
                  <div class="card-id">{{ cardId }}</div>
                  <div class="card-level">{{ level }}级</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧玩家状态 -->
    <div class="players-status">
      <div 
        v-for="player in allPlayers" 
        :key="player.id"
        class="player-status-card"
        :class="{ 'current-player': player.id === currentPlayerId }"
      >
        <div class="player-header">
          <h3>{{ player.name }}</h3>
          <div class="player-host-badge" v-if="player.isHost">房主</div>
        </div>

        <!-- 宝石 -->
        <div class="status-section">
          <h4>宝石</h4>
          <div class="gems-display">
            <div v-for="(count, gemType) in player.gems" :key="gemType" class="gem-status">
              <img :src="getGemImage(gemType)" :alt="gemType" class="gem-icon" />
              <span>{{ count }}</span>
            </div>
          </div>
        </div>

        <!-- Bonus -->
        <div class="status-section">
          <h4>Bonus</h4>
          <div class="bonus-display">
            <div v-for="(count, gemType) in player.bonus" :key="gemType" class="bonus-status">
              <img :src="getGemImage(gemType)" :alt="gemType" class="gem-icon" />
              <span>{{ count }}</span>
            </div>
          </div>
        </div>

        <!-- 保留的发展卡 -->
        <div class="status-section">
          <h4>保留的卡 ({{ player.reservedCards?.length || 0 }}/3)</h4>
          <div class="reserved-cards">
            <div 
              v-for="(cardId, index) in player.reservedCards" 
              :key="index"
              class="reserved-card"
            >
              <div class="card-back">
                <div class="card-back-placeholder">🃏</div>
              </div>
              <div class="card-id">{{ cardId }}</div>
            </div>
            <!-- 填充空位 -->
            <div 
              v-for="i in (3 - (player.reservedCards?.length || 0))" 
              :key="`empty-${i}`"
              class="reserved-card empty"
            >
              <div class="empty-slot">空</div>
            </div>
          </div>
        </div>

        <!-- 特权指示物 -->
        <div class="status-section">
          <h4>特权指示物</h4>
          <div class="privilege-tokens">{{ player.privilegeTokens }}</div>
        </div>

        <!-- 皇冠 -->
        <div class="status-section">
          <h4>皇冠</h4>
          <div class="crowns">{{ player.crowns }}</div>
        </div>

        <!-- 贵族 -->
        <div class="status-section">
          <h4>贵族</h4>
          <div class="nobles-display">
            <div v-for="nobleId in player.nobles" :key="nobleId" class="noble-status">
              <div class="noble-icon-placeholder">👑</div>
              <span>{{ nobleId }}</span>
            </div>
            <div v-if="!player.nobles || player.nobles.length === 0" class="no-nobles">无</div>
          </div>
        </div>

        <!-- 分数 -->
        <div class="status-section">
          <h4>分数</h4>
          <div class="points">{{ player.points }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  gameState: {
    type: Object,
    default: () => ({})
  },
  currentPlayerId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['gem-selected', 'card-selected', 'noble-selected'])

// 计算属性
const availableNobles = computed(() => {
  return props.gameState?.availableNobles || []
})

const allPlayers = computed(() => {
  return props.gameState?.players || []
})

// 游戏版图相关数据
const totalGemsInBag = computed(() => {
  return props.gameState?.gemsInBag || 0
})

const availablePrivilegeTokens = computed(() => {
  return props.gameState?.availablePrivilegeTokens || 3
})

const unflippedCards = computed(() => {
  return props.gameState?.unflippedCards || { 1: 30, 2: 24, 3: 13 }
})

// 方法
const getFlippedCardsByLevel = (level) => {
  const cards = props.gameState?.flippedCards?.[level] || []
  return cards
}

const getGemImage = (gemType) => {
  return `/images/gems/${gemType}.jpg`
}

const getGemName = (gemType) => {
  const gemNames = {
    white: '白色',
    blue: '蓝色',
    green: '绿色',
    red: '红色',
    black: '黑色',
    pearl: '珍珠',
    gold: '黄金',
    gray: '灰色'
  }
  return gemNames[gemType] || gemType
}

// 新增：宝石版图相关方法
const canSelectGem = (x, y) => {
  // 检查是否可以选择该位置的宝石
  // 这里可以加入游戏逻辑，比如是否在直线上
  return true
}

const selectGemPosition = (x, y) => {
  const gemType = props.gameState?.gemBoard?.[x]?.[y]
  if (gemType) {
    emit('gem-selected', { x, y, gemType })
  }
}

const selectCard = (cardId) => {
  emit('card-selected', cardId)
}

const selectNoble = (nobleId) => {
  emit('noble-selected', nobleId)
}
</script>

<style scoped>
.game-board {
  display: flex;
  gap: 24px;
  padding: 20px;
  height: 100%;
}

.game-main-board {
  flex: 2;
  display: grid;
  grid-template-areas: 
    "bag objectives objectives"
    "bag gem-board development"
    "bag gem-board development"
    "nobles nobles development";
  grid-template-columns: 1fr 2fr 2fr;
  grid-template-rows: auto 1fr 1fr auto;
  gap: 20px;
}

.players-status {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 宝石袋子 */
.gem-bag {
  grid-area: bag;
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.bag-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.bag-icon {
  font-size: 48px;
}

.bag-count {
  font-size: 32px;
  font-weight: 700;
  color: #495057;
}

/* 胜利目标 */
.victory-objectives {
  grid-area: objectives;
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.objectives-image img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

/* 宝石板块 */
.gem-board {
  grid-area: gem-board;
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 5x5 宝石版图样式 */
.gem-board-grid {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 12px;
}

.gem-row {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.gem-slot {
  width: 60px;
  height: 60px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: white;
}

.gem-slot:hover {
  border-color: #667eea;
  transform: scale(1.05);
}

.gem-slot.selectable:hover {
  background: #e3f2fd;
}

.gem-slot.empty {
  background: #f8f9fa;
  border-color: #dee2e6;
}

.gem-token {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gem-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.empty-slot {
  width: 30px;
  height: 30px;
  border: 2px dashed #dee2e6;
  border-radius: 50%;
}

.board-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0.3;
}

.board-background img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
}

/* 占位符样式 */
.board-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #f8f9fa;
  border-radius: 12px;
}

.placeholder-text {
  font-size: 18px;
  color: #6c757d;
  text-align: center;
}

.goal-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  color: #495057;
}

.goal-icon {
  font-size: 16px;
}

.noble-placeholder, .card-back-placeholder, .card-placeholder, .noble-icon-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #f8f9fa;
  border-radius: 6px;
  font-size: 24px;
  color: #6c757d;
}

/* 贵族卡 */
.available-nobles {
  grid-area: nobles;
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.nobles-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.noble-card {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  text-align: center;
}

.noble-card:hover {
  border-color: #667eea;
  transform: translateY(-2px);
}

.noble-image img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
}

.noble-points {
  margin-top: 8px;
  font-weight: 600;
  color: #495057;
}

/* 发展卡区域 */
.development-cards-area {
  grid-area: development;
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 特权指示物 */
.privilege-tokens-board {
  text-align: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.tokens-count {
  font-size: 24px;
  font-weight: 700;
  color: #6f42c1;
}

/* 卡牌堆 */
.card-piles {
  display: flex;
  justify-content: space-around;
  gap: 16px;
}

.card-pile {
  text-align: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.pile-back img {
  width: 80px;
  height: 120px;
  object-fit: cover;
  border-radius: 6px;
  margin: 8px 0;
}

.pile-count {
  font-size: 18px;
  font-weight: 600;
  color: #495057;
}

/* 被翻开的卡 */
.flipped-cards {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.flipped-level h4 {
  margin: 0 0 12px 0;
  color: #6c757d;
}

.cards-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 12px;
}

.development-card {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.development-card:hover {
  border-color: #667eea;
  transform: translateY(-2px);
}

.development-card.level-1 {
  border-left: 4px solid #28a745;
}

.development-card.level-2 {
  border-left: 4px solid #007bff;
}

.development-card.level-3 {
  border-left: 4px solid #dc3545;
}

.card-image img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  border-radius: 6px;
}

.card-info {
  margin-top: 8px;
  text-align: center;
}

.card-points {
  font-weight: 600;
  color: #495057;
}

.card-bonus {
  font-size: 12px;
  color: #6c757d;
}

/* 玩家状态卡片 */
.player-status-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 2px solid transparent;
  transition: all 0.3s ease;
}

.player-status-card.current-player {
  border-color: #667eea;
  background: #f8f9ff;
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid #e9ecef;
}

.player-header h3 {
  margin: 0;
  color: #495057;
}

.player-host-badge {
  background-color: #6f42c1;
  color: white;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.status-section {
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e9ecef;
}

.status-section h4 {
  margin: 0 0 12px 0;
  color: #6c757d;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.gems-display, .bonus-display, .reserved-cards, .nobles-display {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.gem-status, .bonus-status, .reserved-card, .noble-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #495057;
}

.gem-icon, .noble-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
}

.reserved-card {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 8px;
  text-align: center;
  min-width: 60px;
}

.reserved-card.empty {
  background: #e9ecef;
  color: #6c757d;
}

.empty-slot {
  font-size: 12px;
}

.privilege-tokens, .crowns, .points, .tokens-count, .pile-count, .pile-back, .card-back, .reserved-card, .empty-slot, .no-nobles {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.privilege-tokens, .crowns, .points, .tokens-count, .pile-count, .pile-back, .card-back, .reserved-card, .empty-slot, .no-nobles {
  font-size: 18px;
  font-weight: 600;
  color: #495057;
}

.privilege-tokens {
  color: #6f42c1;
}

.crowns {
  color: #ffc107;
}

.points {
  color: #28a745;
}

.no-nobles {
  color: #6c757d;
  font-style: italic;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .game-board {
    flex-direction: column;
  }
  
  .game-main-board {
    grid-template-areas: 
      "bag objectives"
      "gem-board development"
      "nobles development";
    grid-template-columns: 1fr 2fr;
  }
}

@media (max-width: 768px) {
  .game-board {
    padding: 12px;
  }
  
  .game-main-board {
    grid-template-areas: 
      "bag"
      "objectives"
      "gem-board"
      "development"
      "nobles";
    grid-template-columns: 1fr;
  }
  
  .gem-board-content {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .nobles-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .cards-row {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
