<template>
  <div class="game-container">
    <!-- 游戏头部信息 -->
    <header class="game-header" :inert="victoryDialog.visible || undefined">
      <div class="room-info">
        <h2 role="heading" aria-level="1">{{ currentRoom?.name || '游戏房间' }}</h2>
        <p>房间ID: {{ roomId }}</p>
      </div>
      <div class="player-info">
        <span>玩家: {{ currentPlayer?.name }}</span>
        <span :class="['status', isConnected ? 'connected' : 'disconnected']" role="status" aria-live="polite" aria-atomic="true">
          {{ connectionStatusText }}
        </span>
      </div>
      <button @click="leaveGame" class="btn btn-secondary">离开游戏</button>
    </header>

    <!-- 游戏主体 -->
    <main class="game-main" :class="{ 'has-context-action': Boolean(contextActionBar) }" :inert="victoryDialog.visible || undefined">
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
        </div>
        
        <div v-else class="game-area">
          <div class="game-layout">
            <!-- 左侧：游戏版图 -->
            <section id="game-board-section" class="game-board" aria-labelledby="game-board-heading">
              <div class="board-header">
                <h3 id="game-board-heading" role="heading" aria-level="2">游戏版图</h3>
                <div class="game-status">
                  <span>状态: {{ gameState?.status || '进行中' }}</span>
                  <span v-if="gameState?.currentPlayerIndex !== undefined">
                    当前玩家: {{ getCurrentPlayerName() }}
                  </span>
                  <div 
                    class="bag-container"
                    @mouseenter="bagHover = true"
                    @mouseleave="bagHover = false"
                    @focusin="bagHover = true"
                    @focusout="bagHover = false"
                  >
                    <span
                      class="bag-pill"
                      :class="{ selected: interactionState.action.kind === 'refill-confirm' }"
                      role="button"
                      :tabindex="isBoardActionPending ? -1 : 0"
                      aria-label="补充版图：查看并使用袋中宝石"
                      :aria-pressed="interactionState.action.kind === 'refill-confirm'"
                      :aria-disabled="isBoardActionPending || interactionState.action.kind !== 'idle'"
                      @click.stop="handleRefillBoard"
                      @keydown.enter.stop.prevent="handleRefillBoard"
                      @keydown.space.stop.prevent="handleRefillBoard"
                      title="点击补充版图"
                    >袋中宝石</span>
                    <div v-if="bagHover && bagCounts.length > 0" class="bag-tooltip">
                      <div class="bag-row">
                        <div v-for="item in bagCounts" :key="`bag-${item.type}`" class="bag-item">
                          <span class="bag-count">{{ item.count }}×</span>
                          <img :src="`/images/gems/${getGemImageName(item.type)}.jpg`" alt="" class="bag-gem" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 宝石版图 -->
              <GemBoard
                :board="gameState?.gemBoard || []"
                :mode="gemBoardMode"
                :selected-gems="selectedBoardGems"
                :selectable-positions="boardSelectablePositions"
                :illegal-positions="boardIllegalPositions"
                :pending="isBoardActionPending"
                @select="handleBoardGemSelect"
                @cancel="handleBoardGemCancel"
              />

              <ContextActionBar
                v-if="contextActionBar && !actionDialog.visible && !victoryDialog.visible"
                :mode="contextActionBar.mode"
                :selected-gems="contextActionBar.selectedGems"
                :selected-gold="contextActionBar.selectedGold"
                :reserve-target="contextActionBar.reserveTarget"
                :message="contextActionBar.message"
                :warning="contextActionBar.warning"
                :target-count="contextActionBar.targetCount"
                :max-target-count="contextActionBar.maxPrivilegeCount"
                :confirm-disabled="contextActionBar.confirmDisabled"
                :pending="isBoardActionPending"
                @change-count="handlePrivilegeCountChange"
                @clear="handleBoardSelectionClear"
                @cancel="handleBoardSelectionCancel"
                @confirm="handleBoardSelectionConfirm"
              />

              <!-- 发展卡区域 -->
              <div class="development-cards">
                <h4>发展卡</h4>
                <div class="card-levels">
                  <div v-for="level in [3, 2, 1]" :key="level" class="card-level">
                    <h5>等级 {{ level }}</h5>
                    <div class="cards-row">
                      <!-- 牌堆显示 -->
                      <div
                        class="deck-item"
                        :class="{
                          'deck-empty': getDeckRemainingCount(level) === 0,
                          selected: isReserveDeckSelected(level)
                        }"
                        role="button"
                        :tabindex="isReserveMode && getDeckRemainingCount(level) > 0 && !isBoardActionPending ? 0 : -1"
                        :aria-label="`保留等级${level}牌堆顶牌`"
                        :aria-pressed="isReserveMode ? isReserveDeckSelected(level) : undefined"
                        :aria-disabled="!isReserveMode || getDeckRemainingCount(level) === 0 || isBoardActionPending"
                        :data-deck-level="level"
                        @click="handleDeckClick(level)"
                        @keydown.enter.prevent="handleDeckClick(level)"
                        @keydown.space.prevent="handleDeckClick(level)"
                      >
                        <img
                          v-if="getDeckRemainingCount(level) > 0"
                          :src="`/images/cards/back${level}.jpg`"
                          :alt="`等级${level}牌堆`"
                          class="deck-image"
                          @error="handleDeckImageError"
                        />
                        <div
                          v-if="getDeckRemainingCount(level) > 0"
                          class="deck-count"
                        >
                          {{ getDeckRemainingCount(level) }}
                        </div>
                      </div>
                      <!-- 已翻开的发展卡 -->
                      <div
                        v-for="card in getCardsByLevel(level)"
                        :key="card.id"
                        class="card-item"
                        :class="{ selected: isReserveCardSelected(card.id) }"
                        role="button"
                        :tabindex="isBoardActionPending ? -1 : 0"
                        :aria-label="isReserveMode ? `保留发展卡：${card.name}` : `购买发展卡：${card.name}`"
                        :aria-pressed="isReserveMode ? isReserveCardSelected(card.id) : undefined"
                        :aria-disabled="isBoardActionPending || (interactionState.action.kind !== 'idle' && !isReserveMode)"
                        :data-market-card-id="card.id"
                        @click="handleCardClick(card)"
                        @keydown.enter.prevent="handleCardClick(card)"
                        @keydown.space.prevent="handleCardClick(card)"
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
                    role="img"
                    :aria-label="getNobleName(nobleId)"
                  >
                    <img 
                      :src="`/images/nobles/${nobleId}.jpg`" 
                      alt=""
                      class="noble-image"
                      @error="handleNobleImageError"
                    />

                  </div>
                </div>
              </div>
            </section>
            
            <!-- 右侧：玩家状态和操作 -->
            <div class="game-sidebar">
              <!-- 玩家状态 -->
              <section id="game-player-section" class="player-status" aria-labelledby="player-status-heading">
                <h3 id="player-status-heading" role="heading" aria-level="2">玩家状态</h3>
                <div class="players-list">
                  <div
                    v-for="player in orderedPlayers"
                    :key="player.id"
                    class="player-details"
                    :class="{ expanded: isPlayerDetailsExpanded(player.id) }"
                  >
                    <button class="player-summary" type="button" :aria-expanded="isPlayerDetailsExpanded(player.id)" @click="togglePlayerDetails(player.id)">
                      <span class="player-summary-name">
                        {{ player.name }}
                        <span v-if="player.id === currentPlayer?.id" class="player-summary-self">你</span>
                        <span v-if="isCurrentPlayerTurn(player.id)" class="player-summary-turn">当前回合</span>
                      </span>
                      <span class="player-summary-metrics">
                        <span>{{ getPlayerTokenTotal(player) }} 宝石</span>
                        <span>{{ player.points || 0 }} 分</span>
                        <span>{{ player.crowns || 0 }} 👑</span>
                        <span>{{ player.privilegeTokens || 0 }} 特权</span>
                      </span>
                    </button>
                    <PlayerStatusCard
                      :player="player"
                      :card-details="gameState?.cardDetails || {}"
                      :local-player-id="currentPlayer?.id"
                      :current-turn-player-id="gameState?.players?.[gameState.currentPlayerIndex]?.id"
                      :can-spend-privilege="isMyTurn && player.id === currentPlayer?.id && player.privilegeTokens > 0 && !gameState?.refilledThisTurn && !isBoardActionPending && interactionState.action.kind === 'idle'"
                      @spend-privilege="handleSpendPrivilege"
                      @reserved-card-click="handleReservedCardClick"
                      @card-image-error="handleCardImageError"
                      @noble-image-error="handleNobleImageError"
                    />
                  </div>
                </div>
              </section>
              
              <!-- 操作面板 -->
              <section class="action-panel mobile-collapsible-panel" :class="{ expanded: isMobilePanelExpanded('actions') }" aria-labelledby="game-actions-heading">
                <h3 role="heading" aria-level="2">
                  <button
                    id="game-actions-heading"
                    class="mobile-panel-summary"
                    type="button"
                    aria-controls="game-actions-content"
                    :aria-expanded="isMobilePanelExpanded('actions')"
                    @click="toggleMobilePanel('actions')"
                  >
                    <span>游戏操作</span>
                    <span class="mobile-panel-meta">{{ isMyTurn ? '轮到你' : '等待对手' }}</span>
                  </button>
                </h3>
                <div id="game-actions-content" class="mobile-panel-content">
                  <div v-if="isMyTurn" class="available-actions">
                  <!-- 可选行动入口迁移至：
                      - 玩家卡片右上角特权徽标（花费特权）
                      - “袋中宝石”标签（补充版图）
                  -->
                  <span class="hint-text">
                    点击你的特权徽标可花费特权；
                    <br>点击袋中宝石按钮可补充版图；
                    <br>点击版图上的宝石或珍珠可拿取宝石；
                    <br>点击版图上的黄金可保留发展卡；
                    <br>点击翻开或保留的发展卡可购买发展卡。
                  </span>
                  </div>
                  <div v-else class="waiting-turn">
                    <p>等待其他玩家操作...</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部面板区域 -->
      <div class="bottom-panels" aria-label="交流与操作记录">
        <!-- 聊天面板 -->
        <section id="game-chat-section" class="chat-panel mobile-collapsible-panel" :class="{ expanded: isMobilePanelExpanded('chat') }" aria-labelledby="game-chat-heading">
          <h3 role="heading" aria-level="2">
            <button
              id="game-chat-heading"
              class="mobile-panel-summary"
              type="button"
              aria-controls="game-chat-content"
              :aria-expanded="isMobilePanelExpanded('chat')"
              @click="toggleMobilePanel('chat')"
            >
              <span>聊天</span>
              <span class="mobile-panel-meta">{{ chatMessages.length }} 条</span>
            </button>
          </h3>
          <div id="game-chat-content" class="mobile-panel-content">
            <div class="chat-messages" ref="chatMessagesRef">
              <div
                v-for="(message, index) in chatMessages"
                :key="index"
                class="chat-message"
                :class="{ 'own-message': message.playerId === currentPlayer?.id }"
              >
                <span class="chat-player-name">{{ message.playerName }}:</span>
                <span class="message-text">{{ message.message }}</span>
              </div>
            </div>
            <div class="chat-input">
              <input
                v-model="newMessage"
                aria-label="聊天消息"
                @focus="isChatInputFocused = true"
                @blur="isChatInputFocused = false"
                @keyup.enter="sendMessage"
                placeholder="输入消息..."
                maxlength="100"
              />
              <button @click="sendMessage" class="btn btn-primary">发送</button>
            </div>
          </div>
        </section>

        <!-- 历史记录面板 -->
        <section id="game-history-section" class="history-panel mobile-collapsible-panel" :class="{ expanded: isMobilePanelExpanded('history') }" aria-labelledby="game-history-heading">
          <h3 role="heading" aria-level="2">
            <button
              id="game-history-heading"
              class="mobile-panel-summary"
              type="button"
              aria-controls="game-history-content"
              :aria-expanded="isMobilePanelExpanded('history')"
              @click="toggleMobilePanel('history')"
            >
              <span>操作历史</span>
              <span class="mobile-panel-meta">{{ gameHistory.length }} 条</span>
            </button>
          </h3>
          <div id="game-history-content" class="mobile-panel-content">
            <div class="history-list" ref="historyListRef">
              <div
                v-for="(action, index) in gameHistory.slice().reverse()"
                :key="gameHistory.length - 1 - index"
                class="history-item"
                :class="{ 'own-history-item': action.playerId === currentPlayer?.id }"
              >
                <span class="action-time">{{ formatTime(action.timestamp) }}</span>
                <span class="action-player">{{ action.playerName }}</span>
                <span class="action-text" v-if="!getActionHtml(action)">{{ action.description }}</span>
                <span class="action-text" v-else v-html="getAccessibleActionHtml(action)"></span>
              </div>
              <div v-if="preview.visible" class="history-preview-tooltip" :style="{ top: preview.y + 'px', left: preview.x + 'px' }" ref="historyPreviewRef" role="dialog" aria-label="历史图片预览">
                <img :src="preview.image" alt="" />
                <button type="button" class="history-preview-close" aria-label="关闭历史图片预览" @click="closeHistoryPreview">×</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>

    <nav v-if="!showWaitingArea && !actionDialog.visible && !contextActionBar" class="mobile-game-nav" :class="{ 'keyboard-hidden': isChatInputFocused }" aria-label="游戏区域快捷导航" :inert="victoryDialog.visible || undefined">
      <span class="mobile-turn-status">{{ isMyTurn ? '轮到你' : `等待 ${getCurrentPlayerName()}` }}</span>
      <button type="button" @click="scrollToMobileSection('game-board-section')">棋盘</button>
      <button type="button" @click="scrollToMobileSection('game-player-section')">玩家</button>
      <button type="button" @click="scrollToMobileSection('game-chat-section', 'chat')">聊天</button>
      <button type="button" @click="scrollToMobileSection('game-history-section', 'history')">历史</button>
    </nav>
    
    <!-- 通知组件 -->
    <GameNotification ref="notificationRef" />
    
    <!-- 操作确认对话框 -->
    <ActionDialog
      :visible="actionDialog.visible"
      :action-type="actionDialog.actionType"
      :title="actionDialog.title"
      :message="actionDialog.message"
      :gem-board="gameState?.gemBoard || []"
      :player-data="actionDialog.actionType === 'buyCard' ? getCurrentPlayerData() : actionDialog.playerData || null"
      :selected-card="actionDialog.selectedCard || null"
      :gem-discard-target="gameState?.gemDiscardTarget || 10"
      @confirm="handleActionConfirm"
      @cancel="handleActionCancel"
              @discard-gem="handleDiscardGem"
        @discard-gems-batch="handleDiscardGemsBatch"
      @reset="handleReset"
    />

    <!-- 胜利对话框（全局） -->
    <div v-if="victoryDialog.visible" class="victory-overlay">
      <div ref="victoryDialogRef" class="victory-dialog" role="dialog" aria-modal="true" aria-labelledby="victory-dialog-title" aria-describedby="victory-dialog-message" @keydown="handleVictoryDialogKeydown">
        <div class="victory-header">
          <h3 id="victory-dialog-title">游戏结束</h3>
        </div>
        <div class="victory-body">
          <p id="victory-dialog-message">{{ victoryDialog.message }}</p>
        </div>
        <div class="victory-footer">
          <button ref="victoryCloseButtonRef" class="btn btn-primary" @click="closeVictoryDialog">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'

