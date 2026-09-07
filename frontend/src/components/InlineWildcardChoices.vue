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
.inline-effect-choices { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0 0 var(--space-4); }
.inline-effect-choices button { display: inline-flex; align-items: center; gap: var(--space-2); min-width: 44px; min-height: 44px; padding: var(--space-2); border: 2px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-surface); }
.inline-effect-choices button.selected { border-color: var(--color-action); box-shadow: 0 0 0 3px rgba(37, 99, 235, .24); }
.inline-effect-choices img { width: 32px; height: 32px; border-radius: 50%; }
</style>
