<template>
  <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="path in paths" :key="path" :d="path" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type IconName = 'action' | 'board' | 'chat' | 'connection' | 'diamond' | 'exit' | 'history' | 'player' | 'turn'

const props = defineProps<{ name: IconName }>()

const iconPaths: Record<IconName, string[]> = {
  action: ['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3', 'm5.64-5.36 2.12 2.12', 'm16.24 16.24 2.12 2.12', 'm6.76 17.24-2.12 2.12', 'm17.24 6.76 2.12-2.12', 'M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z'],
  board: ['M4 4h16v16H4z', 'M9.33 4v16', 'M14.67 4v16', 'M4 9.33h16', 'M4 14.67h16'],
  chat: ['M5 5h14v10H9l-4 4V5Z', 'M8 9h8', 'M8 12h5'],
  connection: ['M5 9a10 10 0 0 1 14 0', 'M8 12a6 6 0 0 1 8 0', 'M11 15a2 2 0 0 1 2 0', 'M12 18h.01'],
  diamond: ['m12 3 7 6-7 12L5 9l7-6Z', 'M5 9h14', 'm9 9 3 12 3-12', 'm9 9 3-6 3 6'],
  exit: ['M10 5H5v14h5', 'M14 8l4 4-4 4', 'M8 12h10'],
  history: ['M4 12a8 8 0 1 0 2.34-5.66L4 8.68', 'M4 4v4.68h4.68', 'M12 8v4l3 2'],
  player: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M5 20a7 7 0 0 1 14 0'],
  turn: ['M7 7h10v10H7z', 'M3 12a9 9 0 0 1 9-9', 'M21 12a9 9 0 0 1-9 9']
}

const paths = computed(() => iconPaths[props.name])
</script>

<style scoped>
.ui-icon {
  width: 1.15em;
  height: 1.15em;
  flex: 0 0 auto;
}
</style>
