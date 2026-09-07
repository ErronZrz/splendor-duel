<template>
  <div v-if="visible" class="dialog-overlay" @click="cancel">
    <div ref="dialogRef" class="dialog-content" role="dialog" aria-modal="true" aria-labelledby="purchase-payment-title" tabindex="-1" @click.stop @keydown="onKeydown">
      <div class="dialog-header">
        <h3 id="purchase-payment-title">{{ title }}</h3>
        <button class="close-btn" type="button" aria-label="关闭对话框" @click="cancel">&times;</button>
      </div>
      <div class="dialog-body">
        <p>{{ message }}</p>
        <div class="card-selection">
          <h4>购买发展卡</h4>
          <div class="buy-card-content">
            <div class="card-preview-section">
              <img :src="`/images/cards/${selectedCard?.id}.jpg`" :alt="selectedCard?.name || selectedCard?.id" class="card-preview-large" @error="handleCardImageError" />
            </div>
            <div class="payment-section">
              <h5>支付方案</h5>
              <div class="payment-row">
                <div class="payment-label">应支付:</div>
                <div class="token-display">
                  <div v-for="([type, count], index) in requiredTokenEntries" :key="`required-${index}-${type}`" class="token-item">
                    <img :src="`/images/gems/${getGemImageName(type)}.jpg`" :alt="type" class="token-icon" @error="handleGemImageError" />
                    <span class="token-count">{{ count }}</span>
                  </div>
                </div>
              </div>
              <div class="payment-row">
                <div class="payment-label">建议支付:</div>
                <div class="token-display">
                  <div v-for="([type, count], index) in suggestedPaymentEntries" :key="`suggested-${index}-${type}`" class="token-item" :class="{ clickable: type !== 'gold' && canConvertToGold(type) }" :role="type !== 'gold' && canConvertToGold(type) ? 'button' : undefined" :tabindex="type !== 'gold' && canConvertToGold(type) ? 0 : undefined" :aria-label="type !== 'gold' && canConvertToGold(type) ? `将${getGemDisplayName(type)}支付转换为黄金支付` : undefined" @click="convertToGold(type)" @keydown.enter.prevent="convertToGold(type)" @keydown.space.prevent="convertToGold(type)">
                    <img :src="`/images/gems/${getGemImageName(type)}.jpg`" :alt="type" class="token-icon" @error="handleGemImageError" />
                    <span class="token-count">{{ count }}</span>
                  </div>
                </div>
              </div>
              <div class="payment-row">
                <div class="payment-label">购买后剩余:</div>
                <div class="token-display">
                  <div v-for="type in gemTypes" :key="type" class="token-item">
                    <img :src="`/images/gems/${type}.jpg`" :alt="type" class="token-icon" @error="handleGemImageError" />
                    <span class="token-count">{{ getRemainingTokens(type) }}</span>
                  </div>
                </div>
              </div>
              <div class="payment-note"><p>💡 点击建议支付中的非黄金token可以转换为黄金支付</p></div>
            </div>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn btn-secondary" type="button" @click="cancel">取消</button>
        <button class="btn btn-primary" type="button" :disabled="!canConfirm" @click="confirm">确认</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { DevelopmentCard, GemType, Player } from '../game-state'
import { replaceBrokenImageWithLabel } from '../image-fallback'
import { getGemDisplayName, getGemImageName } from '../game-view-selectors'

type PaymentPlan = Partial<Record<GemType, number>>
type PurchaseCard = DevelopmentCard & { name?: string }
const props = defineProps<{ visible: boolean; title: string; message: string; playerData: Player | null; selectedCard: PurchaseCard | null }>()
const emit = defineEmits<{ confirm: [data: { actionType: 'buyCard'; selectedGems: []; selectedCard: PurchaseCard; privilegeCount: 0; paymentPlan: PaymentPlan; stealGemType: null }]; cancel: [] }>()
const gemTypes: GemType[] = ['white', 'blue', 'green', 'red', 'black', 'pearl', 'gold']
const dialogRef = ref<HTMLElement | null>(null)
const paymentPlan = ref<PaymentPlan>({})
let previouslyFocusedElement: Element | null = null