// 历史记录悬停预览状态
const historyListRef = ref(null)
const preview = ref({ visible: false, image: '', x: 0, y: 0 })
const historyPreviewRef = ref(null)

const getActionHtml = (action) => action?.descriptionHtml || ''
const getAccessibleActionHtml = (action) => getActionHtml(action).replace(
  /<span class="hist-link" data-preview="([^"]+)">([^<]+)<\/span>/g,
  '<span class="hist-link" data-preview="$1" role="button" tabindex="0" aria-label="查看$2图片预览">$2</span>'
)
// 根据本地玩家优先展示自己的卡片
const orderedPlayers = computed(() => {
  return orderPlayersLocalFirst(gameState.value?.players, currentPlayer.value?.id)
})

const getPlayerTokenTotal = (player) => Object.values(player?.gems || {})
  .reduce((total, count) => total + (Number(count) || 0), 0)

onMounted(() => {
  // 悬停预览：监听包含 data-preview 的链接
  const el = historyListRef.value
  if (!el) return

  const onMouseOver = (e) => {
    const t = e.target.closest('[data-preview]')
    if (!t) return
    const img = t.getAttribute('data-preview')
    if (!img) return
    // 初次出现时先放到鼠标右下，随后在 mousemove 中校正
    preview.value = { visible: true, image: img, x: e.clientX + 12, y: e.clientY + 12 }
  }
  const onMouseMove = (e) => {
    if (!preview.value.visible) return
    // 计算卡片尺寸与视口，做位置防溢出
    const tooltipEl = historyPreviewRef.value
    const padding = 12
    const vw = window.innerWidth
    const vh = window.innerHeight
    let tx = e.clientX + 12
    let ty = e.clientY + 12
    if (tooltipEl) {
      const rect = tooltipEl.getBoundingClientRect()
      const tw = rect.width
      const th = rect.height
      // 若会溢出右侧，则放到左侧
      if (tx + tw + padding > vw) {
        tx = e.clientX - tw - 12
      }
      // 若会溢出底部，则上移
      if (ty + th + padding > vh) {
        ty = e.clientY - th - 12
      }
      // 防止再次越界
      tx = Math.max(padding, Math.min(vw - tw - padding, tx))
      ty = Math.max(padding, Math.min(vh - th - padding, ty))
    }
    preview.value = { ...preview.value, x: tx, y: ty }
  }
  const onMouseOut = (e) => {
    const t = e.target.closest('[data-preview]')
    if (t) {
      preview.value = { ...preview.value, visible: false }
    }
  }
  const showPreviewFromTarget = (target) => {
    const img = target?.getAttribute('data-preview')
    if (!img) return
    const bounds = target.getBoundingClientRect()
    preview.value = { visible: true, image: img, x: bounds.left, y: bounds.bottom + 8 }
  }
  const onClick = (e) => {
    const target = e.target.closest('[data-preview]')
    if (!target) return
    e.stopPropagation()
    if (preview.value.visible && preview.value.image === target.getAttribute('data-preview')) {
      closeHistoryPreview()
    } else {
      showPreviewFromTarget(target)
    }
  }
  const onFocusIn = (e) => {
    const target = e.target.closest('[data-preview]')
    if (target) showPreviewFromTarget(target)
  }
  const onKeyDown = (e) => {
    const target = e.target.closest('[data-preview]')
    if (!target) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      showPreviewFromTarget(target)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeHistoryPreview()
    }
  }

  el.addEventListener('mouseover', onMouseOver)
  el.addEventListener('mousemove', onMouseMove)
  el.addEventListener('mouseout', onMouseOut)
  el.addEventListener('click', onClick)
  el.addEventListener('focusin', onFocusIn)
  el.addEventListener('keydown', onKeyDown)

  // 清理函数
  onUnmounted(() => {
    el.removeEventListener('mouseover', onMouseOver)
    el.removeEventListener('mousemove', onMouseMove)
    el.removeEventListener('mouseout', onMouseOut)
    el.removeEventListener('click', onClick)
    el.removeEventListener('focusin', onFocusIn)
    el.removeEventListener('keydown', onKeyDown)
  })
})
const closeHistoryPreview = () => {
  preview.value = { visible: false, image: '', x: 0, y: 0 }
}
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import { storeToRefs } from 'pinia'
import GameNotification from '../components/GameNotification.vue'
import ActionDialog from '../components/ActionDialog.vue'
import ContextActionBar from '../components/ContextActionBar.vue'
import GemBoard from '../components/GemBoard.vue'
import PlayerStatusCard from '../components/PlayerStatusCard.vue'
import { replaceBrokenImageWithLabel } from '../image-fallback'
import {
  createGameInteractionState,
  getIllegalGemPositions,
  getSelectableGemPositions,
  toActionDialogView,
  toContextActionBarView,
  toRequestFeedbackView,
  transitionGameInteraction
} from '../game-interaction-state'
import {
  calculateCardPaymentShortfall,
  canLocalPlayerStartGame,
  countGemBagByDisplayOrder,
  findOpponent,
  findPlayerById,
  getDeckRemainingCount as selectDeckRemainingCount,
  getCardDisplayItemsByLevel,
  getGemDisplayName as selectGemDisplayName,
  getGemImageName as selectGemImageName,
  getOwnedBonusCardIds,
  getNobleDisplayName,
  getTurnPlayerName,
  getWaitingPlayers,
  isLocalPlayersTurn,
  isPlayersTurn,
  orderPlayersLocalFirst,
  shouldShowWaitingArea
} from '../game-view-selectors'

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

