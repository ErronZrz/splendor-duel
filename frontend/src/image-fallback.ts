const fallbackStyle = 'display:flex;align-items:center;justify-content:center;padding:4px;background:#f8f6f1;color:#687078;font-size:10px;text-align:center;'

export const replaceBrokenImageWithLabel = (
  image: EventTarget | null,
  label: string,
  className: string,
): HTMLSpanElement | null => {
  if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied === 'true') return null

  image.dataset.fallbackApplied = 'true'
  const fallback = image.ownerDocument.createElement('span')
  fallback.textContent = label
  fallback.className = `${image.className} ${className}`
  fallback.setAttribute('role', 'img')
  fallback.setAttribute('aria-label', label)
  Array.from(image.attributes)
    .filter(attribute => attribute.name.startsWith('data-v-'))
    .forEach(attribute => fallback.setAttribute(attribute.name, ''))
  fallback.style.cssText = fallbackStyle
  image.replaceWith(fallback)
  return fallback
}
