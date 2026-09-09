<template>
  <section class="context-action-bar" :aria-label="title" role="region">
    <div class="context-summary">
      <div>
        <h4>{{ title }}</h4>
        <p class="context-message">{{ message }}</p>
      </div>
      <span v-if="showsGemSelection" class="selection-count">已选 {{ selectedGems.length }}/{{ requiredCount }}</span>
    </div>

    <div v-if="mode === 'spend-privilege'" class="privilege-count" aria-label="花费特权数量">
      <span>花费数量</span>
      <button
        v-for="count in [1, 2, 3]"
        :key="count"
        type="button"
        :class="{ selected: targetCount === count }"
        :disabled="pending || count > maxTargetCount"
        :aria-pressed="targetCount === count"
        @click="emit('change-count', count)"
      >
        {{ count }}
      </button>
    </div>

    <div v-if="showsGemSelection" class="selected-list" aria-live="polite">
      <span v-if="selectedGems.length === 0" class="empty-selection">尚未选择宝石</span>
      <span
        v-for="(gem, index) in selectedGems"
        :key="`${gem.x}-${gem.y}`"
        class="selected-gem"
      >
        {{ index + 1 }}. {{ getGemDisplayName(gem.type) }} ({{ gem.x + 1 }}, {{ gem.y + 1 }})
      </span>
    </div>

    <div v-else-if="mode === 'reserve-card'" class="selected-list reserve-selection-summary" aria-live="polite">
      <span class="selected-gem selected-gold">{{ selectedGoldLabel }}</span>
      <span v-if="reserveTarget" class="selected-gem selected-target">目标：{{ reserveTargetLabel }}</span>
      <span v-else class="empty-selection">尚未选择市场卡或牌堆</span>
    </div>
    <div v-else-if="selectionLabel" class="selected-list" aria-live="polite">
      <span class="selected-gem">已选择：{{ getGemDisplayName(selectionLabel) }}</span>
    </div>

    <p v-if="warning" class="context-warning" role="alert">{{ warning }}</p>
    <p v-if="pending" class="context-pending" role="status">等待服务器确认，不能重复提交</p>

    <div class="context-actions">
      <button type="button" class="btn btn-secondary" :disabled="pending" @click="emit('cancel')">取消</button>
      <button v-if="mode !== 'refill-confirm'" type="button" class="btn btn-secondary" :disabled="pending || clearDisabled" @click="emit('clear')">清除</button>
      <button v-if="allowSkip" type="button" class="btn btn-secondary" :disabled="pending" @click="emit('skip')">明确跳过</button>
      <button type="button" class="btn btn-primary" :disabled="pending || confirmDisabled" @click="emit('confirm')">{{ confirmLabel }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getGemDisplayName } from '../game-view-selectors'
import type { GemPosition, ReserveTarget, SelectedGem } from '../game-interaction-state'

const props = defineProps<{
  mode: 'take-gems' | 'spend-privilege' | 'reserve-card' | 'refill-confirm' | 'extra-token' | 'steal-token' | 'wildcard' | 'noble'
  selectedGems: readonly SelectedGem[]
  selectedGold?: GemPosition | null
  reserveTarget?: ReserveTarget | null
  message: string
  warning: string | null
  targetCount: number
  maxTargetCount: number
  confirmDisabled: boolean
  pending: boolean
  allowSkip?: boolean
  selectionLabel?: string
}>()

const emit = defineEmits<{
  'change-count': [count: number]
  clear: []
  cancel: []
  confirm: []
  skip: []
}>()

const title = computed(() => ({
  'take-gems': '拿取宝石',
  'spend-privilege': '花费特权',
  'reserve-card': '保留发展卡',
  'refill-confirm': '确认补充版图',
  'extra-token': '选择额外 token',
  'steal-token': '从对手处窃取 token',
  wildcard: '选择百搭颜色',
  noble: '选择贵族'
})[props.mode])
const showsGemSelection = computed(() => props.mode === 'take-gems' || props.mode === 'spend-privilege')
const requiredCount = computed(() => props.mode === 'take-gems' ? 3 : props.targetCount)
const selectedGoldLabel = computed(() => props.selectedGold
  ? `黄金坐标 (${props.selectedGold.x + 1}, ${props.selectedGold.y + 1})`
  : '黄金坐标不可用')
