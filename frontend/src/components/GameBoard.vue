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
        <div class="objectives-image">
          <img src="/images/game/goal.jpg" alt="胜利目标" />
        </div>
      </div>

      <!-- 中间：拿取宝石的板块 -->
      <div class="gem-board">
        <h3>拿取宝石</h3>
        <div class="gem-board-content">
          <div 
            v-for="(count, gemType) in availableGems" 
            :key="gemType"
            class="gem-item"
            :class="gemType"
            @click="selectGem(gemType)"
          >
            <div class="gem-image">
              <img :src="getGemImage(gemType)" :alt="gemType" />
            </div>
            <div class="gem-count">{{ count }}</div>
          </div>
        </div>
      </div>

      <!-- 右边最下方：未被获得的贵族卡 -->
      <div class="available-nobles">
        <h3>贵族卡</h3>
        <div class="nobles-grid">
          <div 
            v-for="noble in availableNobles" 
            :key="noble.id"
            class="noble-card"
            @click="selectNoble(noble)"
          >
            <div class="noble-image">
              <img :src="noble.imagePath" :alt="noble.id" />
            </div>
            <div class="noble-points">{{ noble.points }} 分</div>
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
              <img src="/images/cards/backs/back1.jpg" alt="3级卡背" />
            </div>
            <div class="pile-count">{{ unflippedCards[3] }}</div>
          </div>
          <div class="card-pile level-2">
            <h4>2级</h4>
            <div class="pile-back">
              <img src="/images/cards/backs/back2.jpg" alt="2级卡背" />
            </div>
            <div class="pile-count">{{ unflippedCards[2] }}</div>
          </div>
          <div class="card-pile level-1">
            <h4>1级</h4>
            <div class="pile-back">
              <img src="/images/cards/backs/back3.jpg" alt="1级卡背" />
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
                v-for="card in getFlippedCardsByLevel(level)" 
                :key="card.id"
                class="development-card"
                :class="`level-${level}`"
                @click="selectCard(card)"
              >
                <div class="card-image">
                  <img :src="card.imagePath" :alt="`Level ${level} Card`" />
                </div>
                <div class="card-info">
                  <div class="card-points">{{ card.points }} 分</div>
                  <div class="card-bonus">{{ getGemName(card.bonus) }}</div>
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
          <h4>保留的卡 ({{ player.reservedCards.length }}/3)</h4>
          <div class="reserved-cards">
            <div 
              v-for="(card, index) in player.reservedCards" 
              :key="index"
              class="reserved-card"
              :class="`level-${card.level}`"
            >
              <div class="card-back">
                <img src="/images/cards/backs/back1.jpg" :alt="`Level ${card.level} Card Back`" />
              </div>
              <div class="card-level">{{ card.level }}级</div>
            </div>
            <!-- 填充空位 -->
            <div 
              v-for="i in (3 - player.reservedCards.length)" 
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
            <div v-for="noble in player.nobles" :key="noble.id" class="noble-status">
              <img :src="noble.imagePath" :alt="noble.id" class="noble-icon" />
              <span>{{ noble.points }}分</span>
            </div>
            <div v-if="player.nobles.length === 0" class="no-nobles">无</div>
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
const availableGems = computed(() => {
  return props.gameState?.availableGems || {}
})

const availableNobles = computed(() => {
  return props.gameState?.nobleCards || []
})

const allPlayers = computed(() => {
  if (!props.gameState?.players) return []
  return Object.values(props.gameState.players)
})

// 游戏版图相关数据
const totalGemsInBag = computed(() => {
  // 计算袋子里有多少宝石（总宝石数 - 场上可用宝石数）
  const totalGems = 4 + 4 + 4 + 4 + 4 + 4 + 5 // 白蓝绿红黑珍珠各4个，黄金5个
  const availableGemsCount = Object.values(availableGems.value).reduce((sum, count) => sum + count, 0)
  return totalGems - availableGemsCount
})

const availablePrivilegeTokens = computed(() => {
  // 场上未被获得的特权指示物数量
  return 3 // 游戏开始时固定3个
})

const unflippedCards = computed(() => {
  // 未被翻开的发展卡数量
  return {
    1: 30, // 1级30张
    2: 24, // 2级24张
    3: 13  // 3级13张
  }
})

// 方法
const getFlippedCardsByLevel = (level) => {
  // 获取被翻开的发展卡，保持固定数量：1级5张，2级4张，3级3张
  const cards = props.gameState?.developmentCards?.[level] || []
  const maxFlipped = level === 1 ? 5 : level === 2 ? 4 : 3
  return cards.slice(0, maxFlipped)
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
    gold: '黄金'
  }
  return gemNames[gemType] || gemType
}

const selectGem = (gemType) => {
  emit('gem-selected', gemType)
}

const selectCard = (card) => {
  emit('card-selected', card)
}

const selectNoble = (noble) => {
  emit('noble-selected', noble)
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

.gem-board-content {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 20px;
}

.gem-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.gem-item:hover {
  border-color: #667eea;
  transform: translateY(-2px);
}

.gem-image img {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
}

.gem-count {
  font-weight: 600;
  color: #495057;
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
