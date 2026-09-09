<template>
  <div class="development-cards">
    <h4>发展卡</h4>
    <div class="card-levels">
      <div v-for="marketLevel in levels" :key="marketLevel.level" class="card-level">
        <h5>等级 {{ marketLevel.level }}</h5>
        <div
          class="cards-row"
          tabindex="0"
          :aria-label="`等级${marketLevel.level}发展卡横向列表，可使用 Shift 加鼠标滚轮或触控滑动查看全部卡牌`"
        >
          <div
            class="deck-item"
            :class="{
              'deck-empty': marketLevel.deckCount === 0,
              selected: reserveMode && selectedDeckLevel === marketLevel.level
            }"
            role="button"
            :tabindex="reserveMode && marketLevel.deckCount > 0 && !pending ? 0 : -1"
            :aria-label="`保留等级${marketLevel.level}牌堆顶牌`"
            :aria-pressed="reserveMode ? selectedDeckLevel === marketLevel.level : undefined"
            :aria-disabled="!reserveMode || marketLevel.deckCount === 0 || pending"
            :data-deck-level="marketLevel.level"
            @click="emit('deck-click', marketLevel.level)"
            @keydown.enter.prevent="emit('deck-click', marketLevel.level)"
            @keydown.space.prevent="emit('deck-click', marketLevel.level)"
          >
            <img
              v-if="marketLevel.deckCount > 0"
              :src="`/images/cards/back${marketLevel.level}.jpg`"
              :alt="`等级${marketLevel.level}牌堆`"
              class="deck-image"
            />
            <div v-if="marketLevel.deckCount > 0" class="deck-count">
              {{ marketLevel.deckCount }}
            </div>
          </div>
          <div
            v-for="card in marketLevel.cards"
            :key="card.id"
            class="card-item"
            :class="{ selected: reserveMode && selectedCardId === card.id }"
            role="button"
            :tabindex="pending ? -1 : 0"
            :aria-label="reserveMode ? `保留发展卡：${card.name}` : `购买发展卡：${card.name}`"
            :aria-pressed="reserveMode ? selectedCardId === card.id : undefined"
            :aria-disabled="pending || cardActionsBlocked"
            :data-market-card-id="card.id"
            @click="emit('card-click', card)"
            @keydown.enter.prevent="emit('card-click', card)"
            @keydown.space.prevent="emit('card-click', card)"
          >
            <img
              :src="`/images/cards/${card.id}.jpg`"
              :alt="card.name"
              class="card-image"
              @error="emit('card-image-error', $event)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CardDisplayItem } from '../game-view-selectors'

export interface MarketLevelView {
  level: number
  deckCount: number
  cards: CardDisplayItem[]
}

defineProps<{
  levels: readonly MarketLevelView[]
  reserveMode: boolean
  selectedCardId?: string
  selectedDeckLevel?: number
  pending: boolean
  cardActionsBlocked: boolean
}>()

const emit = defineEmits<{
  'deck-click': [level: number]
  'card-click': [card: CardDisplayItem]
  'card-image-error': [event: Event]
}>()
</script>

<style scoped>
.development-cards { margin-bottom: var(--space-6); min-width: 0; }
.development-cards h4 { margin: 0 0 var(--space-3); color: var(--color-ink); font-size: var(--font-small); line-height: var(--line-small); }
.card-levels { display: flex; flex-direction: column; gap: var(--space-4); }
.card-level { min-width: 0; padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface-subtle); }
.card-level h5 { margin: 0 0 var(--space-2); color: var(--color-ink-muted); font-size: var(--font-meta); line-height: var(--line-meta); letter-spacing: .04em; }
.cards-row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.card-item { position: relative; background: transparent; border: 1px solid transparent; border-radius: var(--radius-card); padding: 4px; cursor: pointer; transition: transform var(--duration-fast), box-shadow var(--duration-fast), border-color var(--duration-fast); display: flex; flex-direction: column; align-items: center; }
.card-item:hover:not(:active) { transform: translateY(-3px); border-color: var(--color-border-strong); box-shadow: var(--shadow-surface); }
.card-item.selected, .deck-item.selected { border-color: var(--color-action); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-action) 26%, transparent); }
.card-item.selected::after, .deck-item.selected::after { content: '✓ 已选'; position: absolute; right: 7px; bottom: 7px; z-index: 2; padding: 2px 6px; border-radius: var(--radius-pill); background: var(--color-action-strong); color: white; font-size: 10px; font-weight: 800; }
.card-item[aria-disabled="true"], .deck-item[aria-disabled="true"] { cursor: default; filter: saturate(.5); opacity: .62; }
.card-item[aria-disabled="true"]:hover, .deck-item[aria-disabled="true"]:hover { transform: none; box-shadow: none; }
.card-image { width: 96px; height: 144px; object-fit: cover; border-radius: 11px; box-shadow: 0 2px 6px rgba(41, 38, 32, .15); }
.deck-item { position: relative; display: flex; flex-direction: column; align-items: center; border: 1px solid transparent; border-radius: var(--radius-card); padding: 4px; margin-right: var(--space-5); cursor: pointer; transition: transform var(--duration-fast), box-shadow var(--duration-fast), border-color var(--duration-fast); }
.deck-item:hover:not(:active) { transform: translateY(-3px); border-color: var(--color-border-strong); box-shadow: var(--shadow-surface); }
.deck-image { width: 96px; height: 144px; object-fit: cover; border-radius: 11px; border: 3px solid var(--color-border-strong); box-shadow: 0 2px 6px rgba(41, 38, 32, .15); }
.deck-count { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); min-width: 30px; height: 30px; padding: 0 6px; background: var(--color-surface-raised); border: 2px solid var(--color-brand); border-radius: var(--radius-pill); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: var(--color-brand-strong); box-shadow: var(--shadow-surface); opacity: 1; transition: opacity var(--duration-fast); }
.deck-item:hover .deck-count { opacity: 1; }
.deck-item.deck-empty { cursor: default; width: 104px; height: 152px; border: 4px solid transparent; border-radius: 10px; box-sizing: border-box; }
.deck-item.deck-empty:hover { transform: none; box-shadow: none; }
@media (max-width: 768px) {
  .card-levels { gap: 0; }
  .card-level { padding: var(--space-1) 0; border: 0; border-radius: 0; background: transparent; }
  .card-level h5 { padding-inline: var(--space-1); font-weight: 800; }
  .cards-row { flex-wrap: nowrap; gap: var(--space-2); margin-inline: calc(-1 * var(--space-3)); padding: 0 var(--space-3) var(--space-2); overflow-x: auto; overflow-y: hidden; overscroll-behavior-inline: contain; scroll-padding-inline: var(--space-3); scroll-snap-type: x proximity; scrollbar-width: thin; -webkit-overflow-scrolling: touch; }
  .cards-row > * { flex: 0 0 auto; scroll-snap-align: start; }
  .deck-item { margin-right: var(--space-2); }
  .card-image, .deck-image { width: 64px; height: 96px; }
  .deck-item.deck-empty { width: 72px; height: 104px; }
}

@media (hover: none), (pointer: coarse) {
  .card-item:hover:not(:active), .deck-item:hover:not(:active) { transform: none; box-shadow: none; }
}

@media (prefers-reduced-motion: reduce) {
  .card-item, .deck-item, .deck-count { transition: none; }
}
</style>
