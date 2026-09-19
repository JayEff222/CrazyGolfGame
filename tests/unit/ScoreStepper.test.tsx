import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScoreStepper } from '../../src/features/scoring/ScoreStepper'

/*
 * The control that gets used eighteen times a round with one hand in the sun.
 * What matters is that the common scores are one tap away, that the stepper
 * cannot produce a nonsense score, and that every button is big enough to hit.
 */

const onChange = vi.fn()

beforeEach(() => {
  onChange.mockReset()
})

const renderStepper = (props: Partial<Parameters<typeof ScoreStepper>[0]> = {}) =>
  render(<ScoreStepper par={4} value={null} hole={1} onChange={onChange} {...props} />)

/** The big readout, as opposed to the quick-pick button printing the same digit. */
const readout = () => within(screen.getByRole('status'))

describe('ScoreStepper', () => {
  it('shows a dash and the par until the hole has been scored', () => {
    renderStepper()
    expect(readout().getByText('–')).toBeInTheDocument()
    expect(readout().getByText('Par 4')).toBeInTheDocument()
  })

  it('shows the score and what it is called once entered', () => {
    renderStepper({ value: 5 })
    expect(readout().getByText('5')).toBeInTheDocument()
    expect(readout().getByText('Bogey')).toBeInTheDocument()
  })

  it('offers one under through three over as single taps', () => {
    renderStepper()
    const picks = screen
      .getAllByRole('button', { name: /^Score /i })
      .map((button) => button.textContent)
    expect(picks).toEqual(['3', '4', '5', '6', '7'])
  })

  it('records a quick pick in one tap', async () => {
    const user = userEvent.setup()
    renderStepper()

    await user.click(screen.getByRole('button', { name: 'Score 5, bogey' }))
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('marks the quick pick matching the current score', () => {
    renderStepper({ value: 6 })
    expect(screen.getByRole('button', { name: 'Score 6, double bogey' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Score 4, par' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('steps up and down from the current score', async () => {
    const user = userEvent.setup()
    renderStepper({ value: 6 })

    await user.click(screen.getByRole('button', { name: 'One more stroke' }))
    expect(onChange).toHaveBeenLastCalledWith(7)

    await user.click(screen.getByRole('button', { name: 'One fewer stroke' }))
    expect(onChange).toHaveBeenLastCalledWith(5)
  })

  it('steps from par when nothing is entered yet, not from one', async () => {
    const user = userEvent.setup()
    renderStepper({ par: 5, value: null })

    await user.click(screen.getByRole('button', { name: 'One more stroke' }))
    expect(onChange).toHaveBeenCalledWith(6)
  })

  it('will not step below one', () => {
    renderStepper({ value: 1 })
    expect(screen.getByRole('button', { name: 'One fewer stroke' })).toBeDisabled()
  })

  it('will not step past fifteen', () => {
    renderStepper({ value: 15 })
    expect(screen.getByRole('button', { name: 'One more stroke' })).toBeDisabled()
  })

  it('calls a one a hole in one rather than two under', () => {
    renderStepper({ par: 3, value: 1 })
    expect(readout().getByText('Hole in one')).toBeInTheDocument()
  })

  it('reports nothing while disabled', async () => {
    const user = userEvent.setup()
    renderStepper({ value: 4, disabled: true })

    await user.click(screen.getByRole('button', { name: 'Score 6, double bogey' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps every button at the minimum tap target', () => {
    renderStepper()
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('tap-target')
    }
  })

  it('names itself by hole so the control is announced in context', () => {
    renderStepper({ hole: 12, par: 3 })
    expect(screen.getByRole('region', { name: 'Your score for hole 12, par 3' })).toBeInTheDocument()
  })
})
