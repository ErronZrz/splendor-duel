import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

type Scenario = 'default' | 'pending' | 'unknown' | 'discard' | 'victory'

const openFixture = async (page: Page, scenario: Scenario): Promise<void> => {
  await page.goto(`/visual-fixture.html?scenario=${scenario}`)
  await expect(page.locator('html')).toHaveAttribute('data-visual-fixture-ready', scenario)
}

test.describe('automated accessibility scan', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Axe is run once in Chromium; semantic interaction coverage runs in all engines.')
  })

  for (const scenario of ['default', 'pending', 'unknown', 'discard', 'victory'] as const) {
    test(`reports no serious accessibility violations for ${scenario}`, async ({ page }) => {
      await openFixture(page, scenario)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      const serious = results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact || ''))
      expect(serious).toEqual([])
    })
  }
})
