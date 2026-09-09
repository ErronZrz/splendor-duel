<template>
  <div class="gem-board" :class="{ 'is-pending': pending }" :data-mode="mode">
    <div class="gem-board-heading">
      <h4>宝石版图 <span>5×5</span></h4>
      <span v-if="pending" class="board-state" role="status">等待确认 · 已锁定</span>
    </div>
    <div class="gem-grid" role="group" aria-label="宝石版图">
      <div
        v-for="(row, rowIndex) in board"
        :key="`row-${rowIndex}`"
        class="gem-row"
      >
        <button
          v-for="(gem, colIndex) in row"
          :key="`cell-${rowIndex}-${colIndex}`"
          type="button"
          class="gem-cell"
          :class="cellClasses(rowIndex, colIndex, gem)"
          :data-board-position="`${rowIndex}-${colIndex}`"
          :disabled="!canActivate(rowIndex, colIndex, gem)"
          :aria-label="cellLabel(rowIndex, colIndex, gem)"
          :aria-pressed="gem && mode !== 'idle' ? selectionOrder(rowIndex, colIndex) > 0 : undefined"
          @click="activate(rowIndex, colIndex, gem)"
        >
          <img
            v-if="gem"
            :src="`/images/gems/${gem}.jpg`"
            alt=""
            class="gem-image"
            @error="handleImageError($event, gem)"
          />
          <span v-else class="empty-cell">空</span>
          <span
            v-if="selectionOrder(rowIndex, colIndex) > 0"
            class="selection-order"
            aria-hidden="true"
          >
            {{ selectionOrder(rowIndex, colIndex) }}
          </span>
          <span v-else-if="mode !== 'idle' && isSelectable(rowIndex, colIndex)" class="cell-state legal-next" aria-hidden="true">+</span>
          <span v-else-if="mode !== 'idle' && isIllegal(rowIndex, colIndex)" class="cell-state unavailable" aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { replaceBrokenImageWithLabel } from '../image-fallback'
import { getGemDisplayName } from '../game-view-selectors'
import type { GemPosition, SelectedGem } from '../game-interaction-state'

export type GemBoardMode = 'idle' | 'take-gems' | 'spend-privilege' | 'reserve-card' | 'extra-token'

const props = defineProps<{
  board: readonly (readonly string[])[]
  mode: GemBoardMode
  selectedGems: readonly SelectedGem[]
  selectablePositions: readonly GemPosition[]
  illegalPositions: readonly GemPosition[]
  pending: boolean
}>()

const emit = defineEmits<{
  select: [position: GemPosition]
  cancel: [position: GemPosition]
}>()

const matches = (position: GemPosition, x: number, y: number): boolean =>
  position.x === x && position.y === y

const selectionOrder = (x: number, y: number): number =>
  props.selectedGems.findIndex(position => matches(position, x, y)) + 1

const isSelectable = (x: number, y: number): boolean =>
  props.selectablePositions.some(position => matches(position, x, y))

const isIllegal = (x: number, y: number): boolean =>
  props.illegalPositions.some(position => matches(position, x, y))

const canActivate = (x: number, y: number, gem: string): boolean =>
  Boolean(gem) && !props.pending && (selectionOrder(x, y) > 0 || isSelectable(x, y))

const cellClasses = (x: number, y: number, gem: string) => ({
  'has-gem': Boolean(gem),
  selected: selectionOrder(x, y) > 0,
  selectable: isSelectable(x, y),
  illegal: isIllegal(x, y),
  pending: props.pending
})

const cellLabel = (x: number, y: number, gem: string): string => {
  if (!gem) return `空位置，第${x + 1}行第${y + 1}列`
  const name = getGemDisplayName(gem)
  const order = selectionOrder(x, y)
  if (order > 0) return `取消第${order}枚${name}，第${x + 1}行第${y + 1}列`
  if (props.pending) return `${name}，等待服务器确认`
  if (isIllegal(x, y) || !canActivate(x, y, gem)) return `${name}，当前不可选，第${x + 1}行第${y + 1}列`
  return `选择${name}，第${x + 1}行第${y + 1}列`
}

const activate = (x: number, y: number, gem: string): void => {
  if (!canActivate(x, y, gem)) return
  if (selectionOrder(x, y) > 0) {
    emit('cancel', { x, y })
    return
  }
  emit('select', { x, y })
}

const handleImageError = (event: Event, gem: string): void => {
  replaceBrokenImageWithLabel(event.target, getGemDisplayName(gem), 'gem-text-fallback')
}
</script>

<style scoped>
.gem-board {
  margin-bottom: 24px;
}

.gem-board-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.gem-board h4 {
  margin: 0;
  color: var(--color-ink);
  font-size: var(--font-small);
  line-height: var(--line-small);
}

.gem-board h4 span {
  color: var(--color-ink-muted);
  font-size: var(--font-meta);
  font-weight: 500;
}

.board-state {
  padding: 3px 8px;
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-pill);
  background: var(--color-warning-soft);
  color: var(--color-warning);
  font-size: 11px;
  font-weight: 800;
}

.gem-grid {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: min(100%, 280px);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface-strong);
}

.gem-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
}

.gem-cell {
  position: relative;
  width: 50px;
  height: 50px;
  min-width: 0;
  aspect-ratio: 1;
  padding: 0;
  border: 2px solid var(--color-border-strong);
  border-radius: 11px;
  background: #f7f4ed;
  color: var(--color-ink-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gem-cell.has-gem {
  background: #f7f4ed;
  border-color: var(--color-border-strong);
}

.gem-cell.selectable,
.gem-cell.selected {
  cursor: pointer;
}

.gem-cell.selected {
  border-color: var(--color-action);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-action) 26%, transparent);
}

.gem-cell.illegal {
  opacity: .55;
  border-style: dashed;
  filter: grayscale(.42);
}

.gem-cell.pending {
  cursor: wait;
  opacity: .62;
  background-image: repeating-linear-gradient(135deg, transparent 0 6px, rgba(95, 105, 118, .11) 6px 10px);
}

.gem-cell:disabled {
  cursor: default;
}

@media (max-width: 768px) {
  .gem-grid {
    width: 80%;
    margin-inline: auto;
  }

  .gem-cell {
    width: 100%;
    height: auto;
  }
}

.gem-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  transition: transform .2s, box-shadow .2s;
}

.gem-cell.selectable:not(:disabled):hover .gem-image {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, .2);
}

.selection-order {
  position: absolute;
  top: -5px;
  right: -5px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 2px solid #fff;
  border-radius: 999px;
  background: var(--color-action-strong);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  box-shadow: var(--shadow-surface);
}

.cell-state {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-surface-raised);
  border-radius: var(--radius-pill);
  color: white;
  font-size: 14px;
  font-weight: 900;
  line-height: 1;
}

.cell-state.legal-next {
  background: var(--color-action-strong);
}

.cell-state.unavailable {
  background: var(--color-ink-muted);
}

.empty-cell,
.gem-text-fallback {
  color: #6c757d;
  font-size: 10px;
}

@media (max-width: 768px) {
  .gem-cell {
    width: auto;
    height: auto;
    min-width: 44px;
    min-height: 44px;
  }
}

@media (hover: none), (pointer: coarse) {
  .gem-cell.selectable:not(:disabled):hover .gem-image {
    transform: none;
    box-shadow: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gem-image {
    transition: none;
  }
}
</style>
