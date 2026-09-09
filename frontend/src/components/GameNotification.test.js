import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GameNotification from './GameNotification.vue'

let wrapper
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

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

it('auto-dismisses mobile notifications after three seconds while preserving persistent notices', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  wrapper = mount(GameNotification, { attachTo: document.body })

  wrapper.vm.info('自动关闭', '移动端三秒后关闭', 5000)
  wrapper.vm.warning('保持显示', '显式零时长不自动关闭', 0)
  await wrapper.vm.$nextTick()

  expect(document.body.querySelectorAll('.notification')).toHaveLength(2)
  await vi.advanceTimersByTimeAsync(2999)
  expect(document.body.querySelectorAll('.notification')).toHaveLength(2)
  await vi.advanceTimersByTimeAsync(1)
  await wrapper.vm.$nextTick()
  expect(document.body.querySelectorAll('.notification')).toHaveLength(1)
  expect(document.body.textContent).toContain('保持显示')
})

it('keeps the requested auto-dismiss duration on desktop', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  wrapper = mount(GameNotification, { attachTo: document.body })

  wrapper.vm.success('桌面通知', '保持原时长', 5000)
  await vi.advanceTimersByTimeAsync(3000)
  expect(document.body.querySelectorAll('.notification')).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(2000)
  await wrapper.vm.$nextTick()
  expect(document.body.querySelectorAll('.notification')).toHaveLength(0)
})
