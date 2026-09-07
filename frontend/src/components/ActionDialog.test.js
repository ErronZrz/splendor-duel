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