// 页面临时交互由一个显式模型承载，网络与权威状态仍由 store 管理
const interactionState = ref(createGameInteractionState())
const actionDialog = computed(() => toActionDialogView(interactionState.value.action))
const contextActionBar = computed(() => toContextActionBarView(interactionState.value.action))
const victoryDialog = computed(() => interactionState.value.victory.kind === 'victory'
  ? { visible: true, message: interactionState.value.victory.message }
  : { visible: false, message: '' })
const victoryDialogRef = ref(null)
const victoryCloseButtonRef = ref(null)
let victoryPreviousFocus = null

const closeVictoryDialog = () => {
  applyInteractionEvent({ type: 'CLOSE_VICTORY' })
}

const handleVictoryDialogKeydown = (event) => {
  if (event.key !== 'Tab') return
  event.preventDefault()
  victoryCloseButtonRef.value?.focus()
}

watch(() => victoryDialog.value.visible, (visible) => {
  if (visible) {
    victoryPreviousFocus = document.activeElement
    nextTick(() => victoryCloseButtonRef.value?.focus())
  } else if (victoryPreviousFocus instanceof HTMLElement) {
    nextTick(() => victoryPreviousFocus?.focus())
    victoryPreviousFocus = null
  }
})

const applyInteractionEvent = (event) => {
  const result = transitionGameInteraction(interactionState.value, event)
  interactionState.value = result.state
  result.commands.forEach(command => executeAction(command.actionType, command.data))

  if (result.schedulePurchaseFollowup) {
    setTimeout(() => {
      const action = interactionState.value.action
      if (action.kind !== 'wildcard' || action.phase !== 'awaiting-followup') return
      const followup = getPurchaseFollowup(action.purchase.card)
      applyInteractionEvent({
        type: 'RUN_PURCHASE_FOLLOWUP',
        purchaseValid: followup.valid,
        ...(followup.nobleContext ? { nobleContext: followup.nobleContext } : {})
      })
    }, 0)
  }
}