const focusable = () => Array.from(dialogRef.value?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') { event.preventDefault(); cancel(); return }
  if (event.key !== 'Tab') return
  const items = focusable(); if (!items.length) { event.preventDefault(); dialogRef.value?.focus(); return }
  const [first] = items; const last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
const getAvailableTokens = (type: GemType) => props.playerData?.gems?.[type] || 0
const initializePaymentPlan = () => {
  if (!props.selectedCard?.cost || !props.playerData) return
  paymentPlan.value = {}
  for (const type in props.selectedCard.cost) {
    const gemType = type as GemType
    const required = props.selectedCard.cost[gemType] || 0
    const available = getAvailableTokens(gemType)
    const bonus = props.playerData.bonus?.[gemType] || 0
    paymentPlan.value[gemType] = Math.min(Math.max(0, required - bonus), available)
  }
  let gold = 0
  for (const type in props.selectedCard.cost) {
    const gemType = type as GemType
    const required = props.selectedCard.cost[gemType] || 0
    const available = getAvailableTokens(gemType)
    const bonus = props.playerData.bonus?.[gemType] || 0
    const actualRequired = Math.max(0, required - bonus)
    if (actualRequired > available) gold += actualRequired - available
  }
  paymentPlan.value.gold = gold
}
watch(() => props.visible, visible => {
  if (visible) { previouslyFocusedElement = document.activeElement; nextTick(() => dialogRef.value?.focus()); paymentPlan.value = {}; initializePaymentPlan() }
  else if (previouslyFocusedElement instanceof HTMLElement) { const target = previouslyFocusedElement; nextTick(() => target.focus()); previouslyFocusedElement = null }
}, { immediate: true })
watch(() => JSON.stringify([props.selectedCard?.id, Object.entries(props.selectedCard?.cost || {}).sort(([a], [b]) => a.localeCompare(b)), props.playerData?.id, ...gemTypes.map(type => [props.playerData?.gems?.[type] || 0, props.playerData?.bonus?.[type] || 0])]), () => {
  if (props.visible && props.selectedCard) initializePaymentPlan()
})
const requiredTokenEntries = computed(() => Object.entries(props.selectedCard?.cost || {}).map(([type, count]) => [type, Math.max(0, (count || 0) - (props.playerData?.bonus?.[type as GemType] || 0))] as [GemType, number]).filter(([, count]) => count > 0))
const suggestedPaymentEntries = computed(() => Object.entries(paymentPlan.value).filter((entry): entry is [GemType, number] => typeof entry[1] === 'number' && entry[1] > 0))
const canConfirm = computed(() => {
  if (!props.selectedCard) return false
  const required = Object.entries(props.selectedCard.cost).reduce((total, [type, count]) => total + Math.max(0, (count || 0) - (props.playerData?.bonus?.[type as GemType] || 0)), 0)
  return Object.values(paymentPlan.value).reduce((total, count) => total + (count || 0), 0) >= required
})
const canConvertToGold = (type: GemType) => (paymentPlan.value[type] || 0) > 0 && getAvailableTokens('gold') - (paymentPlan.value.gold || 0) >= 1
const convertToGold = (type: GemType) => { if (!canConvertToGold(type)) return; paymentPlan.value[type] = (paymentPlan.value[type] || 0) - 1; paymentPlan.value.gold = (paymentPlan.value.gold || 0) + 1 }
const getRemainingTokens = (type: GemType) => Math.max(0, getAvailableTokens(type) - (paymentPlan.value[type] || 0))
const confirm = () => { if (canConfirm.value && props.selectedCard) emit('confirm', { actionType: 'buyCard', selectedGems: [], selectedCard: props.selectedCard, privilegeCount: 0, paymentPlan: paymentPlan.value, stealGemType: null }) }
const cancel = () => emit('cancel')
const handleCardImageError = (event: Event) => { const target = event.target as HTMLImageElement; replaceBrokenImageWithLabel(target, target.alt || '发展卡', 'card-image-fallback') }
const handleGemImageError = (event: Event) => { const target = event.target as HTMLImageElement; replaceBrokenImageWithLabel(target, target.alt || '宝石', 'gem-image-fallback') }
</script>

<style scoped>
.dialog-overlay {
position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(var(--space-3), env(safe-area-inset-top)) max(var(--space-3), env(safe-area-inset-right)) max(var(--space-3), env(safe-area-inset-bottom)) max(var(--space-3), env(safe-area-inset-left));
  z-index: 1000;
  overflow: hidden;
}

.dialog-content {
display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(600px, 100%);
  min-width: 0;
  background: var(--color-surface, white);
  border-radius: var(--radius-card, 12px);
  max-width: 600px;
  max-height: calc(100vh - 2 * var(--space-3));
  max-height: calc(100dvh - max(var(--space-3), env(safe-area-inset-top)) - max(var(--space-3), env(safe-area-inset-bottom)));
  overflow: hidden;
  box-shadow: var(--shadow-overlay, 0 12px 32px rgba(32, 36, 42, 0.18));
  outline: none;
}

.dialog-header {
display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 0;
  border-bottom: 1px solid #e9ecef;
  min-width: 0;
}

.dialog-header h3 {
margin: 0;
  color: #495057;
  min-width: 0;
  overflow-wrap: anywhere;
}

.close-btn {
background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6c757d;
  padding: 0;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
color: #495057;
}

.dialog-body {
padding: 24px;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.dialog-body p {
margin: 0 0 20px 0;
  color: #495057;
}

.card-selection {
margin-top: 20px;
}

.card-selection h4 {
margin: 0 0 12px 0;
  color: #495057;
  font-size: 16px;
}

.card-preview-large {
width: 120px;
  height: 180px;
  object-fit: cover;
  border-radius: 8px;
  margin-right: 12px;
}

.dialog-footer {
display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e9ecef;
  min-width: 0;
  background: var(--color-surface, white);
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

.payment-section {
margin-top: 20px;
}

.buy-card-content {
display: flex;
  gap: 24px;
  align-items: flex-start;
  min-width: 0;
}

.card-preview-section {
flex: 0 0 auto;
}

.payment-section {
flex: 1;
  min-width: 0;
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
  min-width: 0;
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

.btn {
padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  margin-left: 8px;
}

.btn:first-child {
margin-left: 0;
}

.btn:hover {
transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.btn:disabled {
opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-primary {
background-color: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
background-color: #0056b3;
}

.btn-secondary {
background-color: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
background-color: #5a6268;
}

@media (max-width: 767px) {
.dialog-overlay {
align-items: flex-end;
    padding-top: max(var(--space-3), env(safe-area-inset-top));
    padding-right: max(var(--space-3), env(safe-area-inset-right));
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: max(var(--space-3), env(safe-area-inset-left));
}

.dialog-content {
width: 100%;
    max-width: none;
    max-height: calc(100vh - max(var(--space-3), env(safe-area-inset-top)));
    max-height: calc(100dvh - max(var(--space-3), env(safe-area-inset-top)));
    border-radius: var(--radius-surface) var(--radius-surface) 0 0;
}

.dialog-header {
padding: var(--space-3) var(--space-3) var(--space-2);
}

.dialog-header h3 {
font-size: 18px;
    line-height: 24px;
}

.dialog-body {
padding: var(--space-3);
}

.dialog-body > p {
margin-bottom: var(--space-3);
}

.card-selection {
margin-top: var(--space-3);
}

.dialog-footer {
flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-3) calc(var(--space-3) + env(safe-area-inset-bottom));
}

.dialog-footer .btn {
flex: 1 1 96px;
    min-height: 44px;
    margin-left: 0;
}

.buy-card-content {
display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: var(--space-3);
}

.card-preview-large {
width: 88px;
    height: 132px;
    margin-right: 0;
}

.payment-section {
margin-top: 0;
}

.payment-section h5 {
margin-top: 0;
}

.payment-row {
display: block;
    margin-bottom: var(--space-3);
    padding: 0;
}

.payment-label {
margin: 0 0 var(--space-1);
    min-width: 0;
}

.token-display {
gap: var(--space-1);
}

.token-item {
min-width: 38px;
    padding: 4px 7px;
}

.token-icon {
margin-right: 4px;
}

.payment-note {
grid-column: 1 / -1;
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-3);
}

}
</style>
