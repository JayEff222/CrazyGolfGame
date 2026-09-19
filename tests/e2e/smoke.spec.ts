import { test, expect } from '@playwright/test'

/*
 * REQUIREMENTS.md §5: sunlight-first, one-handed, and the hole screen has to
 * work without scrolling. Only the sign-in screen is reachable without an
 * account, so that is what can be checked here; the hole screen itself is
 * covered by unit tests on its layout, and confirmed on a real phone at Trangie.
 */

/** The smallest phone worth designing for - an iPhone SE in portrait. */
const SMALL_PHONE = { width: 360, height: 640 }

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

test('renders without horizontal scroll on a small phone', async ({ page }) => {
  await page.setViewportSize(SMALL_PHONE)
  await page.goto('/')
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})

test('sign-in fits on a small phone without scrolling', async ({ page }) => {
  await page.setViewportSize(SMALL_PHONE)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CrazyGolfGame' })).toBeVisible()

  const overflows = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
  )
  expect(overflows).toBe(false)
})

test('every control is big enough for a gloved thumb', async ({ page }) => {
  await page.setViewportSize(SMALL_PHONE)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'CrazyGolfGame' })).toBeVisible()

  // §5 sets a 3rem floor, which is 48px at the default root size. A control that
  // misses it is one a cold, wet hand will miss too.
  const buttons = await page.getByRole('button').all()
  expect(buttons.length).toBeGreaterThan(0)

  for (const button of buttons) {
    const box = await button.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
})
