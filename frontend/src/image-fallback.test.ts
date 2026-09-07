import { describe, expect, it } from 'vitest'
import { replaceBrokenImageWithLabel } from './image-fallback'

describe('replaceBrokenImageWithLabel', () => {
  it('preserves image classes and scoped attributes while exposing the business label', () => {
    const host = document.createElement('div')
    const image = document.createElement('img')
    image.className = 'token-icon selected'
    image.setAttribute('data-v-a11y', '')
    host.append(image)

    const fallback = replaceBrokenImageWithLabel(image, '蓝色宝石', 'gem-image-fallback')

    expect(host.firstElementChild).toBe(fallback)
    expect(fallback?.className).toBe('token-icon selected gem-image-fallback')
    expect(fallback?.getAttribute('data-v-a11y')).toBe('')
    expect(fallback?.getAttribute('role')).toBe('img')
    expect(fallback?.getAttribute('aria-label')).toBe('蓝色宝石')
    expect(fallback?.textContent).toBe('蓝色宝石')
    expect(fallback?.style.display).toBe('flex')
  })

  it('ignores unsupported and already handled targets', () => {
    expect(replaceBrokenImageWithLabel(null, '宝石', 'fallback')).toBeNull()
    expect(replaceBrokenImageWithLabel(document.createElement('span'), '宝石', 'fallback')).toBeNull()

    const image = document.createElement('img')
    image.dataset.fallbackApplied = 'true'
    expect(replaceBrokenImageWithLabel(image, '宝石', 'fallback')).toBeNull()
  })
})
