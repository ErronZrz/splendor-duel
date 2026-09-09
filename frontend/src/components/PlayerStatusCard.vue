<template>
  <div
    ref="playerCardRef"
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
          :role="canSpendPrivilege ? 'button' : undefined"
          :tabindex="canSpendPrivilege ? 0 : undefined"
          :aria-label="canSpendPrivilege ? `花费特权指示物，当前${player.privilegeTokens || 0}枚` : `特权指示物${player.privilegeTokens || 0}枚`"
          @click="canSpendPrivilege ? emit('spend-privilege') : null"
          @keydown.enter.prevent="canSpendPrivilege ? emit('spend-privilege') : null"
          @keydown.space.prevent="canSpendPrivilege ? emit('spend-privilege') : null"
        >
          <UiIcon name="privilege" />{{ player.privilegeTokens || 0 }}
        </span>
        <span class="metric-badge" :aria-label="`总分${player.points || 0}，单色最高分${maxSameColorPoints}`"><UiIcon name="score" />{{ player.points || 0 }}<small>最高 {{ maxSameColorPoints }}</small></span>
        <span
          class="metric-badge crown-badge"
          :class="{ 'has-nobles': nobleIds.length > 0 }"
          :role="nobleIds.length > 0 ? 'button' : undefined"
          :tabindex="nobleIds.length > 0 ? 0 : undefined"
          :aria-label="`皇冠${player.crowns || 0}枚${nobleIds.length > 0 ? `，查看${nobleIds.length}位贵族` : ''}`"
          :aria-expanded="nobleIds.length > 0 ? showNobleTooltip : undefined"
          @mouseenter="showNobleTooltip = true"
          @mouseleave="showNobleTooltip = false"
          @focus="showNobleTooltip = true"
          @blur="showNobleTooltip = false"
          @click="showNobleTooltip = true"
          @keydown.escape.prevent="showNobleTooltip = false"
        >
          <UiIcon name="crown" />{{ player.crowns || 0 }}
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
          <button v-for="(cell, idx) in tokenLayout.firstRow" :key="`cell-1-${idx}`" type="button" class="token-cell" :class="{ 'has-token': !!cell, selectable: isStealSelectable(cell), selected: selectedStealType === cell }" :disabled="!isStealSelectable(cell)" :aria-label="cell ? `${getGemDisplayName(cell)}宝石${isStealSelectable(cell) ? '，可窃取' : ''}` : '空宝石位'" :aria-pressed="selectedStealType === cell" @click="cell && emit('select-steal-token', cell)">
            <img v-if="cell" :src="`/images/gems/${getGemImageName(cell)}.jpg`" class="token-gem-img" :alt="getGemDisplayName(cell)" />
          </button>
        </div>
        <div class="token-row">
          <button v-for="(cell, idx) in tokenLayout.secondRow" :key="`cell-2-${idx}`" type="button" class="token-cell" :class="{ 'has-token': !!cell, selectable: isStealSelectable(cell), selected: selectedStealType === cell }" :disabled="!isStealSelectable(cell)" :aria-label="cell ? `${getGemDisplayName(cell)}宝石${isStealSelectable(cell) ? '，可窃取' : ''}` : '空宝石位'" :aria-pressed="selectedStealType === cell" @click="cell && emit('select-steal-token', cell)">
            <img v-if="cell" :src="`/images/gems/${getGemImageName(cell)}.jpg`" class="token-gem-img" :alt="getGemDisplayName(cell)" />
          </button>
        </div>
        <div v-for="(row, rIdx) in tokenLayout.overflowRows" :key="`overflow-${rIdx}`" class="token-row overflow">
          <button v-for="(gem, cIdx) in row" :key="`of-${rIdx}-${cIdx}`" type="button" class="token-cell no-placeholder" :class="{ selectable: isStealSelectable(gem), selected: selectedStealType === gem }" :disabled="!isStealSelectable(gem)" :aria-label="`${getGemDisplayName(gem)}宝石${isStealSelectable(gem) ? '，可窃取' : ''}`" :aria-pressed="selectedStealType === gem" @click="emit('select-steal-token', gem)">
            <img :src="`/images/gems/${getGemImageName(gem)}.jpg`" class="token-gem-img" :alt="getGemDisplayName(gem)" />
          </button>
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
          role="button"
          tabindex="0"
          :aria-label="`操作保留的发展卡${cardId}`"
          @click="emit('reserved-card-click', { cardId, playerId: player.id })"
          @keydown.enter.prevent="emit('reserved-card-click', { cardId, playerId: player.id })"
          @keydown.space.prevent="emit('reserved-card-click', { cardId, playerId: player.id })"
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import UiIcon from './UiIcon.vue'
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
  stealSelectableTypes?: readonly string[]
  selectedStealType?: string
}>()

const emit = defineEmits<{
  'spend-privilege': []
  'reserved-card-click': [data: { cardId: string, playerId: string }]
  'card-image-error': [event: Event]
  'noble-image-error': [event: Event]
  'select-steal-token': [gemType: string]
}>()
const isStealSelectable = (gem: string | null): boolean => Boolean(gem && props.stealSelectableTypes?.includes(gem))

