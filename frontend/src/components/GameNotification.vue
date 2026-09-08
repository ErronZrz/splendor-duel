<template>
  <Teleport to="body">
    <div class="notification-container">
      <Transition
        v-for="notification in notifications"
        :key="notification.id"
        name="notification"
        appear
      >
        <div 
          class="notification"
          :class="[`notification-${notification.type}`]"
          :role="notification.type === 'error' || notification.type === 'warning' ? 'alert' : 'status'"
          :aria-live="notification.type === 'error' || notification.type === 'warning' ? 'assertive' : 'polite'"
          aria-atomic="true"
        >
          <div class="notification-content">
            <div class="notification-icon" aria-hidden="true">
              {{ getIcon(notification.type) }}
            </div>
            <div class="notification-text">
              <div class="notification-title">{{ notification.title }}</div>
              <div v-if="notification.message" class="notification-message">
                {{ notification.message }}
              </div>
            </div>
          </div>
          <button 
            class="notification-close"
            type="button"
            :aria-label="`关闭通知：${notification.title}`"
            @click="removeNotification(notification.id)"
          >
            ×
          </button>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const notifications = ref([])
let notificationId = 0

// 显示通知
const showNotification = (type, title, message = '', duration = 5000) => {
  const id = ++notificationId
  const notification = {
    id,
    type,
    title,
    message,
    duration
  }
  
  notifications.value.push(notification)
  
  // 自动移除
  if (duration > 0) {
    setTimeout(() => {
      removeNotification(id)
    }, duration)
  }
  
  return id
}

// 移除通知
const removeNotification = (id) => {
  const index = notifications.value.findIndex(n => n.id === id)
  if (index > -1) {
    notifications.value.splice(index, 1)
  }
}

// 获取图标
const getIcon = (type) => {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    game: '🎮'
  }
  return icons[type] || '📢'
}

// 暴露方法给父组件
defineExpose({
  showNotification,
  removeNotification,
  // 便捷方法
  success: (title, message, duration) => showNotification('success', title, message, duration),
  error: (title, message, duration) => showNotification('error', title, message, duration),
  warning: (title, message, duration) => showNotification('warning', title, message, duration),
  info: (title, message, duration) => showNotification('info', title, message, duration),
  game: (title, message, duration) => showNotification('game', title, message, duration)
})
</script>

<style scoped>
.notification-container {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  pointer-events: none;
}

.notification {
  background: var(--color-surface-raised);
  border-radius: var(--radius-card);
  padding: var(--space-4) 52px var(--space-4) var(--space-4);
  box-shadow: var(--shadow-raised);
  max-width: 400px;
  min-width: 300px;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  border: 1px solid var(--color-border);
  border-left: 5px solid;
  pointer-events: auto;
  position: relative;
}

.notification-success {
  border-left-color: var(--color-success);
  background: linear-gradient(135deg, var(--color-surface-raised), var(--color-success-soft));
}

.notification-error {
  border-left-color: var(--color-danger);
  background: linear-gradient(135deg, var(--color-surface-raised), var(--color-danger-soft));
}

.notification-warning {
  border-left-color: var(--color-warning);
  background: linear-gradient(135deg, var(--color-surface-raised), var(--color-warning-soft));
}

.notification-info {
  border-left-color: var(--color-info);
  background: linear-gradient(135deg, var(--color-surface-raised), var(--color-info-soft));
}

.notification-game {
  border-left-color: var(--color-brand);
  background: linear-gradient(135deg, var(--color-surface-raised), var(--color-brand-soft));
}

.notification-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
}

.notification-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-raised);
  font-size: 17px;
  line-height: 1;
}

.notification-text {
  flex: 1;
}

.notification-title {
  font-weight: 750;
  color: var(--color-ink);
  margin-bottom: 4px;
  line-height: 1.3;
}

.notification-message {
  font-size: 14px;
  color: var(--color-ink-muted);
  line-height: 1.4;
}

.notification-close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 44px;
  height: 44px;
  background: transparent;
  border: 0;
  font-size: 20px;
  line-height: 1;
  color: var(--color-ink-muted);
  cursor: pointer;
  padding: 0;
  border-radius: var(--radius-pill);
  transition: color var(--duration-fast), background-color var(--duration-fast);
}

.notification-close:hover {
  background: var(--color-surface-strong);
  color: var(--color-ink);
}

/* 动画效果 */
.notification-enter-active {
  transition: opacity var(--duration-sheet) ease, transform var(--duration-sheet) ease;
}

.notification-leave-active {
  transition: opacity var(--duration-fast) ease, transform var(--duration-fast) ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100%) scale(0.8);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100%) scale(0.8);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .notification-container {
    top: var(--space-2);
    right: var(--page-gutter);
    left: var(--page-gutter);
  }
  
  .notification {
    min-width: auto;
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notification-enter-active,
  .notification-leave-active,
  .notification-close { transition: none; }
}
</style>
