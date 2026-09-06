<template>
  <div
    class="player-card"
    :class="{ 'current-player': player.id === localPlayerId, 'active-turn': player.id === currentTurnPlayerId }"
  >
    <div class="player-header">
      <div class="player-header-top">
        <span class="player-name">{{ player.name }}</span>
      </div>
      <div class="player-metrics player-metrics-row">
        <span
          class="metric-badge privilege-badge"
          :class="{ clickable: canSpendPrivilege }"
          :title="canSpendPrivilege ? '点击花费特权' : ''"
          @click="canSpendPrivilege ? emit('spend-privilege') : null"
        >
          {{ player.privilegeTokens || 0 }}♟
        </span>
        <span class="metric-badge">{{ player.points || 0 }}🔸{{ maxSameColorPoints }}</span>
        <span
          class="metric-badge crown-badge"
          :class="{ 'has-nobles': nobleIds.length > 0 }"
          @mouseenter="showNobleTooltip = true"
          @mouseleave="showNobleTooltip = false"
        >
          {{ player.crowns || 0 }}👑
          <div v-if="showNobleTooltip && nobleIds.length > 0" class="noble-tooltip">
            <div class="noble-tooltip-content">
              <img
                v-for="nobleId in nobleIds"
                :key="nobleId"
                :src="`/images/nobles/${nobleId}.jpg`"
                :alt="getNobleDisplayName(nobleId)"
                class="noble-tooltip-image"
                @error="emit('noble-image-error', $event)"
              />
            </div>
          </div>
        </span>
      </div>
    </div>

    <div class="player-gems">
      <h5>宝石</h5>
      <div class="token-board">
        <div class="token-row">
          <div v-for="(cell, idx) in tokenLayout.firstRow" :key="`cell-1-${idx}`" class="token-cell" :class="{ 'has-token': !!cell }">
            <img v-if="cell" :src="`/images/gems/${getGemImageName(cell)}.jpg`" class="token-gem-img" :alt="cell" />
          </div>
        </div>
        <div class="token-row">
          <div v-for="(cell, idx) in tokenLayout.secondRow" :key="`cell-2-${idx}`" class="token-cell" :class="{ 'has-token': !!cell }">
            <img v-if="cell" :src="`/images/gems/${getGemImageName(cell)}.jpg`" class="token-gem-img" :alt="cell" />
          </div>
        </div>
        <div v-for="(row, rIdx) in tokenLayout.overflowRows" :key="`overflow-${rIdx}`" class="token-row overflow">
          <div v-for="(gem, cIdx) in row" :key="`of-${rIdx}-${cIdx}`" class="token-cell no-placeholder">
            <img :src="`/images/gems/${getGemImageName(gem)}.jpg`" class="token-gem-img" :alt="gem" />
          </div>
        </div>
      </div>
    </div>

    <div class="player-bonuses">
      <h5>购买的发展卡</h5>
      <div v-for="(colors, rowIndex) in bonusColorRows" :key="rowIndex" class="bonus-stacks">
        <div v-for="color in colors" :key="`col-${player.id}-${color}`" class="bonus-column">
          <div class="bonus-stack">
            <img v-for="(cardId, i) in ownedBonusCards(color)" :key="cardId" :src="`/images/cards/${cardId}.jpg`" :alt="`卡${cardId}`" class="bonus-card-image" :style="{ marginTop: i === 0 ? '0' : '-120%' }" @error="emit('card-image-error', $event)" />
          </div>
          <div class="bonus-label">{{ getGemDisplayName(color) }}</div>
        </div>
      </div>
    </div>

    <div class="player-reserved-cards">
      <h5>保留的发展卡</h5>
      <div class="reserved-cards-list">
        <div
          v-for="(cardId, index) in player.reservedCards || []"
          :key="index"
          class="reserved-card-item"
          :class="{ clickable: player.id === currentTurnPlayerId }"
          @click="emit('reserved-card-click', { cardId, playerId: player.id })"
        >
          <img
            v-if="shouldShowReservedCardFace(player.id, localPlayerId)"
            :src="`/images/cards/${cardId}.jpg`"
            :alt="`保留卡${cardId}`"
            class="reserved-card-image"
            @error="emit('card-image-error', $event)"
          />
          <img
            v-else
            :src="`/images/cards/back${getCardLevel(cardId, cardDetails)}.jpg`"
            alt="保留卡牌背"
            class="reserved-card-image"
            @error="emit('card-image-error', $event)"
          />
        </div>
        <div v-for="i in (3 - (player.reservedCards?.length || 0))" :key="`empty-${i}`" class="reserved-card-item empty">
          <div class="empty-slot">空</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DevelopmentCard, GemType, Player } from '../game-state'
import {
  buildPlayerTokenLayout,
  getCardLevel,
  getGemDisplayName,
  getGemImageName,
  getMaxSameColorPoints,
  getNobleDisplayName,
  getOwnedBonusCardIds,
  getPlayerNobleIds,
  shouldShowReservedCardFace
} from '../game-view-selectors'

