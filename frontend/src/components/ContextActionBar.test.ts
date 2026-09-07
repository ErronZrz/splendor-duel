import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ContextActionBar from './ContextActionBar.vue'

const mountBar = (overrides = {}) => mount(ContextActionBar, {
  props: {
    mode: 'take-gems',
    selectedGems: [{ x: 0, y: 1, type: 'blue' }],
    message: '请选择连续同线的宝石',
    warning: null,
    targetCount: 1,
    maxTargetCount: 3,
    confirmDisabled: false,
    pending: false,
    ...overrides
  }
})

describe('ContextActionBar', () => {
  it('shows selection, warning and emits clear, cancel and confirm intents', async () => {
    const wrapper = mountBar({ warning: '对手将获得特权' })
    expect(wrapper.text()).toContain('1. 蓝色 (1, 2)')
    expect(wrapper.get('.context-warning').text()).toContain('对手将获得特权')

    const buttons = wrapper.findAll('.context-actions button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('allows an available privilege count and disables unavailable counts', async () => {
    const wrapper = mountBar({
      mode: 'spend-privilege',
      selectedGems: [],
      targetCount: 1,
      maxTargetCount: 2,
      confirmDisabled: true
    })
    const counts = wrapper.findAll('.privilege-count button')
    expect(counts[2].attributes('disabled')).toBeDefined()
    await counts[1].trigger('click')
    expect(wrapper.emitted('change-count')).toEqual([[2]])
    expect(wrapper.find('.context-actions .btn-primary').attributes('disabled')).toBeDefined()
  })

  it('locks all mutating controls while pending', () => {
    const wrapper = mountBar({ pending: true })
    expect(wrapper.get('.context-pending').text()).toContain('不能重复提交')
    expect(wrapper.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
  })
})
