<template>
  <section class="context-action-bar" :aria-label="title" role="region">
    <div class="context-summary">
      <div>
        <h4>{{ title }}</h4>
        <p class="context-message">{{ message }}</p>
      </div>
      <span class="selection-count">已选 {{ selectedGems.length }}/{{ requiredCount }}</span>
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

    <div class="selected-list" aria-live="polite">
      <span v-if="selectedGems.length === 0" class="empty-selection">尚未选择宝石</span>
      <span
        v-for="(gem, index) in selectedGems"
        :key="`${gem.x}-${gem.y}`"
        class="selected-gem"
      >
        {{ index + 1 }}. {{ getGemDisplayName(gem.type) }} ({{ gem.x + 1 }}, {{ gem.y + 1 }})
      </span>
    </div>

    <p v-if="warning" class="context-warning" role="alert">{{ warning }}</p>
    <p v-if="pending" class="context-pending" role="status">等待服务器确认，不能重复提交</p>

    <div class="context-actions">
      <button type="button" class="btn btn-secondary" :disabled="pending" @click="emit('cancel')">取消</button>
      <button type="button" class="btn btn-secondary" :disabled="pending || selectedGems.length === 0" @click="emit('clear')">清除</button>
      <button type="button" class="btn btn-primary" :disabled="pending || confirmDisabled" @click="emit('confirm')">确认</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getGemDisplayName } from '../game-view-selectors'
import type { SelectedGem } from '../game-interaction-state'

const props = defineProps<{
  mode: 'take-gems' | 'spend-privilege'
  selectedGems: readonly SelectedGem[]
  message: string
  warning: string | null
  targetCount: number
  maxTargetCount: number
  confirmDisabled: boolean
  pending: boolean
}>()

const emit = defineEmits<{
  'change-count': [count: number]
  clear: []
  cancel: []
  confirm: []
}>()

const title = computed(() => props.mode === 'take-gems' ? '拿取宝石' : '花费特权')
const requiredCount = computed(() => props.mode === 'take-gems' ? 3 : props.targetCount)
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
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: rgba(255, 255, 255, .98);
  box-shadow: var(--shadow-overlay);
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

.context-message,
.empty-selection {
  color: var(--color-ink-muted);
  font-size: 14px;
}

.selection-count,
.selected-gem {
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-subtle);
  color: var(--color-ink);
  font-size: 12px;
  font-weight: 600;
}

.context-warning {
  padding: var(--space-2) var(--space-3);
  border-left: 4px solid var(--color-warning);
  background: #fff7ed;
  color: #92400e;
  font-weight: 600;
}

.context-pending {
  color: var(--color-warning);
  font-weight: 600;
}

.privilege-count button,
.context-actions button {
  min-width: 44px;
  min-height: 44px;
}

.privilege-count button {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  cursor: pointer;
}

.privilege-count button.selected {
  border-color: var(--color-action);
  background: #e3f2fd;
  color: #174ea6;
  font-weight: 700;
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
    max-height: min(46vh, 360px);
    margin: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
  }

  .context-summary {
    gap: var(--space-2);
  }

  .context-message {
    line-height: 1.35;
  }

  .context-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