// 构建窃取对话框所需数据（包含对手宝石持有情况）
const buildStealDialogPlayerData = () => {
  const players = gameState.value?.players || []
  const meId = getCurrentPlayerData()?.id
  const opponent = players.find(p => p.id !== meId) || {}
  return { opponent: { gems: opponent.gems || {} } }
}

const getPurchaseFollowup = (card) => {
  const me = getCurrentPlayerData()
  const detail = gameState.value?.cardDetails?.[card?.id]
  if (!me || !detail) return { valid: false }

  const crownsBefore = me.crowns || 0
  const crownsAfter = crownsBefore + (detail.crowns || 0)
  const owned = me.nobles?.length || 0
  const canChooseNoble = (owned === 0 && crownsBefore < 3 && crownsAfter >= 3) ||
    (owned === 1 && crownsBefore < 6 && crownsAfter >= 6)

  return {
    valid: true,
    ...(canChooseNoble ? {
      nobleContext: {
        playerData: {
          ownedNobles: me.nobles || [],
          availableNobles: gameState.value?.availableNobles || []
        }
      }
    } : {})
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
const { currentRoom, currentPlayer, gameState, isConnected, connectionStatus, chatMessages, gameHistory, pendingActions, lastActionResult } = storeToRefs(gameStore)
const isChatInputFocused = ref(false)
const expandedMobilePanels = ref(new Set(['chat']))
const isMobilePanelExpanded = (panelId) => expandedMobilePanels.value.has(panelId)
const toggleMobilePanel = (panelId) => {
  const next = new Set(expandedMobilePanels.value)
  next.has(panelId) ? next.delete(panelId) : next.add(panelId)
  expandedMobilePanels.value = next
}
const scrollToMobileSection = async (sectionId, panelId) => {
  if (panelId && !expandedMobilePanels.value.has(panelId)) {
    expandedMobilePanels.value = new Set([...expandedMobilePanels.value, panelId])
    await nextTick()
  }
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  document.getElementById(sectionId)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
}
const expandedPlayerIds = ref(new Set())
const isPlayerDetailsExpanded = (playerId) => expandedPlayerIds.value.has(playerId)
const togglePlayerDetails = (playerId) => {
  const next = new Set(expandedPlayerIds.value)
  next.has(playerId) ? next.delete(playerId) : next.add(playerId)
  expandedPlayerIds.value = next
}
watch(() => currentPlayer.value?.id, (playerId) => {
  if (playerId && expandedPlayerIds.value.size === 0) {
    expandedPlayerIds.value = new Set([playerId])
  }
}, { immediate: true })
const connectionStatusText = computed(() => ({
  connected: '已连接',
  connecting: '连接中…',
  reconnecting: '正在重连…',
  disconnected: '未连接'
}[connectionStatus.value] || '未连接'))

// 袋中宝石：悬停状态
const bagHover = ref(false)
const bagCounts = computed(() => countGemBagByDisplayOrder(gameState.value?.gemBag))

// 计算属性
const canStartGame = computed(() => {
  return canLocalPlayerStartGame(gameState.value, currentPlayer.value?.id)
})

// 等待玩家列表（从游戏状态中获取）
const waitingPlayers = computed(() => {
  return getWaitingPlayers(gameState.value)
})

// 是否显示等待区域
const showWaitingArea = computed(() => {
  return shouldShowWaitingArea(gameState.value)
})

const isMyTurn = computed(() => {
  return isLocalPlayersTurn(gameState.value, currentPlayer.value?.id)
})

const isBoardActionPending = computed(() => {
  const feedback = interactionState.value.feedback
  if (feedback.kind === 'pending' || feedback.kind === 'unknown') return true
  return Object.values(pendingActions.value).some(action => action.status === 'pending' || action.status === 'unknown')
})
const selectedBoardGems = computed(() => {
  const action = interactionState.value.action
  if (action.kind === 'take-gems' || action.kind === 'spend-privilege') return action.selectedGems
  if (action.kind === 'reserve-card') return [{ ...action.selectedGold, type: 'gold' }]
  return []
})
const gemBoardMode = computed(() => {
  const action = interactionState.value.action
  return action.kind === 'take-gems' || action.kind === 'spend-privilege' || action.kind === 'reserve-card'
    ? action.kind
    : 'idle'
})
const isReserveMode = computed(() => interactionState.value.action.kind === 'reserve-card')
const isReserveCardSelected = (cardId) => {
  const action = interactionState.value.action
  return action.kind === 'reserve-card' && action.target?.type === 'market-card' && action.target.cardId === cardId
}
const isReserveDeckSelected = (level) => {
  const action = interactionState.value.action
  return action.kind === 'reserve-card' && action.target?.type === 'deck' && action.target.level === level
}
const occupiedBoardPositions = computed(() => (gameState.value?.gemBoard || []).flatMap((row, x) =>
  row.flatMap((type, y) => type ? [{ x, y }] : [])
))
const boardSelectablePositions = computed(() => {
  const action = interactionState.value.action
  if (action.kind === 'take-gems' || action.kind === 'spend-privilege') {
    return isBoardActionPending.value ? [] : getSelectableGemPositions(gameState.value?.gemBoard || [], action)
  }
  if (action.kind !== 'idle' || !isMyTurn.value || isBoardActionPending.value || victoryDialog.value.visible) return []
  return occupiedBoardPositions.value
})
const boardIllegalPositions = computed(() => {
  const action = interactionState.value.action
  if (action.kind === 'take-gems' || action.kind === 'spend-privilege') {
    return getIllegalGemPositions(gameState.value?.gemBoard || [], action)
  }
  return []
})

const getCurrentPlayerData = () => {
  return findPlayerById(gameState.value?.players, currentPlayer.value?.id) || {}
}

// 获取对手数据
const getOpponentData = () => {
  return findOpponent(gameState.value?.players, currentPlayer.value?.id) || {}
}

// 获取当前玩家名称
const getCurrentPlayerName = () => {
  return getTurnPlayerName(gameState.value)
}

// 检查是否是当前玩家的回合
const isCurrentPlayerTurn = (playerId) => {
  if (!gameState?.value || gameState.value.currentPlayerIndex === undefined) return false
  return isPlayersTurn(gameState.value, playerId)
}

// 根据等级获取发展卡（从后端数据中获取）
const getCardsByLevel = (level) => {
  return getCardDisplayItemsByLevel(gameState.value, level)
}

// 获取宝石显示名称
const getGemDisplayName = (gemType) => {
  return selectGemDisplayName(gemType)
}

// 获取宝石图片名称
const getGemImageName = (gemType) => {
  return selectGemImageName(gemType)
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
  if (!gameState?.value?.players || !gameState?.value?.cardDetails) {
    return []
  }
  
  const player = findPlayerById(gameState.value.players, playerId)
  if (!player?.developmentCards) {
    return []
  }

  return getOwnedBonusCardIds(player, gameState.value.cardDetails, color)
}

// 获取牌堆剩余数量（从后端数据中获取）
const getDeckRemainingCount = (level) => {
  return selectDeckRemainingCount(gameState.value, level)
}

// 获取贵族名称
const getNobleName = (nobleId) => {
  return getNobleDisplayName(nobleId)
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
  console.warn('宝石图片加载失败')
  replaceBrokenImageWithLabel(event.target, event.target.alt || '宝石', 'gem-text-fallback')
}

// 处理发展卡图片加载错误
const handleCardImageError = (event) => {
  console.warn('发展卡图片加载失败')
  replaceBrokenImageWithLabel(event.target, event.target.alt || '发展卡', 'card-text-fallback')
}

// 处理贵族卡图片加载错误
const handleNobleImageError = (event) => {
  console.warn('贵族卡图片加载失败')
  replaceBrokenImageWithLabel(event.target, event.target.alt || '贵族', 'card-text-fallback')
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

// 处理购买发展卡操作
const handleBuyCard = () => {
  if (!isMyTurn.value) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '不是你的回合')
    }
    return
  }
  
  applyInteractionEvent({ type: 'OPEN_PURCHASE_PAYMENT', title: '购买发展卡', card: null })
}

