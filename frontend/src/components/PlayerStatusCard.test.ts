import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import PlayerStatusCard from './PlayerStatusCard.vue'
import type { DevelopmentCard, GemType, Player } from '../game-state'

const makeCard = (id: string, bonus: GemType, level = 1, points = 0): DevelopmentCard => ({
  id, level, code: id, color: bonus, points, crowns: 0, bonus, cost: {}, effects: [], isSpecial: false, imagePath: ''
})

const cardDetails: Record<string, DevelopmentCard> = {
  white1: makeCard('white1', 'white', 1, 2),
  blue1: makeCard('blue1', 'blue'),
  white2: makeCard('white2', 'white', 1, 3),
  reserved2: makeCard('reserved2', 'green', 2)
}

const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 'p1', name: '本地玩家', gems: {}, bonus: {}, reservedCards: [], developmentCards: [],
  privilegeTokens: 0, crowns: 0, nobles: [], points: 0, isHost: true, lastActive: '', ...overrides
})

let wrapper: VueWrapper | undefined
afterEach(() => wrapper?.unmount())

const mountCard = (player: Player, localPlayerId = 'p1', currentTurnPlayerId = 'p1'): VueWrapper => {
  wrapper = mount(PlayerStatusCard, { props: {
    player, cardDetails, localPlayerId, currentTurnPlayerId,
    canSpendPrivilege: player.id === localPlayerId && player.id === currentTurnPlayerId
  } })
  return wrapper
}

describe('PlayerStatusCard', () => {
  it('renders identity, turn classes, metrics and missing values with the existing text', () => {
    const card = mountCard(makePlayer({ privilegeTokens: 2, points: 7, crowns: 4, developmentCards: ['white1', 'blue1', 'white2'] }))
    expect(card.classes()).toContain('current-player')
    expect(card.classes()).toContain('active-turn')
    expect(card.find('.player-name').text()).toBe('本地玩家')
    expect(card.findAll('.metric-badge').map(item => item.text())).toEqual(['2♟', '7🔸5', '4👑'])

    const empty = makePlayer({ id: 'p2', name: '对手' })
    wrapper?.unmount()
    const opponent = mountCard(empty, 'p1', 'p1')
    expect(opponent.classes()).not.toContain('current-player')
    expect(opponent.classes()).not.toContain('active-turn')
    expect(opponent.findAll('.metric-badge').map(item => item.text())).toEqual(['0♟', '0🔸0', '0👑'])
  })

  it('keeps two fixed token rows, overflow rows, and development-card color/order stacking', () => {
    const card = mountCard(makePlayer({
      gems: { white: 6, blue: 6 },
      developmentCards: ['white1', 'blue1', 'white2']
    }))
    const rows = card.findAll('.token-row')
    expect(rows.map(row => row.findAll('.token-cell').length)).toEqual([5, 5, 2])
    expect(rows[0].findAll('img').map(image => image.attributes('alt'))).toEqual(['白色', '白色', '白色', '白色', '白色'])
    expect(rows[1].findAll('img').map(image => image.attributes('alt'))).toEqual(['白色', '蓝色', '蓝色', '蓝色', '蓝色'])
    expect(rows[2].findAll('img').map(image => image.attributes('alt'))).toEqual(['蓝色', '蓝色'])

    const columns = card.findAll('.bonus-column')
    expect(columns.map(column => column.find('.bonus-label').text())).toEqual(['白色', '蓝色', '绿色', '红色', '黑色', '无色'])
    expect(columns[0].findAll('img').map(image => image.attributes('src'))).toEqual(['/images/cards/white1.jpg', '/images/cards/white2.jpg'])
    expect(columns[0].findAll('img').map(image => image.attributes('style'))).toEqual(['margin-top: 0px;', 'margin-top: -120%;'])
    expect(columns[1].findAll('img').map(image => image.attributes('src'))).toEqual(['/images/cards/blue1.jpg'])
  })

  it('shows noble images in source order only while hovered and forwards image errors', async () => {
    const card = mountCard(makePlayer({ nobles: ['noble2', 'unknown'] }))
    expect(card.find('.noble-tooltip').exists()).toBe(false)
    await card.find('.crown-badge').trigger('mouseenter')
    const images = card.findAll('.noble-tooltip-image')
    expect(images.map(image => image.attributes('src'))).toEqual(['/images/nobles/noble2.jpg', '/images/nobles/unknown.jpg'])
    expect(images.map(image => image.attributes('alt'))).toEqual(['贵族2', '贵族unknown'])
    await images[0].trigger('error')
    expect(card.emitted('noble-image-error')).toHaveLength(1)
    await card.find('.crown-badge').trigger('mouseleave')
    expect(card.find('.noble-tooltip').exists()).toBe(false)
  })

  it('preserves reserved-card faces, backs, empty slots, click payloads and privilege gating', async () => {
    const card = mountCard(makePlayer({ reservedCards: ['reserved2'], privilegeTokens: 1 }))
    expect(card.find('.reserved-card-image').attributes('src')).toBe('/images/cards/reserved2.jpg')
    expect(card.findAll('.reserved-card-item.empty')).toHaveLength(2)
    expect(card.find('.privilege-badge').classes()).toContain('clickable')
    expect(card.find('.privilege-badge').attributes('title')).toBe('点击花费特权')
    expect(card.find('.privilege-badge').attributes('role')).toBe('button')
    expect(card.find('.privilege-badge').attributes('aria-label')).toContain('当前1枚')
    await card.find('.privilege-badge').trigger('keydown', { key: 'Enter' })
    expect(card.emitted('spend-privilege')).toHaveLength(1)
    await card.find('.privilege-badge').trigger('click')
    expect(card.emitted('spend-privilege')).toHaveLength(2)
    expect(card.find('.reserved-card-item').attributes('role')).toBe('button')
    expect(card.find('.reserved-card-item').attributes('aria-label')).toContain('reserved2')
    await card.find('.reserved-card-item').trigger('keydown', { key: ' ' })
    expect(card.emitted('reserved-card-click')?.[0]).toEqual([{ cardId: 'reserved2', playerId: 'p1' }])
    await card.find('.reserved-card-item').trigger('click')
    expect(card.emitted('reserved-card-click')).toHaveLength(2)
    await card.find('.reserved-card-image').trigger('error')
    expect(card.emitted('card-image-error')).toHaveLength(1)

    await card.setProps({ localPlayerId: 'p2', currentTurnPlayerId: 'p2', canSpendPrivilege: false })
    expect(card.find('.reserved-card-image').attributes('src')).toBe('/images/cards/back2.jpg')
    expect(card.find('.reserved-card-item').classes()).not.toContain('clickable')
    expect(card.find('.privilege-badge').classes()).not.toContain('clickable')
    expect(card.find('.privilege-badge').attributes('title')).toBe('')
    expect(card.find('.privilege-badge').attributes('role')).toBeUndefined()
    await card.find('.privilege-badge').trigger('click')
    expect(card.emitted('spend-privilege')).toHaveLength(2)
  })
})
