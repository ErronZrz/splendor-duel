<template>
  <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="path in paths" :key="path" :d="path" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type IconName = 'action' | 'board' | 'card' | 'chat' | 'check' | 'chevronDown' | 'chevronUp' | 'connection' | 'copy' | 'crown' | 'diamond' | 'exit' | 'history' | 'player' | 'privilege' | 'score' | 'turn'

const props = defineProps<{ name: IconName }>()

const iconPaths: Record<IconName, string[]> = {
  action: ['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3', 'm5.64-5.36 2.12 2.12', 'm16.24 16.24 2.12 2.12', 'm6.76 17.24-2.12 2.12', 'm17.24 6.76 2.12-2.12', 'M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z'],
  board: ['M4 4h16v16H4z', 'M9.33 4v16', 'M14.67 4v16', 'M4 9.33h16', 'M4 14.67h16'],
  card: ['M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
  chat: ['M5 5h14v10H9l-4 4V5Z', 'M8 9h8', 'M8 12h5'],
  check: ['m4 12.5 5 5L20 6.5'],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronUp: ['m18 15-6-6-6 6'],
  connection: ['M5 9a10 10 0 0 1 14 0', 'M8 12a6 6 0 0 1 8 0', 'M11 15a2 2 0 0 1 2 0', 'M12 18h.01'],
  copy: ['M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  crown: ['M4.5 17V8.5L9 12.5 12 5.5 15 12.5 19.5 8.5V17z', 'M4 20h16', 'M4.5 6.4h.01M12 3.1h.01M19.5 6.4h.01'],
  diamond: ['m12 3 7 6-7 12L5 9l7-6Z', 'M5 9h14', 'm9 9 3 12 3-12', 'm9 9 3-6 3 6'],
  exit: ['M10 5H5v14h5', 'M14 8l4 4-4 4', 'M8 12h10'],
  history: ['M4 12a8 8 0 1 0 2.34-5.66L4 8.68', 'M4 4v4.68h4.68', 'M12 8v4l3 2'],
  player: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M5 20a7 7 0 0 1 14 0'],
  privilege: ['M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M10 16l-1.5 5L12 19l3.5 2-1.5-5'],
  score: ['M12 3 14.8 8.2 21 9.1l-4.4 4.3 1 6.1-5.6-2.8-5.6 2.8 1-6.1L3 9.1l6.2-.9L12 3Z'],
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