// 真实黄金进入内联保留模式；具体规则仍由后端权威校验
const handleReserveCard = (goldX, goldY) => {
  if (!isMyTurn.value) {
    notificationRef.value?.error('错误', '不是你的回合')
    return
  }
  if (isBoardActionPending.value || interactionState.value.action.kind !== 'idle') {
    notificationRef.value?.info('请稍候', '当前操作尚未结束')
    return
  }

  applyInteractionEvent({
    type: 'OPEN_RESERVE_CARD',
    selectedGold: { x: goldX, y: goldY }
  })
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
  
  applyInteractionEvent({
    type: 'OPEN_SPEND_PRIVILEGE',
    maxPrivilegeCount: currentPlayerData.privilegeTokens
  })
}

// 袋子入口进入内联补盘确认态
const handleRefillBoard = () => {
  if (!isMyTurn.value) {
    notificationRef.value?.error('错误', '不是你的回合')
    return
  }
  if (isBoardActionPending.value) {
    notificationRef.value?.info('请稍候', '正在等待上一项棋盘操作的服务器结果')
    return
  }
  if (interactionState.value.action.kind !== 'idle') return

  const bagCount = Array.isArray(gameState.value?.gemBag) ? gameState.value.gemBag.length : null
  if (bagCount !== null && bagCount <= 0) {
    notificationRef.value?.info('无法补充', '袋子为空，无法补充版图')
    return
  }

  applyInteractionEvent({ type: 'OPEN_REFILL_CONFIRM' })
}

// 处理操作对话框确认
const handleActionConfirm = (data) => {
  switch (data.actionType) {
    case 'buyCard': {
      if (!data.selectedCard?.id) {
        notificationRef.value?.error('错误', '没有选择要购买的发展卡')
        return
      }
      const detail = gameState.value?.cardDetails?.[data.selectedCard.id]
      const effects = detail?.effects || data.selectedCard.effects || []
      const followup = getPurchaseFollowup(data.selectedCard)
      applyInteractionEvent({
        type: 'CONFIRM_PURCHASE_PAYMENT',
        card: data.selectedCard,
        paymentPlan: data.paymentPlan || {},
        effects,
        extraTokenMessage: `请选择一个${getGemDisplayName(data.selectedCard.bonus || data.selectedCard.color)} token，若场上无${getGemDisplayName(data.selectedCard.bonus || data.selectedCard.color)} token 可点击跳过`,
        extraTokenPlayerData: getCurrentPlayerData(),
        stealPlayerData: buildStealDialogPlayerData(),
        wildcardPlayerData: { bonus: getCurrentPlayerData()?.bonus || {} },
        ...(followup.nobleContext ? { nobleContext: followup.nobleContext } : {})
      })
      return
    }
    case 'takeExtraToken': {
      const action = interactionState.value.action
      const followup = action.kind === 'extra-token'
        ? getPurchaseFollowup(action.purchase.card)
        : { valid: false }
      applyInteractionEvent({
        type: 'CONFIRM_EXTRA_TOKEN',
        selectedGems: data.selectedGems || [],
        purchaseValid: followup.valid,
        ...(followup.nobleContext ? { nobleContext: followup.nobleContext } : {})
      })
      return
    }
    case 'stealToken': {
      const action = interactionState.value.action
      const followup = action.kind === 'steal-token'
        ? getPurchaseFollowup(action.purchase.card)
        : { valid: false }
      applyInteractionEvent({
        type: 'CONFIRM_STEAL_TOKEN',
        stealGemType: data.stealGemType || null,
        purchaseValid: followup.valid,
        ...(followup.nobleContext ? { nobleContext: followup.nobleContext } : {})
      })
      return
    }
    case 'chooseNoble':
      applyInteractionEvent({
        type: 'CONFIRM_NOBLE',
        nobleId: data.nobleId,
        stealPlayerData: buildStealDialogPlayerData()
      })
      return
    case 'chooseWildcardColor':
      applyInteractionEvent({ type: 'CONFIRM_WILDCARD', wildcardColor: data.wildcardColor })
      return
    case 'discardGems':
      if (data.completed) {
        stopDiscardDialogCheck()
        applyInteractionEvent({ type: 'COMPLETE_MANDATORY_DISCARD' })
      }
      return
  }
}

const handleActionCancel = (data) => {
  const canceledType = data?.actionType || actionDialog.value.actionType
  if (canceledType === 'discardGems' && data?.closed) {
    startDiscardDialogCheck()
  }
  applyInteractionEvent({ type: 'CANCEL_ACTION' })
}

// 处理丢弃宝石
const handleDiscardGem = (data) => {
  const { gemType } = data
  // 向后端发送丢弃宝石请求
  executeAction('discardGem', {
    gemType: gemType
  })
}

// 处理批量丢弃宝石
const handleDiscardGemsBatch = (data) => {
  const { gemDiscards } = data
  // 向后端发送批量丢弃宝石请求
  executeAction('discardGemsBatch', {
    gemDiscards: gemDiscards
  })
}

// 处理重置宝石丢弃
const handleReset = () => {
  applyInteractionEvent({ type: 'RESET_MANDATORY_DISCARD' })
}

// 执行游戏操作（向后端发送请求）
const executeAction = (actionType, data) => {
  if (!isMyTurn.value) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '不是你的回合')
    }
    return
  }
  
  // 向后端发送操作请求，让后端处理所有游戏逻辑
  try {
    const requestId = gameStore.sendGameAction(actionType, data)
    applyInteractionEvent({
      type: 'REQUEST_SENT',
      requestId: typeof requestId === 'string' ? requestId : '',
      actionType
    })
    const feedback = toRequestFeedbackView(interactionState.value.feedback)
    if (feedback) notificationRef.value?.info(feedback.title, feedback.message)
  } catch (error) {
    console.error('发送操作请求失败')
    if (notificationRef.value) {
      notificationRef.value.error('错误', '发送操作请求失败')
    }
  }
}



