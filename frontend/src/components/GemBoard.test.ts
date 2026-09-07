import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import GemBoard from './GemBoard.vue'

const board = [
  ['white', 'blue', 'gold'],
  ['pearl', '', 'green']
]

const mountBoard = (overrides = {}) => mount(GemBoard, {
  props: {
    board,
    mode: 'take-gems',
    selectedGems: [{ x: 0, y: 0, type: 'white' }],
    selectablePositions: [{ x: 0, y: 1 }],
    illegalPositions: [{ x: 0, y: 2 }, { x: 1, y: 2 }],
    pending: false,
    ...overrides
  }
})

describe('GemBoard', () => {
  it('renders one shared grid with selection order and coordinate labels', () => {
    const wrapper = mountBoard()
    expect(wrapper.get('.gem-grid').attributes('role')).toBe('group')
    expect(wrapper.findAll('.gem-row')).toHaveLength(2)
    expect(wrapper.findAll('.gem-cell')).toHaveLength(6)
    expect(wrapper.get('[data-board-position="0-0"] .selection-order').text()).toBe('1')
    expect(wrapper.get('[data-board-position="0-0"]').attributes('aria-label')).toContain('取消第1枚白色')
    expect(wrapper.get('[data-board-position="0-1"]').attributes('aria-label')).toContain('第1行第2列')
  })

  it('emits select and single-cancel intents from native buttons', async () => {
    const wrapper = mountBoard()
    await wrapper.get('[data-board-position="0-1"]').trigger('click')
    await wrapper.get('[data-board-position="0-0"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[{ x: 0, y: 1 }]])
    expect(wrapper.emitted('cancel')).toEqual([[{ x: 0, y: 0 }]])
  })

  it('disables gold, empty, illegal and pending positions', async () => {
    const wrapper = mountBoard()
    expect(wrapper.get('[data-board-position="0-2"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-board-position="1-1"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-board-position="1-2"]').classes()).toContain('illegal')

    await wrapper.setProps({ pending: true })
    expect(wrapper.get('[data-board-position="0-0"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-board-position="0-1"]').attributes('disabled')).toBeDefined()
  })

  it('marks the real gold as selected in reserve mode and emits cancel for the same control', async () => {
    const wrapper = mountBoard({
      mode: 'reserve-card',
      selectedGems: [{ x: 0, y: 2, type: 'gold' }],
      selectablePositions: [],
      illegalPositions: []
    })
    const gold = wrapper.get('[data-board-position="0-2"]')
    expect(gold.classes()).toContain('selected')
    expect(gold.attributes('aria-pressed')).toBe('true')
    expect(gold.attributes('aria-label')).toContain('取消第1枚黄金')
    await gold.trigger('click')
    expect(wrapper.emitted('cancel')).toEqual([[{ x: 0, y: 2 }]])
  })
})
