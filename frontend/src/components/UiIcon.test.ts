import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiIcon from './UiIcon.vue'

describe('UiIcon', () => {
  it('renders the connection icon as three concentric, equally spaced arcs over their center dot', () => {
    const wrapper = mount(UiIcon, { props: { name: 'connection' } })

    expect(wrapper.classes()).toContain('is-connection')
    expect(wrapper.findAll('path').map(path => path.attributes('d'))).toEqual([
      'M3.338 10.338A12.25 12.25 0 0 1 20.662 10.338',
      'M6.166 13.166A8.25 8.25 0 0 1 17.834 13.166',
      'M8.995 15.995A4.25 4.25 0 0 1 15.005 15.995',
      'M12 19h.01'
    ])
  })
})
