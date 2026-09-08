import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DevelopmentCardMarket from './DevelopmentCardMarket.vue'
import type { CardDisplayItem } from '../game-view-selectors'

const card: CardDisplayItem = { id: 'market-1', name: 'market-1 (2分)', level: 1, cost: {}, bonus: 'blue', crowns: 0, color: 'blue', isSpecial: false }
const mountMarket = (overrides = {}) => mount(DevelopmentCardMarket, {
  props: {
    levels: [{ level: 1, deckCount: 2, cards: [card] }],
    reserveMode: true,
    selectedCardId: undefined,
    selectedDeckLevel: undefined,
    pending: false,
    cardActionsBlocked: false,
    ...overrides
  }
})

describe('DevelopmentCardMarket', () => {
  it('keeps the market DOM, reserve projection, and native input intents', async () => {
    const wrapper = mountMarket({ selectedCardId: 'market-1' })
    expect(wrapper.get('.development-cards h4').text()).toBe('发展卡')
    expect(wrapper.get('[data-deck-level="1"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-market-card-id="market-1"]').classes()).toContain('selected')
    await wrapper.get('[data-deck-level="1"]').trigger('keydown', { key: 'Enter' })
    await wrapper.get('[data-market-card-id="market-1"]').trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('deck-click')).toEqual([[1]])
    expect(wrapper.emitted('card-click')).toEqual([[card]])
  })

  it('projects pending and blocked inputs without owning action state', () => {
    const wrapper = mountMarket({ reserveMode: false, pending: true, cardActionsBlocked: true })
    expect(wrapper.get('[data-deck-level="1"]').attributes('tabindex')).toBe('-1')
    expect(wrapper.get('[data-deck-level="1"]').attributes('aria-disabled')).toBe('true')
    expect(wrapper.get('[data-market-card-id="market-1"]').attributes('tabindex')).toBe('-1')
    expect(wrapper.get('[data-market-card-id="market-1"]').attributes('aria-disabled')).toBe('true')
  })

  it('makes each market track keyboard-focusable with an explicit scroll hint', () => {
    const wrapper = mountMarket()
    const tracks = wrapper.findAll('.cards-row')
    expect(tracks).toHaveLength(1)
    expect(tracks.every(track => track.attributes('tabindex') === '0')).toBe(true)
    expect(tracks.every(track => track.attributes('aria-label')?.includes('横向列表'))).toBe(true)
  })
})
