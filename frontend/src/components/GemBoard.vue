<template>
  <div class="gem-board" :data-mode="mode">
    <h4>宝石版图 (5x5)</h4>
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
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { replaceBrokenImageWithLabel } from '../image-fallback'
import { getGemDisplayName } from '../game-view-selectors'
import type { GemPosition, SelectedGem } from '../game-interaction-state'

export type GemBoardMode = 'idle' | 'take-gems' | 'spend-privilege'

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
  if (isIllegal(x, y)) return `${name}，当前不可选，第${x + 1}行第${y + 1}列`
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

.gem-board h4 {
  margin: 0 0 12px;
  color: #495057;
}

.gem-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: min(100%, 266px);
}

.gem-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
}

.gem-cell {
  position: relative;
  width: 50px;
  height: 50px;
  min-width: 0;
  aspect-ratio: 1;
  padding: 0;
  border: 2px solid #dee2e6;
  border-radius: 8px;
  background: #fff;
  color: #6c757d;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gem-cell.has-gem {
  background: #e3f2fd;
  border-color: #2196f3;
}

.gem-cell.selectable,
.gem-cell.selected {
  cursor: pointer;
}

.gem-cell.selected {
  border-color: var(--color-action);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .24);
}

.gem-cell.illegal {
  opacity: .48;
}

.gem-cell.pending {
  cursor: wait;
  opacity: .62;
}

.gem-cell:disabled {
  cursor: default;
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
  background: var(--color-action);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  box-shadow: var(--shadow-surface);
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
