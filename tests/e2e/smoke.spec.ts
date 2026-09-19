import { test, expect } from '@playwright/test'

test('app loads and shows its name', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CrazyGolfGame' })).toBeVisible()
})

test('renders without horizontal scroll at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})
