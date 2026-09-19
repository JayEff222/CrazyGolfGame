import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HandPanel } from '../../src/features/cards/HandPanel'
import type { Card } from '../../src/lib/cards'
import { loadCards } from '../../src/lib/cardsData'
import {
  CardAlreadyPlayedError,
  playCard,
  subscribeAllHands,
  subscribeEvents,
  subscribeHand,
  type Hand,
  type HeldCard,
  type PlayedCardEvent,
} from '../../src/lib/hands'
import type { CardVisibility, RoundPlayer } from '../../src/lib/rounds'

/*
 * The hand screen is where the honour system either holds or falls over, so the
 * tests are about the rules in REQUIREMENTS §4.4 rather than about layout:
 *
 * - a spent card stays on screen and cannot be spent twice
 * - an attack card cannot go out without a name on it
 * - a secret round is actually secret, and a refused read says so
 * - nothing is ever blocked because of the hour, the hole or the card's timing
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/cardsData', () => ({ loadCards: vi.fn() }))

vi.mock('../../src/lib/hands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/hands')>()
  return {
    ...actual,
    subscribeHand: vi.fn(),
    subscribeAllHands: vi.fn(),
    subscribeEvents: vi.fn(),
    playCard: vi.fn(),
  }
})

const card = (overrides: Partial<Card> = {}): Card => ({
  id: 'mulligan',
  title: 'Mulligan',
  effect: 'Replay your last shot. The first one never happened.',
  category: 'boost',
  timing: 'after-shot',
  target: 'self',
  active: true,
  ...overrides,
})

const MULLIGAN = card()
const NO_LOOK = card({
  id: 'no-look',
  title: 'No Look',
  effect: 'They must hit their next shot with their eyes closed.',
  category: 'attack',
  timing: 'tee',
  target: 'opponent',
})
const NO_TAP_INS = card({
  id: 'no-tap-ins',
  title: 'No Tap-Ins',
  effect: 'Nothing is given on this green. Everyone holes out.',
  category: 'group',
  timing: 'green',
  target: 'everyone',
})

const DECK = [MULLIGAN, NO_LOOK, NO_TAP_INS]

const PLAYERS: RoundPlayer[] = [
  { uid: 'uid-jf', displayName: 'JF', order: 0 },
  { uid: 'uid-dave', displayName: 'Dave', order: 1 },
]

const heldCard = (cardId: string, overrides: Partial<HeldCard> = {}): HeldCard => ({
  cardId,
  status: 'held',
  ...overrides,
})

interface Options {
  readonly cards?: readonly HeldCard[]
  readonly visibility?: CardVisibility
  readonly others?: readonly Hand[]
  readonly handsError?: Error
  readonly holeNumber?: number
  readonly players?: readonly RoundPlayer[]
  readonly events?: readonly PlayedCardEvent[]
}

const renderHand = async (options: Options = {}) => {
  vi.mocked(subscribeHand).mockImplementation((_roundId, uid, onChange) => {
    onChange({ uid, cards: options.cards ?? [] })
    return vi.fn()
  })
  vi.mocked(subscribeAllHands).mockImplementation((_roundId, onChange, onError) => {
    if (options.handsError !== undefined) onError?.(options.handsError)
    else onChange([...(options.others ?? [])])
    return vi.fn()
  })
  vi.mocked(subscribeEvents).mockImplementation((_roundId, onChange) => {
    onChange([...(options.events ?? [])])
    return vi.fn()
  })

  const view = render(
    <HandPanel
      roundId="round-1"
      selfUid="uid-jf"
      holeNumber={options.holeNumber ?? 3}
      visibility={options.visibility ?? 'secret'}
      players={options.players ?? PLAYERS}
    />,
  )

  await waitFor(() => expect(screen.queryByText(/Looking at your hand/)).not.toBeInTheDocument())
  return view
}

beforeEach(() => {
  vi.mocked(loadCards).mockReset().mockResolvedValue(DECK)
  vi.mocked(playCard).mockReset().mockResolvedValue(undefined)
  vi.mocked(subscribeHand).mockReset()
  vi.mocked(subscribeAllHands).mockReset()
  vi.mocked(subscribeEvents).mockReset()
})

describe('HandPanel — your hand', () => {
  it('shows every card you hold, with the rule on it', async () => {
    await renderHand({ cards: [heldCard('mulligan'), heldCard('no-look')] })

    expect(screen.getByText('Mulligan')).toBeInTheDocument()
    expect(screen.getByText(/Replay your last shot/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play No Look' })).toBeEnabled()
  })

  it('says so when you were dealt nothing', async () => {
    await renderHand({ cards: [] })
    expect(screen.getByText(/You have no cards this round/)).toBeInTheDocument()
  })

  it('shows a card still in a hand after it left the catalogue, without a play button', async () => {
    vi.mocked(loadCards).mockResolvedValue([])
    await renderHand({ cards: [heldCard('mulligan')] })

    expect(screen.getByText(/no longer in the catalogue/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play mulligan' })).toBeDisabled()
  })
})

describe('HandPanel — a played card', () => {
  const spent: HeldCard = {
    cardId: 'no-look',
    status: 'played',
    playedOnHole: 7,
    targetUid: 'uid-dave',
    playedAtMillis: Date.UTC(2026, 8, 19, 3, 14),
  }

  it('stays visible and is disabled, never removed', async () => {
    await renderHand({ cards: [spent] })

    expect(screen.getByText('No Look')).toBeInTheDocument()
    expect(screen.getByText(/eyes closed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No Look already played' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Play No Look' })).not.toBeInTheDocument()
  })

  it('says who it was played on and which hole', async () => {
    await renderHand({ cards: [spent] })
    expect(screen.getByText(/Played on hole 7/)).toHaveTextContent('Dave')
  })

  it('names the whole group for a card that hits everyone', async () => {
    await renderHand({
      cards: [{ cardId: 'no-tap-ins', status: 'played', playedOnHole: 2 }],
    })
    expect(screen.getByText(/Played on hole 2/)).toHaveTextContent('the whole group')
  })

  it('counts what is left against what is gone', async () => {
    await renderHand({ cards: [heldCard('mulligan'), spent] })
    expect(screen.getByText('1 to play · 1 played')).toBeInTheDocument()
  })
})

describe('HandPanel — playing a card', () => {
  it('does not spend the card until it is confirmed', async () => {
    const user = userEvent.setup()
    await renderHand({ cards: [heldCard('mulligan')] })

    await user.click(screen.getByRole('button', { name: 'Play Mulligan' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(playCard).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(playCard).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('plays a card on yourself without asking for a target', async () => {
    const user = userEvent.setup()
    await renderHand({ cards: [heldCard('mulligan')], holeNumber: 12 })

    await user.click(screen.getByRole('button', { name: 'Play Mulligan' }))
    await user.click(screen.getByRole('button', { name: 'Play it on hole 12' }))

    expect(playCard).toHaveBeenCalledWith(
      'round-1',
      expect.objectContaining({ uid: 'uid-jf' }),
      'mulligan',
      { holeNumber: 12, targetUid: undefined },
    )
  })

  it('plays a card on everyone without asking for a target', async () => {
    const user = userEvent.setup()
    await renderHand({ cards: [heldCard('no-tap-ins')] })

    await user.click(screen.getByRole('button', { name: 'Play No Tap-Ins' }))
    await user.click(screen.getByRole('button', { name: /Play it on hole/ }))

    expect(playCard).toHaveBeenCalledWith(
      'round-1',
      expect.anything(),
      'no-tap-ins',
      expect.objectContaining({ targetUid: undefined }),
    )
  })

  it('refuses to send an opponent card out with nobody named', async () => {
    const user = userEvent.setup()
    await renderHand({ cards: [heldCard('no-look')] })

    await user.click(screen.getByRole('button', { name: 'Play No Look' }))

    const confirm = screen.getByRole('button', { name: /Play it on hole/ })
    expect(confirm).toBeDisabled()
    await user.click(confirm)
    expect(playCard).not.toHaveBeenCalled()
    expect(screen.getByText(/Pick who it lands on first/)).toBeInTheDocument()
  })

  it('plays an opponent card once a target is chosen', async () => {
    const user = userEvent.setup()
    await renderHand({ cards: [heldCard('no-look')], holeNumber: 5 })

    await user.click(screen.getByRole('button', { name: 'Play No Look' }))
    await user.click(screen.getByRole('button', { name: 'Dave' }))

    const confirm = screen.getByRole('button', { name: 'Play it on hole 5' })
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(playCard).toHaveBeenCalledWith('round-1', expect.anything(), 'no-look', {
      holeNumber: 5,
      targetUid: 'uid-dave',
    })
  })

  it('never offers you as your own target', async () => {
    const user = userEvent.setup()
    await renderHand({ cards: [heldCard('no-look')] })

    await user.click(screen.getByRole('button', { name: 'Play No Look' }))
    expect(screen.getByRole('button', { name: 'Dave' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'JF' })).not.toBeInTheDocument()
  })

  it('reports a card someone already spent instead of pretending it worked', async () => {
    const user = userEvent.setup()
    vi.mocked(playCard).mockRejectedValue(new CardAlreadyPlayedError('mulligan'))
    await renderHand({ cards: [heldCard('mulligan')] })

    await user.click(screen.getByRole('button', { name: 'Play Mulligan' }))
    await user.click(screen.getByRole('button', { name: /Play it on hole/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Mulligan has already been played.')
  })

  it('reports a refused write', async () => {
    const user = userEvent.setup()
    vi.mocked(playCard).mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: 'permission-denied' }),
    )
    await renderHand({ cards: [heldCard('mulligan')] })

    await user.click(screen.getByRole('button', { name: 'Play Mulligan' }))
    await user.click(screen.getByRole('button', { name: /Play it on hole/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/only play cards out of your own/)
  })
})

describe('HandPanel — timing is never enforced (§4.4)', () => {
  it('plays a green-only card standing on the tee of hole 1', async () => {
    const user = userEvent.setup()
    await renderHand({ cards: [heldCard('no-tap-ins')], holeNumber: 1 })

    const play = screen.getByRole('button', { name: 'Play No Tap-Ins' })
    expect(play).toBeEnabled()

    await user.click(play)
    await user.click(screen.getByRole('button', { name: 'Play it on hole 1' }))

    expect(playCard).toHaveBeenCalledWith(
      'round-1',
      expect.anything(),
      'no-tap-ins',
      expect.objectContaining({ holeNumber: 1 }),
    )
  })

  it('plays a tee-only card on a later hole, retroactively', async () => {
    const user = userEvent.setup()
    await renderHand({ cards: [heldCard('no-look')], holeNumber: 16 })

    await user.click(screen.getByRole('button', { name: 'Play No Look' }))
    await user.click(screen.getByRole('button', { name: 'Dave' }))
    await user.click(screen.getByRole('button', { name: 'Play it on hole 16' }))

    expect(playCard).toHaveBeenCalledWith(
      'round-1',
      expect.anything(),
      'no-look',
      expect.objectContaining({ holeNumber: 16 }),
    )
  })

  it('states the timing as the card’s own rule, not as the app’s', async () => {
    const user = userEvent.setup()
    await renderHand({ cards: [heldCard('no-tap-ins')] })

    await user.click(screen.getByRole('button', { name: 'Play No Tap-Ins' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Stated timing: On the green.')
    expect(dialog).toHaveTextContent(/the app does not enforce it/)
  })
})

describe('HandPanel — unplayed cards persist (T-7.6)', () => {
  it('keeps a held card through hole changes, never discarding it', async () => {
    const { rerender } = await renderHand({ cards: [heldCard('mulligan')], holeNumber: 1 })

    for (const hole of [2, 9, 18]) {
      rerender(
        <HandPanel
          roundId="round-1"
          selfUid="uid-jf"
          holeNumber={hole}
          visibility="secret"
          players={PLAYERS}
        />,
      )
      expect(screen.getByRole('button', { name: 'Play Mulligan' })).toBeEnabled()
    }

    expect(playCard).not.toHaveBeenCalled()
    expect(screen.getByText(/stay in your hand to the end of the round/)).toBeInTheDocument()
  })
})

describe('HandPanel — hand visibility (T-7.2)', () => {
  const daveHand: Hand = {
    uid: 'uid-dave',
    cards: [
      heldCard('no-look'),
      { cardId: 'mulligan', status: 'played', playedOnHole: 4, targetUid: 'uid-dave' },
    ],
  }

  it('shows only your own hand on a secret round, and does not even ask for the others', async () => {
    await renderHand({ cards: [heldCard('mulligan')], visibility: 'secret', others: [daveHand] })

    expect(subscribeAllHands).not.toHaveBeenCalled()
    expect(screen.getByText(/Hands are secret this round/)).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Everyone else’s cards/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('No Look')).not.toBeInTheDocument()
  })

  it('shows everyone’s hand on an open round', async () => {
    await renderHand({ cards: [], visibility: 'open', others: [daveHand] })

    expect(screen.getByRole('heading', { name: /Everyone else’s cards/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dave' })).toBeInTheDocument()
    expect(screen.getByText('No Look')).toBeInTheDocument()
    expect(screen.getByText(/Played on hole 4/)).toBeInTheDocument()
  })

  it('never offers a play button on someone else’s card', async () => {
    await renderHand({ cards: [], visibility: 'open', others: [daveHand] })
    expect(screen.queryByRole('button', { name: /^Play / })).not.toBeInTheDocument()
  })

  it('handles a refused read of the other hands instead of showing nothing', async () => {
    await renderHand({
      cards: [heldCard('mulligan')],
      visibility: 'open',
      handsError: Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      }),
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Other hands are hidden')
    // Your own hand survives the refusal — it comes off its own listener.
    expect(screen.getByRole('button', { name: 'Play Mulligan' })).toBeEnabled()
  })

  it('reports a failure to read the other hands that is not a refusal', async () => {
    await renderHand({
      cards: [],
      visibility: 'open',
      handsError: Object.assign(new Error('unavailable'), { code: 'unavailable' }),
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/Check your signal/)
  })
})
