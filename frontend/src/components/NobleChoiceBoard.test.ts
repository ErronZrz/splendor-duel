import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NobleChoiceBoard from './NobleChoiceBoard.vue'

describe('NobleChoiceBoard', () => {
  it('renders the provided noble projection and emits only a choice intent', async () => {
    const wrapper = mount(NobleChoiceBoard, { props: { nobles: [
      { id: 'noble1', name: '2分+窃取', selectable: true, selected: true },
      { id: 'noble2', name: '2分+新回合', selectable: false, selected: false }
    ] } })
    const choices = wrapper.findAll('.noble-item')
    expect(wrapper.findAll('.noble-name')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('noble1')
    expect(choices[0].attributes('role')).toBe('button')
    expect(choices[0].attributes('aria-label')).toBe('选择2分+窃取')
    expect(choices[0].attributes('aria-pressed')).toBe('true')
    expect(choices[1].attributes('role')).toBe('img')
    expect(choices[1].attributes('tabindex')).toBeUndefined()
    await choices[0].trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select')).toEqual([['noble1']])
  })
})