// 宝石丢弃对话框检查定时器
let discardDialogCheckTimer = null

// 保持既有 500ms 权威状态重开语义
const startDiscardDialogCheck = () => {
  if (discardDialogCheckTimer) {
    clearInterval(discardDialogCheckTimer)
  }

  discardDialogCheckTimer = setInterval(() => {
    const authoritativeState = gameStore.gameState
    if (!authoritativeState?.needsGemDiscard) {
      clearInterval(discardDialogCheckTimer)
      discardDialogCheckTimer = null
      return
    }

    const action = interactionState.value.action
    if (action.kind === 'mandatory-discard' && action.completed) {
      return
    }

    if (authoritativeState.gemDiscardPlayerID === currentPlayer.value?.id &&
        (!actionDialog.value.visible || actionDialog.value.actionType !== 'discardGems')) {
      applyInteractionEvent({
        type: 'REOPEN_MANDATORY_DISCARD',
        playerData: getCurrentPlayerData()
      })
      clearInterval(discardDialogCheckTimer)
      discardDialogCheckTimer = null
    }
  }, 500)
}

// 停止宝石丢弃对话框检查
const stopDiscardDialogCheck = () => {
  if (discardDialogCheckTimer) {
    clearInterval(discardDialogCheckTimer)
    discardDialogCheckTimer = null
  }
}

// 真实棋盘只上报坐标意图，页面决定当前动作模式
const handleBoardGemSelect = (position) => {
  const type = gameState.value?.gemBoard?.[position.x]?.[position.y]
  if (!type) return
  const gem = { ...position, type }
  const action = interactionState.value.action
  if (action.kind === 'take-gems' || action.kind === 'spend-privilege') {
    applyInteractionEvent({ type: 'SELECT_BOARD_GEM', gem })
    return
  }
  if (action.kind !== 'idle') return
  if (!isMyTurn.value) {
    notificationRef.value?.error('错误', '不是你的回合')
    return
  }
  if (isBoardActionPending.value) {
    notificationRef.value?.info('请稍候', '正在等待上一项棋盘操作的服务器结果')
    return
  }

  if (gem.type === 'gold') {
    const reserved = getCurrentPlayerData()?.reservedCards?.length || 0
    if (reserved >= 3) {
      notificationRef.value?.error('无法保留', '已经保留 3 张发展卡')
      return
    }
    handleReserveCard(gem.x, gem.y)
    return
  }

  applyInteractionEvent({
    type: 'OPEN_TAKE_GEMS',
    message: '请选择 1–3 枚连续同线的非黄金宝石。',
    initialGemPosition: gem
  })
}

const handleBoardGemCancel = (position) => {
  const action = interactionState.value.action
  if (action.kind === 'reserve-card' && action.selectedGold.x === position.x && action.selectedGold.y === position.y) {
    applyInteractionEvent({ type: 'CANCEL_ACTION' })
    return
  }
  applyInteractionEvent({ type: 'DESELECT_BOARD_GEM', position })
}

const handleBoardSelectionClear = () => {
  applyInteractionEvent({
    type: interactionState.value.action.kind === 'reserve-card' ? 'CLEAR_RESERVE_TARGET' : 'CLEAR_BOARD_GEMS'
  })
}

const handleBoardSelectionCancel = () => {
  applyInteractionEvent({ type: 'CANCEL_ACTION' })
}

const handlePrivilegeCountChange = (count) => {
  applyInteractionEvent({ type: 'SET_PRIVILEGE_COUNT', count })
}

const handleBoardSelectionConfirm = () => {
  if (!isMyTurn.value) {
    notificationRef.value?.error('错误', '不是你的回合')
    return
  }
  if (isBoardActionPending.value) {
    notificationRef.value?.info('请稍候', '正在等待上一项棋盘操作的服务器结果')
    return
  }

  const action = interactionState.value.action
  if (action.kind === 'take-gems') {
    applyInteractionEvent({ type: 'CONFIRM_TAKE_GEMS' })
    return
  }
  if (action.kind === 'spend-privilege') {
    applyInteractionEvent({ type: 'CONFIRM_SPEND_PRIVILEGE' })
    return
  }
  if (action.kind === 'reserve-card') {
    if (gameState.value?.gemBoard?.[action.selectedGold.x]?.[action.selectedGold.y] !== 'gold') {
      notificationRef.value?.error('无法保留', '所选黄金已不在版图上')
      return
    }
    if ((getCurrentPlayerData()?.reservedCards?.length || 0) >= 3) {
      notificationRef.value?.error('无法保留', '已经保留 3 张发展卡')
      return
    }
    if (action.target?.type === 'market-card') {
      const stillAvailable = getCardsByLevel(action.target.level).some(card => card.id === action.target.cardId)
      if (!stillAvailable) {
        notificationRef.value?.error('无法保留', '所选发展卡已不在市场中')
        return
      }
    } else if (action.target?.type === 'deck') {
      if (getDeckRemainingCount(action.target.level) <= 0) {
        notificationRef.value?.error('无法保留', '所选牌堆已为空')
        return
      }
    } else {
      return
    }
    applyInteractionEvent({ type: 'CONFIRM_RESERVE_CARD' })
    return
  }
  if (action.kind === 'refill-confirm') {
    if (!Array.isArray(gameState.value?.gemBag) || gameState.value.gemBag.length === 0) {
      notificationRef.value?.info('无法补充', '袋子为空，无法补充版图')
      return
    }
    applyInteractionEvent({ type: 'CONFIRM_REFILL_BOARD' })
  }
}

