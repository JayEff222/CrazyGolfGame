import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HoleSwitcher } from '../../src/features/scoring/HoleSwitcher'

/*
 * Moving between holes has to work walking down a fairway (swipe), with a glove
 * on (arrows), and when fixing hole 4 from the 14th tee (tap the strip).
 */

const onSelect = vi.fn()

beforeEach(() => {
  onSelect.mockReset()
})

const renderSwitcher = (props: Partial<Parameters<typeof HoleSwitcher>[0]> = {}) =>
  render(<HoleSwitcher currentHole={7} onSelect={onSelect} {...props} />)

const swipe = (from: number, to: number, dy = 0) => {
  const nav = screen.getByRole('navigation', { name: 'Hole' })
  fireEvent.touchStart(nav, { touches: [{ clientX: from, clientY: 100 }] })
  fireEvent.touchEnd(nav, { changedTouches: [{ clientX: to, clientY: 100 + dy }] })
}

describe('HoleSwitcher', () => {
  it('offers every hole on the course', () => {
    renderSwitcher()
    expect(screen.getAllByRole('button', { name: /^Hole \d+$/ })).toHaveLength(18)
  })

  it('shows the hole it is on, with the par', () => {
    renderSwitcher({ par: 3 })
    expect(screen.getByText('Hole 7')).toBeInTheDocument()
    expect(screen.getByText('Par 3')).toBeInTheDocument()
  })

  it('jumps straight to a distant hole in one tap', async () => {
    const user = userEvent.setup()
    renderSwitcher()

    await user.click(screen.getByRole('button', { name: 'Hole 2' }))
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('steps forward and back with the arrows', async () => {
    const user = userEvent.setup()
    renderSwitcher()

    await user.click(screen.getByRole('button', { name: 'Next hole' }))
    expect(onSelect).toHaveBeenLastCalledWith(8)

    await user.click(screen.getByRole('button', { name: 'Previous hole' }))
    expect(onSelect).toHaveBeenLastCalledWith(6)
  })

  it('stops at both ends of the course', () => {
    const { unmount } = renderSwitcher({ currentHole: 1 })
    expect(screen.getByRole('button', { name: 'Previous hole' })).toBeDisabled()
    unmount()

    renderSwitcher({ currentHole: 18 })
    expect(screen.getByRole('button', { name: 'Next hole' })).toBeDisabled()
  })

  it('swipes left to the next hole and right to the previous one', () => {
    renderSwitcher()

    swipe(240, 100)
    expect(onSelect).toHaveBeenLastCalledWith(8)

    swipe(100, 240)
    expect(onSelect).toHaveBeenLastCalledWith(6)
  })

  it('ignores a nudge too small to be a deliberate swipe', () => {
    renderSwitcher()
    swipe(200, 180)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('ignores a swipe that is really a vertical scroll', () => {
    renderSwitcher()
    swipe(200, 140, 200)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('leaves swipes that start on the hole strip to the strip, which scrolls', () => {
    renderSwitcher()
    const holeButton = screen.getByRole('button', { name: 'Hole 12' })

    fireEvent.touchStart(holeButton, { touches: [{ clientX: 240, clientY: 100 }] })
    fireEvent.touchEnd(holeButton, { changedTouches: [{ clientX: 100, clientY: 100 }] })

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('marks the holes already scored so a gap is obvious', () => {
    renderSwitcher({ scoredHoles: [1, 2, 3] })
    expect(screen.getByRole('button', { name: 'Hole 2, scored' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hole 4' })).toBeInTheDocument()
  })

  it('marks the current hole for assistive tech', () => {
    renderSwitcher()
    expect(screen.getByRole('button', { name: 'Hole 7' })).toHaveAttribute('aria-current', 'true')
  })

  it('keeps every control at the minimum tap target', () => {
    renderSwitcher()
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('tap-target')
    }
  })

  it('handles a nine-hole course', () => {
    renderSwitcher({ currentHole: 9, holeCount: 9 })
    expect(screen.getAllByRole('button', { name: /^Hole \d+$/ })).toHaveLength(9)
    expect(screen.getByRole('button', { name: 'Next hole' })).toBeDisabled()
  })
})
