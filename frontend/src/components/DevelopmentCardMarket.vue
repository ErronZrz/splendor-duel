<template>
  <div class="development-cards">
    <h4>发展卡</h4>
    <div class="card-levels">
      <div v-for="marketLevel in levels" :key="marketLevel.level" class="card-level">
        <h5>等级 {{ marketLevel.level }}</h5>
        <div class="cards-row">
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
.development-cards { margin-bottom: 24px; min-width: 0; }
.development-cards h4 { margin: 0 0 16px 0; color: #495057; }
.card-levels { display: flex; flex-direction: column; gap: 16px; }
.card-level { min-width: 0; }
.card-level h5 { margin: 0 0 8px 0; color: #495057; font-size: 14px; }
.cards-row { display: flex; gap: 8px; flex-wrap: wrap; }
.card-item { background: transparent; border: none; padding: 4px; cursor: pointer; transition: all .2s; display: flex; flex-direction: column; align-items: center; }
.card-item:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(0, 0, 0, .15); }
.card-item.selected, .deck-item.selected { box-shadow: 0 0 0 3px var(--color-action); }
.card-item[aria-disabled="true"], .deck-item[aria-disabled="true"] { cursor: default; }
.card-item[aria-disabled="true"]:hover, .deck-item[aria-disabled="true"]:hover { transform: none; box-shadow: none; }
.card-image { width: 96px; height: 144px; object-fit: cover; border-radius: 10px; }
.deck-item { position: relative; display: flex; flex-direction: column; align-items: center; padding: 4px; margin-right: 36px; cursor: pointer; transition: all .2s; }
.deck-item:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(0, 0, 0, .15); }
.deck-image { width: 96px; height: 144px; object-fit: cover; border-radius: 10px; border: 4px solid #ccccdd; }
.deck-count { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 24px; height: 24px; background: #ffffff; border: 2px solid #445566; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; color: #334455; box-shadow: 0 2px 4px rgba(0, 0, 0, .1); opacity: 1; transition: opacity .2s; }
.deck-item:hover .deck-count { opacity: 1; }
.deck-item.deck-empty { cursor: default; width: 104px; height: 152px; border: 4px solid transparent; border-radius: 10px; box-sizing: border-box; }
.deck-item.deck-empty:hover { transform: none; box-shadow: none; }
@media (max-width: 768px) {
  .cards-row { flex-wrap: nowrap; gap: var(--space-2); margin-inline: calc(-1 * var(--space-3)); padding: 0 var(--space-3) var(--space-2); overflow-x: auto; overflow-y: hidden; overscroll-behavior-inline: contain; scroll-padding-inline: var(--space-3); scroll-snap-type: x proximity; scrollbar-width: thin; -webkit-overflow-scrolling: touch; }
  .cards-row > * { flex: 0 0 auto; scroll-snap-align: start; }
  .deck-item { margin-right: var(--space-2); }
  .card-image, .deck-image { width: 84px; height: 126px; }
  .deck-item.deck-empty { width: 92px; height: 134px; }
}
</style>