// 统一的购买发展卡点击处理函数
const handleBuyCardClick = (card, isReserved = false, playerId = null) => {
  if (!isMyTurn.value) {
    if (notificationRef.value) {
      notificationRef.value.error('错误', '不是你的回合')
    }
    return
  }
  if (isBoardActionPending.value || interactionState.value.action.kind !== 'idle') {
    notificationRef.value?.info('请稍候', '当前操作尚未结束')
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
  applyInteractionEvent({
    type: 'OPEN_PURCHASE_PAYMENT',
    title: isReserved ? '购买保留的发展卡' : '购买发展卡',
    card,
    playerData: getCurrentPlayerData()
  })
}

// 真实市场卡在保留模式选择目标，其他时候保持既有购买入口
const handleCardClick = (card) => {
  const action = interactionState.value.action
  if (action.kind === 'reserve-card') {
    if (isBoardActionPending.value) return
    applyInteractionEvent({
      type: 'TOGGLE_RESERVE_TARGET',
      target: {
        type: 'market-card',
        cardId: card.id,
        level: card.level,
        name: card.name || `卡牌${card.id}`
      }
    })
    return
  }
  if (action.kind !== 'idle' || isBoardActionPending.value) return
  handleBuyCardClick(card, false)
}

const handleDeckClick = (level) => {
  if (!isReserveMode.value || isBoardActionPending.value || getDeckRemainingCount(level) <= 0) return
  applyInteractionEvent({ type: 'TOGGLE_RESERVE_TARGET', target: { type: 'deck', level } })
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
    return false
  }
  
  const cardDetail = gameState.value.cardDetails[cardId]
  if (!cardDetail) {
    return false
  }
  
  const player = getCurrentPlayerData()
  const { canAfford, missingGems } = calculateCardPaymentShortfall(cardDetail, player)

  if (canAfford) {
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
  // 立即检查一次
  if (currentPlayer.value && currentRoom.value) {
    initializeGame()
  } else {
    // 等待最多2秒让store状态更新
    let attempts = 0
    const maxAttempts = 20
    
    const checkInterval = setInterval(() => {
      attempts++
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

watch(pendingActions, (actions) => {
  const unknownAction = Object.values(actions).find(action => action.status === 'unknown')
  if (!unknownAction) return
  applyInteractionEvent({
    type: 'REQUEST_UNKNOWN',
    requestId: unknownAction.requestId,
    actionType: unknownAction.actionType
  })
  const feedback = toRequestFeedbackView(interactionState.value.feedback)
  if (feedback) notificationRef.value?.warning(feedback.title, feedback.message)
}, { deep: true })

watch(lastActionResult, (result) => {
  if (!result) return
  applyInteractionEvent(result.success
    ? { type: 'ACK_SUCCESS', requestId: result.requestId, actionType: result.actionType, replayed: result.replayed }
    : { type: 'ACK_FAILURE', requestId: result.requestId, actionType: result.actionType, message: result.message })
  if (!notificationRef.value) return
  const feedback = toRequestFeedbackView(interactionState.value.feedback)
  if (!feedback) return
  if (result.success) {
    notificationRef.value.success(feedback.title, feedback.message)
  } else {
    notificationRef.value.error(feedback.title, feedback.message)
  }
})

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
    applyInteractionEvent({
      type: 'SHOW_VICTORY',
      message: `${playerName} 因为 ${reasonsStr} 获得本局游戏胜利！`
    })
  }
  
  // 权威状态要求当前玩家丢弃时，强制进入专用状态
  if (newState?.needsGemDiscard && newState.gemDiscardPlayerID === currentPlayer.value?.id) {
    if (!actionDialog.value.visible || actionDialog.value.actionType !== 'discardGems') {
      stopDiscardDialogCheck()
      applyInteractionEvent({
        type: 'AUTHORITY_REQUIRES_DISCARD',
        playerData: getCurrentPlayerData()
      })
    }
  }
}, { deep: true })
</script>

<style scoped>
.game-container {
  min-height: 100vh;
  min-width: 0;
  background: var(--color-canvas);
  color: var(--color-ink);
}

.game-header {
  background: var(--color-surface);
  padding: var(--space-4) var(--page-gutter);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: var(--shadow-surface);
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
  gap: var(--space-6);
  padding: var(--space-6) var(--page-gutter);
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
}

.game-board-area {
  min-width: 0;
  background: var(--color-surface);
  border-radius: var(--radius-surface);
  padding: var(--space-6);
  box-shadow: var(--shadow-surface);
  min-height: 600px;
}

.game-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--space-6);
  align-items: flex-start;
}

.game-layout > * {
  min-width: 0;
}

