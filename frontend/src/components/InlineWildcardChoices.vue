<template>
  <div class="inline-effect-choices" role="group" aria-label="百搭颜色选择">
    <button
      v-for="color in colors"
      :key="color"
      type="button"
      :class="{ selected: selectedColor === color }"
      :aria-pressed="selectedColor === color"
      :disabled="pending"
      @click="emit('select', color)"
    >
      <img :src="`/images/gems/${getGemImageName(color)}.jpg`" alt="" />{{ getGemDisplayName(color) }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { getGemDisplayName, getGemImageName } from '../game-view-selectors'

defineProps<{
  colors: readonly string[]
  selectedColor?: string
  pending: boolean
}>()

const emit = defineEmits<{ select: [color: string] }>()
</script>

<style scoped>
.inline-effect-choices { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0 0 var(--space-4); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-action-soft); }
.inline-effect-choices button { position: relative; display: inline-flex; align-items: center; gap: var(--space-2); min-width: 44px; min-height: 44px; padding: var(--space-2) var(--space-3); border: 2px solid var(--color-border-strong); border-radius: var(--radius-control); background: var(--color-surface); color: var(--color-ink); font: inherit; font-size: var(--font-small); font-weight: 700; }
.inline-effect-choices button.selected { border-color: var(--color-action); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-action) 24%, transparent); }
.inline-effect-choices button.selected::after { content: '✓'; position: absolute; top: -7px; right: -7px; display: grid; place-items: center; width: 20px; height: 20px; border: 2px solid var(--color-surface); border-radius: var(--radius-pill); background: var(--color-action-strong); color: white; font-size: 11px; }
.inline-effect-choices img { width: 32px; height: 32px; border-radius: 50%; }
</style>
