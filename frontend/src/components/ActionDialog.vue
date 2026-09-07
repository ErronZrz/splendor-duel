<template>
  <PurchasePaymentSheet v-if="actionType === 'buyCard'" :visible="visible" :title="title" :message="message" :player-data="playerData" :selected-card="selectedCard" @confirm="emit('confirm', $event)" @cancel="emit('cancel')" />
  <MandatoryDiscardSheet v-else-if="actionType === 'discardGems'" :visible="visible" :title="title" :message="message" :player-data="playerData" :gem-discard-target="gemDiscardTarget" @confirm="emit('confirm', $event)" @cancel="emit('cancel', $event)" @discard-gems-batch="emit('discardGemsBatch', $event)" @reset="emit('reset')" />
</template>

<script setup lang="ts">
import type { DevelopmentCard, Player } from '../game-state'
import MandatoryDiscardSheet from './MandatoryDiscardSheet.vue'
import PurchasePaymentSheet from './PurchasePaymentSheet.vue'
withDefaults(defineProps<{ visible: boolean; actionType: string; title?: string; message?: string; playerData?: Player | null; selectedCard?: (DevelopmentCard & { name?: string }) | null; gemDiscardTarget?: number }>(), { title: '', message: '', playerData: null, selectedCard: null, gemDiscardTarget: 10 })
const emit = defineEmits<{ confirm: [data: Record<string, unknown>]; cancel: [data?: Record<string, unknown>]; discardGemsBatch: [data: Record<string, unknown>]; reset: [] }>()
</script>