const props = defineProps<{
  player: Player
  cardDetails: Readonly<Record<string, DevelopmentCard>>
  localPlayerId?: string
  currentTurnPlayerId?: string
  canSpendPrivilege: boolean
}>()

const emit = defineEmits<{
  'spend-privilege': []
  'reserved-card-click': [data: { cardId: string, playerId: string }]
  'card-image-error': [event: Event]
  'noble-image-error': [event: Event]
}>()

const showNobleTooltip = ref(false)
const bonusColorRows: readonly (readonly GemType[])[] = [
  ['white', 'blue', 'green'],
  ['red', 'black', 'gray']
]
const tokenLayout = computed(() => buildPlayerTokenLayout(props.player))
const maxSameColorPoints = computed(() => getMaxSameColorPoints(props.player, props.cardDetails))
const nobleIds = computed(() => getPlayerNobleIds(props.player))
const ownedBonusCards = (color: GemType): string[] => getOwnedBonusCardIds(props.player, props.cardDetails, color)
</script>

<style scoped>
.player-card { background: #f8f9fa; border: 2px solid #dee2e6; border-radius: 8px; padding: 16px; transition: all 0.2s; }
.player-card.current-player { border-color: #2196f3; background: #e3f2fd; }
.player-card.active-turn { border-color: #28a745; background: #d4edda; box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.2); }
.player-header { display: flex; flex-direction: column; align-items: center; margin-bottom: 12px; }
.player-header-top { display: flex; align-items: center; justify-content: center; text-align: center; }
.player-name { font-weight: 600; color: #495057; }
.player-gems, .player-bonuses { margin-bottom: 8px; }
.player-gems h5, .player-bonuses h5 { margin: 0 0 4px 0; font-size: 12px; color: #6c757d; }
.player-reserved-cards { margin-bottom: 8px; }
.player-reserved-cards h5 { margin: 0 0 4px 0; font-size: 12px; color: #6c757d; }
.reserved-cards-list { display: flex; gap: 4px; flex-wrap: wrap; }
.reserved-card-item { width: 48px; height: 72px; border: 2px solid #e9ecef; border-radius: 5px; overflow: hidden; position: relative; transition: all 0.3s ease; }
.reserved-card-item.clickable { cursor: pointer; }
.reserved-card-item.clickable:hover { border-color: #667eea; transform: translateY(-2px); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); }
.reserved-card-item.empty { background: #f8f9fa; border: 2px dashed #ced4da; display: flex; align-items: center; justify-content: center; }
.reserved-card-image { width: 100%; height: 100%; object-fit: cover; }
.empty-slot { font-size: 10px; color: #6c757d; }
.bonus-card-image { width: 60px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #dee2e6; }
.player-metrics-row { margin-top: 12px; display: flex; gap: 8px; justify-content: center; }
.player-metrics { display: flex; gap: 6px; }
.metric-badge { background: #ffffff; color: #495057; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; line-height: 1.4; border: 1px solid #dee2e6; }
.metric-badge.clickable { cursor: pointer; box-shadow: 0 0 0 0 rgba(13,110,253,0); transition: box-shadow .2s ease; }
.metric-badge.clickable:hover { box-shadow: 0 0 0 3px rgba(13,110,253,0.25); }
.crown-badge { position: relative; }
.crown-badge.has-nobles { cursor: pointer; }
.noble-tooltip { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); background: #ffffff; border: 1px solid #dee2e6; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); padding: 8px; z-index: 1000; margin-top: 8px; }
.noble-tooltip::before { content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 6px solid #ffffff; }
.noble-tooltip::after { content: ''; position: absolute; top: -7px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 7px solid #dee2e6; z-index: -1; }
.noble-tooltip-content { display: flex; gap: 6px; align-items: center; }
.noble-tooltip-image { width: 60px; height: 90px; object-fit: cover; border-radius: 4px; border: 1px solid #dee2e6; }
.token-board { display: flex; flex-direction: column; gap: 6px; }
.token-row { display: flex; gap: 6px; }
.token-row.overflow { margin-top: 6px; }
.token-cell { width: 40px; height: 40px; border-radius: 50%; border: 2px dashed #ced4da; display: flex; align-items: center; justify-content: center; background: transparent; }
.token-cell.has-token { border: 2px solid transparent; }
.token-cell.no-placeholder { border: none; }
.token-gem-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.bonus-stacks { display: flex; gap: 20px; align-items: flex-end; margin-bottom: 8px; }
.bonus-stacks:last-child { margin-bottom: 0; }
.bonus-column { display: flex; flex-direction: column; align-items: center; min-width: 60px; }
.bonus-stack { display: flex; flex-direction: column; align-items: center; }
.bonus-label { margin-top: 4px; font-size: 11px; color: #6c757d; }
</style>