const reserveTargetLabel = computed(() => {
  if (!props.reserveTarget) return ''
  return props.reserveTarget.type === 'deck'
    ? `等级 ${props.reserveTarget.level} 牌堆`
    : `场上卡 ${props.reserveTarget.name}（等级 ${props.reserveTarget.level}）`
})
const clearDisabled = computed(() => props.mode === 'reserve-card'
  ? !props.reserveTarget
  : props.selectedGems.length === 0 && !props.selectionLabel)
const confirmLabel = computed(() => props.mode === 'reserve-card'
  ? '确认保留'
  : props.mode === 'refill-confirm' ? '确认补盘' : '确认')
</script>

<style scoped>
.context-action-bar {
  position: sticky;
  z-index: 400;
  bottom: var(--space-3);
  display: grid;
  gap: var(--space-3);
  margin: 0 0 var(--space-6);
  padding: var(--space-4);
  border: 1px solid color-mix(in srgb, var(--color-action) 42%, var(--color-border));
  border-top: 4px solid var(--color-action);
  border-radius: var(--radius-surface);
  background: color-mix(in srgb, var(--color-surface) 97%, transparent);
  box-shadow: var(--shadow-raised);
  backdrop-filter: blur(18px);
}

.context-summary,
.context-actions,
.privilege-count,
.selected-list {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.context-summary {
  justify-content: space-between;
  align-items: flex-start;
}

.context-summary h4,
.context-message,
.context-warning,
.context-pending {
  margin: 0;
}

.context-summary h4 {
  color: var(--color-ink);
  font-size: var(--font-section);
  line-height: var(--line-section);
}

.context-message,
.empty-selection {
  color: var(--color-ink-muted);
  font-size: 14px;
}

.selection-count,
.selected-gem {
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border);
  background: var(--color-surface-subtle);
  color: var(--color-ink);
  font-size: 12px;
  font-weight: 600;
}

.context-warning {
  padding: var(--space-2) var(--space-3);
  border-left: 4px solid var(--color-warning);
  background: var(--color-warning-soft);
  color: var(--color-warning);
  font-weight: 600;
}

.context-pending {
  padding: var(--space-2) var(--space-3);
  border: 1px dashed currentColor;
  border-radius: var(--radius-control);
  background: var(--color-warning-soft);
  color: var(--color-warning);
  font-weight: 600;
}

.context-pending::before {
  content: '…';
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-right: var(--space-2);
  border: 1px solid currentColor;
  border-radius: var(--radius-pill);
}

.privilege-count button,
.context-actions button {
  min-width: 44px;
  min-height: 44px;
}

.privilege-count button {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  cursor: pointer;
}

.privilege-count button.selected {
  border-color: var(--color-action);
  background: var(--color-action-soft);
  color: var(--color-action-strong);
  font-weight: 700;
  box-shadow: inset 0 0 0 1px var(--color-action);
}

.context-actions {
  justify-content: flex-end;
}

.context-actions .btn {
  padding: var(--space-2) var(--space-4);
}

button:disabled {
  cursor: not-allowed;
  opacity: .55;
}

@media (max-width: 768px) {
  .context-action-bar {
    position: fixed;
    z-index: 650;
    right: var(--page-gutter);
    bottom: max(var(--space-2), env(safe-area-inset-bottom));
    left: var(--page-gutter);
    max-height: min(48vh, 390px);
    margin: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding: var(--space-3);
    padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
    border-radius: var(--radius-surface);
  }

  .context-summary {
    gap: var(--space-2);
  }

  .context-message {
    line-height: 1.35;
  }

  .context-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  }
}
</style>
