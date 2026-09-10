<template>
  <div class="noble-cards">
    <h4>贵族卡</h4>
    <div class="nobles-row">
      <div
        v-for="noble in nobles"
        :key="noble.id"
        class="noble-item"
        :class="{ selectable: noble.selectable, selected: noble.selected }"
        :role="noble.selectable ? 'button' : 'img'"
        :tabindex="noble.selectable ? 0 : undefined"
        :aria-label="noble.selectable ? `选择${noble.name}` : noble.name"
        :aria-pressed="noble.selectable ? noble.selected : undefined"
        @click="emit('select', noble.id)"
        @keydown.enter.prevent="emit('select', noble.id)"
        @keydown.space.prevent="emit('select', noble.id)"
      >
        <img
          :src="`/images/nobles/${noble.id}.jpg`"
          alt=""
          class="noble-image"
          @error="emit('image-error', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface NobleChoiceView {
  id: string
  name: string
  selectable: boolean
  selected: boolean
}

defineProps<{ nobles: readonly NobleChoiceView[] }>()

const emit = defineEmits<{
  select: [nobleId: string]
  'image-error': [event: Event]
}>()
</script>

<style scoped>
.noble-cards { margin-bottom: var(--space-2); }
.noble-cards h4 { margin: 0 0 var(--space-3); color: var(--color-ink); font-size: var(--font-small); line-height: var(--line-small); }
.nobles-row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
/* 图片圆角与外框同心：14px 外框 - 1px 边框 - 4px 间距 = 9px（桌面与移动端统一） */
.noble-item { position: relative; background: var(--color-surface-subtle); border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 4px; cursor: default; transition: transform var(--duration-fast), box-shadow var(--duration-fast), border-color var(--duration-fast); text-align: center; display: flex; flex-direction: column; align-items: center; }
.noble-item.selectable:hover:not(:active) { transform: translateY(-3px); box-shadow: var(--shadow-surface); }
/* selectable 态边框加宽为 2px，padding 补偿为 3px：边框 + 间距合计恒为 5px，外框尺寸不变且同心关系保持（14 - 2 - 3 = 9） */
.noble-item.selectable { cursor: pointer; min-width: 44px; min-height: 44px; border: 2px solid var(--color-action); padding: 3px; }
.noble-item.selectable::after { content: '+'; position: absolute; right: -5px; bottom: -5px; display: grid; place-items: center; width: 18px; height: 18px; border: 2px solid var(--color-surface); border-radius: var(--radius-pill); background: var(--color-action-strong); color: white; font-size: 12px; font-weight: 900; }
.noble-item.selected { box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-action) 28%, transparent); }
.noble-item.selected::after { content: '✓'; }
.noble-image { width: 80px; height: 120px; object-fit: cover; border-radius: 9px; }
@media (max-width: 768px) {
  .nobles-row { flex-wrap: nowrap; gap: 6px; justify-content: flex-start; }
  .noble-image { width: 60px; height: 90px; }
}
@media (hover: none), (pointer: coarse) { .noble-item.selectable:hover:not(:active) { transform: none; box-shadow: none; } }
@media (prefers-reduced-motion: reduce) { .noble-item { transition: none; } }
</style>