/* 游戏版图样式 */
.game-board {
  min-width: 0;
  background: var(--color-surface-subtle);
  border-radius: var(--radius-card);
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

/* 袋中宝石浮层与触发器 */
.bag-container { position: relative; }
.bag-pill {
  position: relative;
  background: #ffffff;
  color: #495057;
  border: 1px solid #dee2e6;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.bag-pill::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: max(100%, 44px);
  height: 44px;
  transform: translate(-50%, -50%);
}
.bag-pill.selected {
  border-color: var(--color-action);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .24);
}
.bag-pill[aria-disabled="true"] { cursor: default; }
.metric-badge.clickable { cursor: pointer; box-shadow: 0 0 0 0 rgba(13,110,253,0); transition: box-shadow .2s ease; }
.metric-badge.clickable:hover { box-shadow: 0 0 0 3px rgba(13,110,253,0.25); }
.hint-text { font-size: 12px; color: #6c757d; }
.bag-tooltip {
  position: absolute;
  top: 150%;
  right: 0;
  background: #ffffff;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  padding: 8px 10px;
  z-index: 1200;
  min-width: 180px;
}
.bag-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.bag-item { display: flex; align-items: center; gap: 4px; }
.bag-count { font-weight: 700; color: #495057; font-size: 12px; }
.bag-gem { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }

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

.card-item.selected,
.deck-item.selected {
  box-shadow: 0 0 0 3px var(--color-action);
}

.card-item[aria-disabled="true"],
.deck-item[aria-disabled="true"] {
  cursor: default;
}

.card-item[aria-disabled="true"]:hover,
.deck-item[aria-disabled="true"]:hover {
  transform: none;
  box-shadow: none;
}

.card-image {
  width: 96px;
  height: 144px;
  object-fit: cover;
  border-radius: 10px;
}

/* 牌堆样式 */
.deck-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px;
  margin-right: 36px; /* 牌堆与发展卡之间的间距 */
  cursor: pointer;
  transition: all 0.2s;
}

.deck-item:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.deck-image {
  width: 96px;
  height: 144px;
  object-fit: cover;
  border-radius: 10px;
  border: 4px solid #ccccdd; /* 深色边框 */
}

.deck-count {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  background: #ffffff;
  border: 2px solid #445566;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: #334455;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  opacity: 1;
  transition: opacity 0.2s;
}

.deck-item:hover .deck-count {
  opacity: 1;
}

/* 空牌堆样式 */
.deck-item.deck-empty {
  cursor: default;
  /* 确保空牌堆也占据相同的宽度，包括padding和border */
  width: 104px; /* 96px (deck-image) + 4px (border) + 4px (padding) */
  height: 152px; /* 144px (deck-image) + 4px (border) + 4px (padding) */
  /* 添加一个透明的占位边框 */
  border: 4px solid transparent;
  border-radius: 10px;
  box-sizing: border-box;
}

.deck-item.deck-empty:hover {
  transform: none;
  box-shadow: none;
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
  width: 80px;
  height: 120px;
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
  width: 100%;
  min-width: 0;
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

.player-details {
  display: contents;
}

.player-summary {
  display: none;
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
  flex-direction: column;
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
  width: 48px;
  height: 72px;
  border: 2px solid #e9ecef;
  border-radius: 5px;
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
  width: 60px;
  height: 90px;
  object-fit: cover;
  border-radius: 6px;
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

.mobile-panel-summary {
  display: contents;
  color: inherit;
  font: inherit;
}

.mobile-panel-meta {
  display: none;
}

.mobile-panel-content {
  display: block;
}

.mobile-game-nav {
  display: none;
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
  flex: 1 1 0%;
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

.chat-player-name {
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
  height: 320px;
  overflow-y: auto;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  /*padding: 12px;*/
  background: #f8f9fa;
}

.history-item {
  padding: 8px 12px;
  background: #ffffff;
  border-bottom: 1px solid #e9ecef;
  /*border-radius: 16px;
  max-width: 80%;*/
  font-size: 14px;
}

.history-item:last-child {
  border-bottom: none;
}

.history-item.own-history-item {
  background: #e3f2fd;
  /*margin-left: auto;
  text-align: right;*/
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
  .game-layout { grid-template-columns: minmax(0, 1fr); }
  .bottom-panels { flex-direction: column; }
  .chat-panel, .history-panel { width: 100%; }
}

@media (max-width: 768px) {
  .game-main {
    gap: var(--space-4);
    padding-top: var(--space-4);
    padding-bottom: calc(84px + env(safe-area-inset-bottom));
  }

  #game-board-section,
  #game-player-section,
  #game-chat-section,
  #game-history-section {
    scroll-margin-top: var(--space-3);
  }

  .game-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3) var(--space-4);
    text-align: left;
  }

  .room-info { min-width: 0; }
  .room-info h2, .room-info p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .room-info h2 { font-size: 20px; line-height: 28px; }

  .player-info {
    grid-column: 1 / -1;
    grid-row: 2;
    flex-direction: row;
    justify-content: space-between;
  }

  .game-board-area {
    padding: var(--space-3);
    border-radius: var(--radius-card);
    min-height: 0;
  }
  .game-board { padding: var(--space-3); }

  .board-header {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .game-status {
    width: 100%;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
  }
  .bag-container { margin-left: auto; }

  .game-main.has-context-action {
    padding-bottom: calc(230px + env(safe-area-inset-bottom));
  }

  .development-cards {
    min-width: 0;
  }

  .card-level {
    min-width: 0;
  }

  .cards-row {
    flex-wrap: nowrap;
    gap: var(--space-2);
    margin-inline: calc(-1 * var(--space-3));
    padding: 0 var(--space-3) var(--space-2);
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-inline: contain;
    scroll-padding-inline: var(--space-3);
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
  }

  .cards-row > * {
    flex: 0 0 auto;
    scroll-snap-align: start;
  }

  .deck-item {
    margin-right: var(--space-2);
  }

  .card-image,
  .deck-image {
    width: 84px;
    height: 126px;
  }

  .deck-item.deck-empty {
    width: 92px;
    height: 134px;
  }

  .player-status, .action-panel, .chat-panel, .history-panel {
    padding: var(--space-4);
  }

  .mobile-collapsible-panel > h3 {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .mobile-panel-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .mobile-panel-summary::after {
    content: '展开';
    color: var(--color-action);
    font-size: 12px;
    font-weight: 400;
  }

  .mobile-collapsible-panel.expanded > h3 .mobile-panel-summary::after {
    content: '收起';
  }

  .mobile-panel-meta {
    display: inline;
    margin-left: auto;
    color: var(--color-ink-muted);
    font-size: 12px;
    font-weight: 400;
  }

  .mobile-collapsible-panel > .mobile-panel-content {
    display: none;
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  .mobile-collapsible-panel.expanded > .mobile-panel-content {
    display: block;
  }

  .chat-messages,
  .history-list {
    height: min(42vh, 280px);
    overscroll-behavior-y: contain;
  }

  .player-details {
    display: block;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    overflow: hidden;
    background: var(--color-surface-subtle);
  }

  .player-summary {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 44px;
    padding: var(--space-3);
    cursor: pointer;
    list-style: none;
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .player-summary::after {
    content: '展开详情';
    align-self: flex-end;
    color: var(--color-action);
    font-size: 12px;
  }

  .player-details.expanded > .player-summary::after { content: '收起详情'; }

  .player-summary-name,
  .player-summary-metrics {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .player-summary-name { font-weight: 600; }
  .player-summary-metrics { color: var(--color-ink-muted); font-size: 12px; }
  .player-summary-self,
  .player-summary-turn {
    padding: 2px 6px;
    border-radius: var(--radius-pill);
    font-size: 12px;
  }
  .player-summary-self { background: #e3f2fd; color: #1976d2; }
  .player-summary-turn { background: #d4edda; color: var(--color-turn); }

  .player-details > :deep(.player-card) {
    display: none;
  }

  .player-details.expanded > :deep(.player-card) {
    display: block;
    border: 0;
    border-top: 1px solid var(--color-border);
    border-radius: 0;
  }
  .bottom-panels { gap: var(--space-4); }

  .mobile-game-nav {
    position: fixed;
    z-index: 500;
    right: var(--page-gutter);
    bottom: max(var(--space-2), env(safe-area-inset-bottom));
    left: var(--page-gutter);
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) repeat(4, minmax(44px, 1fr));
    align-items: stretch;
    min-height: 52px;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: rgba(255, 255, 255, 0.96);
    box-shadow: var(--shadow-overlay);
    backdrop-filter: blur(12px);
  }

  .mobile-turn-status,
  .mobile-game-nav button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: var(--space-2);
    border: 0;
    background: transparent;
    color: var(--color-ink);
    font: inherit;
    font-size: 12px;
    text-align: center;
  }

  .mobile-turn-status {
    overflow: hidden;
    background: var(--color-surface-subtle);
    color: var(--color-turn);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-game-nav button {
    min-height: 44px;
    border-left: 1px solid var(--color-border);
    cursor: pointer;
  }

  .mobile-game-nav.keyboard-hidden {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
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

/* 历史记录富文本内的宝石小图标 */
:deep(.hist-gem) {
  width: 20px;
  height: 20px;
  object-fit: cover;
  border-radius: 50%;
  display: inline-block;
  vertical-align: middle;
  margin: 0 2px;
}
/* 历史记录悬停图片预览 */
.history-preview-tooltip {
  position: fixed;
  z-index: 3000;
  background: rgba(255,255,255,0.98);
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.25);
  pointer-events: auto;
}
.history-preview-tooltip img {
  max-width: 150px;
  max-height: 220px;
  display: block;
  border-radius: 8px;
}

.history-preview-close {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, .9);
  color: var(--color-ink);
}
/* 悬停可预览的文字样式 */
.hist-link {
  cursor: pointer;
  color: #0d6efd;
  text-decoration: underline;
}

/* 玩家信息头部指标 */
.player-metrics {
  display: flex;
  gap: 6px;
}
.player-header-top {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.player-metrics-row {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  justify-content: center;
}
.metric-badge {
  background: #ffffff;
  color: #495057;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  border: 1px solid #dee2e6;
}

/* 皇冠徽章悬停提示样式 */
.crown-badge {
  position: relative;
}

.crown-badge.has-nobles {
  cursor: pointer;
}

.noble-tooltip {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: #ffffff;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  padding: 8px;
  z-index: 1000;
  margin-top: 8px;
}

.noble-tooltip::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid #ffffff;
}

.noble-tooltip::after {
  content: '';
  position: absolute;
  top: -7px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 7px solid #dee2e6;
  z-index: -1;
}

.noble-tooltip-content {
  display: flex;
  gap: 6px;
  align-items: center;
}

.noble-tooltip-image {
  width: 60px;
  height: 90px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #dee2e6;
}

/* token 容器（两行5个占位符 + 溢出换行） */
.token-board { display: flex; flex-direction: column; gap: 6px; }
.token-row { display: flex; gap: 6px; }
.token-row.overflow { margin-top: 6px; }
.token-cell {
  width: 40px; height: 40px;
  border-radius: 50%;
  border: 2px dashed #ced4da; /* 占位外观 */
  display: flex; align-items: center; justify-content: center;
  background: transparent;
}
.token-cell.has-token {
  border: 2px solid transparent; /* 有宝石时不显示占位边框 */
}
.token-cell.no-placeholder { border: none; }
.token-gem-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

/* 奖励叠放 */
.bonus-stacks { 
  display: flex; 
  gap: 20px; 
  align-items: flex-end; 
  margin-bottom: 8px; /* 增加行间距 */
}
.bonus-stacks:last-child { margin-bottom: 0; } /* 最后一行不需要底部间距 */
.bonus-column { 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  min-width: 60px; /* 确保每列有固定宽度，保持间距一致 */
}
.bonus-stack { display: flex; flex-direction: column; align-items: center; }
.bonus-label { margin-top: 4px; font-size: 11px; color: #6c757d; }

</style>
