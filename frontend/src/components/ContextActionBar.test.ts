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

  it('always shows the reserve gold coordinate, target source and explicit actions', async () => {
    const wrapper = mountBar({
      mode: 'reserve-card',
      selectedGems: [],
      selectedGold: { x: 1, y: 3 },
      reserveTarget: { type: 'market-card', cardId: 'c2', level: 2, name: '卡牌c2' },
      targetCount: 1
    })
    expect(wrapper.get('.selected-gold').text()).toBe('黄金坐标 (2, 4)')
    expect(wrapper.get('.selected-target').text()).toContain('场上卡 卡牌c2（等级 2）')
    expect(wrapper.get('.btn-primary').text()).toBe('确认保留')
    await wrapper.get('.context-actions .btn-secondary:nth-child(2)').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('shows the refill privilege warning and explicit empty-payload confirmation intent', async () => {
    const wrapper = mountBar({
      mode: 'refill-confirm',
      selectedGems: [],
      warning: '补充版图后，对手获得特权',
      targetCount: 0,
      maxTargetCount: 0
    })
    expect(wrapper.get('.context-warning').text()).toBe('补充版图后，对手获得特权')
    expect(wrapper.findAll('.context-actions button')).toHaveLength(2)
    expect(wrapper.get('.btn-primary').text()).toBe('确认补盘')
    await wrapper.get('.btn-primary').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('locks all mutating controls while pending', () => {
    const wrapper = mountBar({ pending: true })
    expect(wrapper.get('.context-pending').text()).toContain('不能重复提交')
    expect(wrapper.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
  })
})
