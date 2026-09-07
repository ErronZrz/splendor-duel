<template>
  <div v-if="visible" class="dialog-overlay" @click="closeAttempt">
    <div ref="dialogRef" class="dialog-content" role="dialog" aria-modal="true" aria-labelledby="mandatory-discard-title" tabindex="-1" @click.stop @keydown="onKeydown">
      <div class="dialog-header"><h3 id="mandatory-discard-title">{{ title }}</h3></div>
      <div class="dialog-body">
        <p>{{ message }}</p>
        <div class="gem-discard">
          <h4>丢弃宝石</h4>
          <p class="discard-message">您的宝石总数超过10个，请丢弃一些宝石直到总数为{{ gemDiscardTarget }}。</p>
          <div class="gem-display"><div class="gem-row">
            <div v-for="type in gemTypes" :key="type" class="gem-item" :class="{ clickable: currentCount(type) > 0, disabled: currentCount(type) <= 0 }" role="button" :tabindex="currentCount(type) > 0 ? 0 : -1" :aria-label="`丢弃一枚${getGemDisplayName(type)}，当前${currentCount(type)}枚`" :aria-disabled="currentCount(type) <= 0" @click="discard(type)" @keydown.enter.prevent="discard(type)" @keydown.space.prevent="discard(type)">
              <img :src="`/images/gems/${type}.jpg`" :alt="type" class="gem-icon" @error="handleGemImageError" />
              <span class="gem-count">{{ currentCount(type) }}</span><div v-if="currentCount(type) > 0" class="discard-hint">点击丢弃</div>
            </div>
          </div></div>
          <div class="gem-summary">
            <p>当前总数: <span class="total-count">{{ totalAfterDiscard }}</span></p><p>目标总数: <span class="target-count">{{ gemDiscardTarget }}</span></p>
            <p v-if="Object.keys(discardedGems).length" class="discarded-info">已选择丢弃: <span v-for="(count,type) in discardedGems" :key="type" class="discarded-gem">{{ getGemDisplayName(type) }}: {{ count }}</span></p>
            <p class="discard-tip">💡 提示：如果关闭了对话框，系统会自动重新打开，直到您完成宝石丢弃</p>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn btn-warning" type="button" @click="reset">重置</button>
        <button class="btn btn-primary" type="button" :disabled="totalAfterDiscard !== gemDiscardTarget" @click="confirm">完成丢弃</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { GemType, Player } from '../game-state'
import { replaceBrokenImageWithLabel } from '../image-fallback'
import { getGemDisplayName } from '../game-view-selectors'
const props = withDefaults(defineProps<{ visible: boolean; title: string; message: string; playerData: Player | null; gemDiscardTarget?: number }>(), { gemDiscardTarget: 10 })
const emit = defineEmits<{ cancel: [data: { actionType: 'discardGems'; closed: true }]; discardGemsBatch: [data: { gemDiscards: Partial<Record<GemType, number>> }]; confirm: [data: { actionType: 'discardGems'; completed: true }]; reset: [] }>()
const gemTypes: GemType[] = ['white','blue','green','red','black','pearl','gold']
const dialogRef = ref<HTMLElement|null>(null)
const discardedGems = ref<Partial<Record<GemType, number>>>({})
let previouslyFocusedElement: Element|null = null
watch(() => props.visible, visible => { if (visible) { previouslyFocusedElement=document.activeElement; discardedGems.value={}; nextTick(() => dialogRef.value?.focus()) } else if (previouslyFocusedElement instanceof HTMLElement) { const target=previouslyFocusedElement; nextTick(() => target.focus()); previouslyFocusedElement=null } }, { immediate: true })
const currentCount = (type: GemType) => Math.max(0, (props.playerData?.gems?.[type] || 0) - (discardedGems.value[type] || 0))
const totalAfterDiscard = computed(() => Object.entries(props.playerData?.gems || {}).reduce((sum, [type, count]) => sum + Math.max(0, (count || 0) - (discardedGems.value[type as GemType] || 0)), 0))
const discard = (type: GemType) => { if (currentCount(type) <= 0) return; discardedGems.value[type]=(discardedGems.value[type] || 0)+1 }
const confirm = () => { if (totalAfterDiscard.value !== props.gemDiscardTarget) return; emit('discardGemsBatch',{gemDiscards:discardedGems.value}); emit('confirm',{actionType:'discardGems',completed:true}) }
const reset = () => { discardedGems.value={}; emit('reset') }
const closeAttempt = () => emit('cancel',{actionType:'discardGems',closed:true})
const onKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape') return; if (event.key !== 'Tab') return; const items=Array.from(dialogRef.value?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])') || []); if (!items.length) { event.preventDefault(); dialogRef.value?.focus(); return } const first=items[0],last=items[items.length-1]; if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()} }
const handleGemImageError = (event: Event) => { const target=event.target as HTMLImageElement; replaceBrokenImageWithLabel(target,target.alt||'宝石','gem-image-fallback') }
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

.gem-row {
display: flex;
  justify-content: center;
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

.gem-icon {
width: 24px;
  height: 24px;
  object-fit: cover;
  border-radius: 50%;
}

.gem-discard {
padding: 20px 0;
}

.discard-message {
text-align: center;
  color: #dc3545;
  font-weight: 500;
  margin-bottom: 20px;
  padding: 12px;
  background: #f8d7da;
  border-radius: 8px;
  border: 1px solid #f5c6cb;
}

.gem-display {
margin-bottom: 20px;
}

.gem-display .gem-row {
display: flex;
  gap: 22px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.gem-display .gem-row:last-child {
margin-bottom: 0;
}

.gem-item {
display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  border: 2px solid #dee2e6;
  border-radius: 12px;
  background: #ffffff;
  transition: all 0.2s;
  min-width: 88px;
  position: relative;
}

.gem-item.clickable {
cursor: pointer;
  border-color: #0d6efd; /* 可选：蓝色边框 */
  box-shadow: 0 0 0 2px rgba(13,110,253,0.15) inset;
}

.gem-item.clickable:hover {
background: #f0f6ff;
  border-color: #0b5ed7;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(13, 110, 253, 0.25);
}

.gem-item.disabled {
opacity: 0.5;
  cursor: not-allowed;
  border-color: #e9ecef; /* 不可选：浅灰边框 */
}

.gem-icon {
width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 50%;
  margin-bottom: 8px;
  border: 3px solid transparent;
}

.gem-count {
font-size: 16px;
  font-weight: 600;
  color: #495057;
  margin-bottom: 2px;
}

.discard-hint {
font-size: 10px;
  color: #dc3545;
  text-align: center;
  font-weight: 500;
}

.gem-summary {
text-align: center;
  padding: 16px;
  background: #e9ecef;
  border-radius: 8px;
  margin-top: 20px;
}

.gem-summary p {
margin: 8px 0;
  font-weight: 500;
}

.total-count {
color: #dc3545;
  font-weight: 600;
}

.target-count {
color: #28a745;
  font-weight: 600;
}

.discard-tip {
font-size: 12px;
  color: #6c757d;
  font-style: italic;
  text-align: center;
  margin-top: 12px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 3px solid #007bff;
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

.btn-warning {
background-color: #ffc107;
  color: #212529;
}

.btn-warning:hover:not(:disabled) {
background-color: #e0a800;
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

.gem-display .gem-row {
gap: var(--space-2);
}

.gem-item {
min-width: 72px;
    padding: var(--space-2);
}

.gem-icon {
width: 48px;
    height: 48px;
}

}
</style>
