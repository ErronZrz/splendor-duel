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
        >
          <div class="notification-content">
            <div class="notification-icon">
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
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
}

.notification {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  max-width: 400px;
  min-width: 300px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-left: 4px solid;
  pointer-events: auto;
  position: relative;
}

.notification-success {
  border-left-color: #28a745;
  background: linear-gradient(135deg, #ffffff 0%, #f8fff8 100%);
}

.notification-error {
  border-left-color: #dc3545;
  background: linear-gradient(135deg, #ffffff 0%, #fff8f8 100%);
}

.notification-warning {
  border-left-color: #ffc107;
  background: linear-gradient(135deg, #ffffff 0%, #fffef8 100%);
}

.notification-info {
  border-left-color: #17a2b8;
  background: linear-gradient(135deg, #ffffff 0%, #f8feff 100%);
}

.notification-game {
  border-left-color: #667eea;
  background: linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%);
}

.notification-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
}

.notification-icon {
  font-size: 20px;
  line-height: 1;
  margin-top: 2px;
}

.notification-text {
  flex: 1;
}

.notification-title {
  font-weight: 600;
  color: #495057;
  margin-bottom: 4px;
  line-height: 1.3;
}

.notification-message {
  font-size: 14px;
  color: #6c757d;
  line-height: 1.4;
}

.notification-close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  font-size: 20px;
  line-height: 1;
  color: #adb5bd;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.notification-close:hover {
  background: #f8f9fa;
  color: #495057;
}

/* 动画效果 */
.notification-enter-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.notification-leave-active {
  transition: all 0.3s ease-in;
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
    top: 10px;
    right: 10px;
    left: 10px;
  }
  
  .notification {
    min-width: auto;
    width: 100%;
  }
}
</style>
