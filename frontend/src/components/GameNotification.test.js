import { afterEach, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import GameNotification from './GameNotification.vue'

let wrapper
afterEach(() => wrapper?.unmount())

it('announces urgent and routine notifications without exposing decorative icons', async () => {
  wrapper = mount(GameNotification, { attachTo: document.body })
  wrapper.vm.error('操作失败', '服务器拒绝了该操作', 0)
  wrapper.vm.success('操作成功', '服务器已确认操作完成', 0)
  await wrapper.vm.$nextTick()

  const notifications = document.body.querySelectorAll('.notification')
  expect(notifications).toHaveLength(2)
  expect(notifications[0].getAttribute('role')).toBe('alert')
  expect(notifications[0].getAttribute('aria-live')).toBe('assertive')
  expect(notifications[1].getAttribute('role')).toBe('status')
  expect(notifications[1].getAttribute('aria-live')).toBe('polite')
  expect(notifications[0].querySelector('.notification-icon')?.getAttribute('aria-hidden')).toBe('true')
  expect(notifications[0].querySelector('button')?.getAttribute('aria-label')).toBe('关闭通知：操作失败')
})