const showNobleTooltip = ref(false)
const playerCardRef = ref<HTMLElement | null>(null)
const closeNoblesOnOutsidePress = (event: PointerEvent) => {
  if (playerCardRef.value && !playerCardRef.value.contains(event.target as Node)) showNobleTooltip.value = false
}
onMounted(() => document.addEventListener('pointerdown', closeNoblesOnOutsidePress))
onUnmounted(() => document.removeEventListener('pointerdown', closeNoblesOnOutsidePress))
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
.player-card { position: relative; background: var(--color-surface-subtle); border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: var(--space-4); transition: border-color var(--duration-fast), box-shadow var(--duration-fast), background-color var(--duration-fast); }
.player-card.current-player { border-color: var(--color-self); background: var(--color-self-soft); }
.player-card:not(.current-player) { border-color: var(--color-opponent); background: var(--color-opponent-soft); }
.player-card.current-player.active-turn { border: 2px solid var(--color-self); background: var(--color-self-soft); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-self) 16%, transparent); }
.player-card:not(.current-player).active-turn { border: 2px solid var(--color-opponent); background: var(--color-opponent-soft); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-opponent) 16%, transparent); }
.player-card.active-turn::before { content: '当前回合'; position: absolute; top: 8px; left: 8px; padding: 2px 7px; border-radius: var(--radius-pill); background: var(--color-turn); color: white; font-size: 10px; font-weight: 800; line-height: 16px; }
.player-header { display: flex; flex-direction: column; align-items: center; margin-bottom: 12px; }
.player-header-top { display: flex; align-items: center; justify-content: center; text-align: center; }
.player-name { font-weight: 750; color: var(--color-ink); }
.player-gems, .player-bonuses { margin-bottom: 8px; }
.player-gems h5, .player-bonuses h5 { margin: 0 0 4px 0; font-size: 12px; color: var(--color-ink-muted); }
.player-reserved-cards { margin-bottom: 8px; }
.player-reserved-cards h5 { margin: 0 0 4px 0; font-size: 12px; color: var(--color-ink-muted); }
.reserved-cards-list { display: flex; gap: 4px; flex-wrap: wrap; }
.reserved-card-item { width: 48px; height: 72px; border: 1px solid var(--color-border); border-radius: var(--radius-control); overflow: hidden; position: relative; transition: transform var(--duration-fast), border-color var(--duration-fast), box-shadow var(--duration-fast); }
.reserved-card-item.clickable { cursor: pointer; }
.reserved-card-item.clickable:hover:not(:active) { border-color: var(--color-action); transform: translateY(-2px); box-shadow: var(--shadow-surface); }
.reserved-card-item.empty { background: var(--color-surface); border: 1px dashed var(--color-border-strong); display: flex; align-items: center; justify-content: center; }
.reserved-card-image { width: 100%; height: 100%; object-fit: cover; }
.empty-slot { font-size: 10px; color: var(--color-ink-muted); }
.bonus-card-image { width: 60px; height: 90px; object-fit: cover; border-radius: 8px; border: 1px solid var(--color-border); box-shadow: 0 2px 5px rgba(41, 38, 32, .12); }
.player-metrics-row { margin-top: 12px; display: flex; gap: 8px; justify-content: center; }
.player-metrics { display: flex; gap: 6px; }
.metric-badge { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 44px; min-height: 44px; box-sizing: border-box; background: var(--color-surface); color: var(--color-ink); padding: 5px 8px; border: 1px solid var(--color-border); border-radius: 10px; font-size: 12px; font-weight: 700; line-height: 1; vertical-align: middle; }
.metric-badge small { color: var(--color-ink-muted); font-size: 10px; font-weight: 600; }
.metric-badge.clickable, .metric-badge[role="button"] { cursor: pointer; box-shadow: 0 0 0 0 transparent; transition: box-shadow var(--duration-fast) ease; }
.metric-badge.clickable:hover { box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-action) 25%, transparent); }
.crown-badge { position: relative; }
.crown-badge.has-nobles { cursor: pointer; }
.noble-tooltip { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-card); box-shadow: var(--shadow-raised); padding: 8px; z-index: 1000; margin-top: 8px; }
.noble-tooltip::before { content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 6px solid #ffffff; }
.noble-tooltip::after { content: ''; position: absolute; top: -7px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 7px solid #dee2e6; z-index: -1; }
.noble-tooltip-content { display: flex; gap: 6px; align-items: center; }
.noble-tooltip-image { width: 60px; height: 90px; object-fit: cover; border-radius: 4px; border: 1px solid #dee2e6; }
.token-board { display: flex; flex-direction: column; gap: 6px; }
.token-row { display: flex; gap: 6px; }
.token-row.overflow { margin-top: 6px; }
.token-cell { position: relative; width: 40px; height: 40px; border-radius: 50%; border: 2px dashed var(--color-border-strong); display: flex; align-items: center; justify-content: center; background: transparent; }
.token-cell.has-token { border: 2px solid transparent; }
.token-cell.selectable { cursor: pointer; border-color: var(--color-action); min-width: 44px; min-height: 44px; }
.token-cell.selectable::after { content: '+'; position: absolute; right: -5px; bottom: -5px; display: grid; place-items: center; width: 18px; height: 18px; border: 2px solid var(--color-surface); border-radius: var(--radius-pill); background: var(--color-action-strong); color: white; font-size: 12px; font-weight: 900; }
.token-cell.selected { box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-action) 28%, transparent); }
.token-cell.selected::after { content: '✓'; }
.token-cell.no-placeholder { border: none; }
.token-gem-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.bonus-stacks { display: flex; gap: 20px; align-items: flex-end; margin-bottom: 8px; }
.bonus-stacks:last-child { margin-bottom: 0; }
.bonus-column { display: flex; flex-direction: column; align-items: center; min-width: 60px; }
.bonus-stack { display: flex; flex-direction: column; align-items: center; }
.bonus-label { margin-top: 4px; font-size: 11px; color: var(--color-ink-muted); }
@media (hover: none), (pointer: coarse) { .reserved-card-item.clickable:hover:not(:active) { transform: none; box-shadow: none; } }
@media (prefers-reduced-motion: reduce) { .player-card, .reserved-card-item, .metric-badge.clickable { transition: none; } }
</style>
