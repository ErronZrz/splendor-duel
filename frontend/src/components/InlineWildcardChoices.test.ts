import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import InlineWildcardChoices from './InlineWildcardChoices.vue'

describe('InlineWildcardChoices', () => {
  it('renders the supplied colors and emits the selected color without page state', async () => {
    const wrapper = mount(InlineWildcardChoices, { props: {
      colors: ['white', 'blue'], selectedColor: 'blue', pending: false
    } })
    const choices = wrapper.findAll('button')
    expect(choices.map(choice => choice.attributes('aria-pressed'))).toEqual(['false', 'true'])
    expect(wrapper.text()).toContain('白色')
    await choices[0].trigger('click')
    expect(wrapper.emitted('select')).toEqual([['white']])
  })

  it('keeps supplied choices visible but locks their intent while pending', () => {
    const wrapper = mount(InlineWildcardChoices, { props: {
      colors: ['green'], pending: true
    } })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })
})
