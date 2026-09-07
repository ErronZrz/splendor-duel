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
.noble-cards { margin-bottom: 24px; }
.noble-cards h4 { margin: 0 0 12px 0; color: #495057; }
.nobles-row { display: flex; gap: 12px; flex-wrap: wrap; }
.noble-item { background: transparent; border: none; padding: 4px; cursor: pointer; transition: all .2s; text-align: center; display: flex; flex-direction: column; align-items: center; }
.noble-item:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(0, 0, 0, .15); }
.noble-item.selectable { cursor: pointer; min-width: 44px; min-height: 44px; outline: 2px solid var(--color-action); outline-offset: 2px; }
.noble-item.selected { box-shadow: 0 0 0 4px rgba(37, 99, 235, .28); }
.noble-image { width: 80px; height: 120px; object-fit: cover; border-radius: 8px; }
</style>
