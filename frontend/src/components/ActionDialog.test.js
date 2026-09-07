import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ActionDialog from './ActionDialog.vue'

const card = { id: 'c1', cost: { white: 2 }, bonus: 'blue', color: 'blue' }
const player = (white) => ({ id: 'p1', gems: { white, gold: 2 }, bonus: {} })
let wrapper

afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
})

async function openPurchase(white) {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  wrapper = mount(ActionDialog, {
    props: { visible: false, actionType: 'buyCard', selectedCard: card, playerData: player(white) },
  })
  await wrapper.setProps({ visible: true })
  await flushPromises()
}

async function confirmPayment() {
  const button = wrapper.find('.dialog-footer .btn-primary')
  expect(button.attributes('disabled')).toBeUndefined()
  await button.trigger('click')
  return wrapper.emitted('confirm').at(-1)[0].paymentPlan
}

describe('default payment after spending a privilege', () => {
  it('uses colored gems when the server update arrives before opening', async () => {
    await openPurchase(2)
    expect(await confirmPayment()).toEqual({ white: 2, gold: 0 })
  })

  it('recalculates when the privilege result arrives after opening', async () => {
    await openPurchase(1)
    expect(await confirmPayment()).toEqual({ white: 1, gold: 1 })
    await wrapper.setProps({ playerData: player(2) })
    await flushPromises()
    expect(await confirmPayment()).toEqual({ white: 2, gold: 0 })
  })

  it('preserves deliberate gold substitution on an unchanged snapshot', async () => {
    await openPurchase(2)
    await wrapper.find('.payment-row .token-item.clickable').trigger('click')
    expect(await confirmPayment()).toEqual({ white: 1, gold: 1 })
    await wrapper.setProps({ playerData: { ...player(2), points: 1 }, selectedCard: { ...card } })
    await flushPromises()
    expect(await confirmPayment()).toEqual({ white: 1, gold: 1 })
  })

  it('names icon-only controls and supports keyboard payment conversion', async () => {
    await openPurchase(2)
    expect(wrapper.find('.close-btn').attributes('aria-label')).toBe('关闭对话框')
    const conversion = wrapper.find('.payment-row .token-item.clickable')
    expect(conversion.attributes('role')).toBe('button')
    expect(conversion.attributes('aria-label')).toContain('转换为黄金支付')
    await conversion.trigger('keydown', { key: 'Enter' })
    expect(await confirmPayment()).toEqual({ white: 1, gold: 1 })
  })

  it('uses a labelled neutral fallback instead of a misleading asset', async () => {
    await openPurchase(2)
    const image = wrapper.find('.payment-row .token-icon')
    const originalSrc = image.attributes('src')
    await image.trigger('error')
    expect(wrapper.find('.gem-image-fallback').attributes('role')).toBe('img')
    expect(wrapper.find('.gem-image-fallback').attributes('aria-label')).toBe('white')
    expect(wrapper.find('.gem-image-fallback').text()).toBe('white')
    expect(wrapper.html()).not.toContain('/images/gems/white.jpg" alt="加载失败')
    expect(originalSrc).toContain('/images/gems/')
  })

  it('reopening the same card resets the prior payment choice', async () => {
    await openPurchase(1)
    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ playerData: player(2), visible: true })
    await flushPromises()
    expect(await confirmPayment()).toEqual({ white: 2, gold: 0 })
  })

  it('exposes modal semantics and allows Escape for a cancellable action', async () => {
    await openPurchase(2)
    const dialog = wrapper.find('.dialog-content')
    expect(dialog.attributes('role')).toBe('dialog')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBe('action-dialog-title')
    await dialog.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('does not cancel mandatory discard with Escape', async () => {
    wrapper = mount(ActionDialog, { props: { visible: true, actionType: 'discardGems', title: '丢弃宝石', playerData: player(12) } })
    await wrapper.find('.dialog-content').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })
})

describe('purchase effect target matrix', () => {
  it.each([
    {
      name: 'extra token target exists',
      props: { actionType: 'takeExtraToken', selectedCard: card, gemBoard: [['blue']] },
      canSkip: false,
    },
    {
      name: 'extra token target is objectively absent',
      props: { actionType: 'takeExtraToken', selectedCard: card, gemBoard: [['red', 'gold'], ['', 'white']] },
      canSkip: true,
    },
    {
      name: 'steal target exists',
      props: { actionType: 'stealToken', playerData: { opponent: { gems: { pearl: 1 } } } },
      canSkip: false,
    },
    {
      name: 'steal target is objectively absent',
      props: { actionType: 'stealToken', playerData: { opponent: { gems: { gold: 2 } } } },
      canSkip: true,
    },
  ])('$name exposes explicit skip only when legal', ({ props, canSkip }) => {
    wrapper = mount(ActionDialog, { props: { visible: true, title: '特效', ...props } })
    expect(wrapper.find('.dialog-footer .btn-light').exists()).toBe(canSkip)
  })

  it.each([
    ['chooseWildcardColor', { bonus: { white: 1 } }],
    ['chooseNoble', { availableNobles: ['noble2'] }],
  ])('%s requires an explicit selection and has no skip action', (actionType, playerData) => {
    wrapper = mount(ActionDialog, { props: { visible: true, actionType, title: '特效', playerData } })
    expect(wrapper.find('.dialog-footer .btn-light').exists()).toBe(false)
    expect(wrapper.find('.dialog-footer .btn-primary').attributes('disabled')).toBeDefined()
  })
})
