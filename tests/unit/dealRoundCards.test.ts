import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dealRoundCards, summariseDeal } from '../../src/features/cards/dealRoundCards'
import type { Card } from '../../src/lib/cards'
import type { DealResult } from '../../src/lib/deal'
import type { Round, RoundPlayer, RoundSettings } from '../../src/lib/rounds'

/*
 * The deal is the one step in this game that cannot be undone. Once four people
 * have looked at their hands you cannot deal again without everybody knowing what
 * everybody else is holding — so the tests that matter here are "it refuses the
 * second time" and "it says so when the deck came up short", not the shuffling,
 * which is deal.ts's own tested problem.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

const { hasBeenDealt, writeDeal, loadCards } = vi.hoisted(() => ({
  hasBeenDealt: vi.fn<(roundId: string) => Promise<boolean>>(),
  writeDeal:
    vi.fn<(roundId: string, deal: import('../../src/lib/deal').DealResult) => Promise<void>>(),
  loadCards: vi.fn<() => Promise<import('../../src/lib/cards').Card[]>>(),
}))

vi.mock('../../src/lib/hands', () => ({ hasBeenDealt, writeDeal }))
vi.mock('../../src/lib/cardsData', () => ({ loadCards }))

const card = (id: string, overrides: Partial<Card> = {}): Card => ({
  id,
  title: id,
  effect: 'Something chaotic happens.',
  category: 'boost',
  timing: 'anytime',
  target: 'self',
  active: true,
  ...overrides,
})

const player = (uid: string, displayName: string, order: number): RoundPlayer => ({
  uid,
  displayName,
  order,
})

const players = [player('uid-jf', 'jayeff', 0), player('uid-dave', 'dave', 1)]

const round = (settings: Partial<RoundSettings> = {}): Round => ({
  id: 'round-1',
  courseId: 'trangie',
  teeId: 'mens',
  gameType: 'stroke',
  status: 'lobby',
  roomCode: 'QF7K',
  createdBy: 'uid-jf',
  settings: {
    cardVisibility: 'secret',
    dealMode: 'even',
    cardsPerPlayer: null,
    selectedCardIds: ['a', 'b', 'c', 'd'],
    ...settings,
  },
})

beforeEach(() => {
  hasBeenDealt.mockReset().mockResolvedValue(false)
  writeDeal.mockReset().mockResolvedValue(undefined)
  loadCards.mockReset().mockResolvedValue([card('a'), card('b'), card('c'), card('d')])
})

describe('dealRoundCards', () => {
  it('deals the selected cards and writes the hands', async () => {
    const outcome = await dealRoundCards(round(), players)

    expect(outcome.status).toBe('dealt')
    expect(writeDeal).toHaveBeenCalledTimes(1)

    const [roundId, deal] = writeDeal.mock.calls[0] as [string, DealResult]
    expect(roundId).toBe('round-1')
    expect(Object.keys(deal.hands).sort()).toEqual(['uid-dave', 'uid-jf'])
    expect(deal.hands['uid-jf']).toHaveLength(2)
    expect(deal.hands['uid-dave']).toHaveLength(2)
  })

  it('refuses to deal a round that already has hands', async () => {
    hasBeenDealt.mockResolvedValue(true)

    const outcome = await dealRoundCards(round(), players)

    expect(outcome).toEqual({ status: 'already-dealt' })
    expect(writeDeal).not.toHaveBeenCalled()
  })

  it('checks before reading the catalogue, so a second press costs one read', async () => {
    hasBeenDealt.mockResolvedValue(true)
    await dealRoundCards(round(), players)
    expect(loadCards).not.toHaveBeenCalled()
  })

  it('is safe to call twice — the second call deals nothing', async () => {
    // Exactly the shape of a host pressing Start twice on a slow connection.
    let dealt = false
    hasBeenDealt.mockImplementation(async () => dealt)
    writeDeal.mockImplementation(async () => {
      dealt = true
    })

    const first = await dealRoundCards(round(), players)
    const second = await dealRoundCards(round(), players)

    expect(first.status).toBe('dealt')
    expect(second.status).toBe('already-dealt')
    expect(writeDeal).toHaveBeenCalledTimes(1)
  })

  it('fails closed when it cannot prove the round is undealt', async () => {
    hasBeenDealt.mockRejectedValue(new Error('offline'))

    await expect(dealRoundCards(round(), players)).rejects.toThrow('offline')
    expect(writeDeal).not.toHaveBeenCalled()
  })

  it('reports a shortfall rather than swallowing it', async () => {
    loadCards.mockResolvedValue([card('a'), card('b'), card('c')])

    const outcome = await dealRoundCards(
      round({ dealMode: 'fixed', cardsPerPlayer: 3, selectedCardIds: ['a', 'b', 'c'] }),
      players,
    )

    expect(outcome.status).toBe('dealt')
    if (outcome.status !== 'dealt') return
    // Six cards asked for, three in the deck.
    expect(outcome.summary.shortfall).toBe(3)
    expect(outcome.summary.hands.map((h) => h.count)).toEqual([2, 1])
  })

  it('still deals when the deck is short — a short hand beats no round', async () => {
    loadCards.mockResolvedValue([card('a')])

    const outcome = await dealRoundCards(
      round({ dealMode: 'fixed', cardsPerPlayer: 2, selectedCardIds: ['a'] }),
      players,
    )

    expect(writeDeal).toHaveBeenCalledTimes(1)
    expect(outcome.status).toBe('dealt')
  })

  it('summarises hand sizes by name and counts the discards', async () => {
    loadCards.mockResolvedValue([card('a'), card('b'), card('c'), card('d'), card('e')])

    const outcome = await dealRoundCards(
      round({ selectedCardIds: ['a', 'b', 'c', 'd', 'e'] }),
      players,
    )

    expect(outcome.status).toBe('dealt')
    if (outcome.status !== 'dealt') return
    expect(outcome.summary.hands).toEqual([
      { uid: 'uid-jf', displayName: 'jayeff', count: 2 },
      { uid: 'uid-dave', displayName: 'dave', count: 2 },
    ])
    // Five cards, two players, even split — the odd one is discarded (§4.4).
    expect(outcome.summary.discarded).toBe(1)
    expect(outcome.summary.shortfall).toBe(0)
  })

  it('gives everyone the same hand in same mode', async () => {
    const outcome = await dealRoundCards(
      round({ dealMode: 'same', cardsPerPlayer: 2 }),
      players,
    )

    const [, deal] = writeDeal.mock.calls[0] as [string, DealResult]
    expect(deal.hands['uid-jf']).toEqual(deal.hands['uid-dave'])
    expect(outcome.status === 'dealt' && outcome.summary.mode).toBe('same')
  })

  it('deals nothing when no cards were selected — a straight round is legitimate', async () => {
    const outcome = await dealRoundCards(round({ selectedCardIds: [] }), players)

    expect(outcome).toEqual({ status: 'no-cards' })
    expect(loadCards).not.toHaveBeenCalled()
    expect(writeDeal).not.toHaveBeenCalled()
  })

  it('skips a selected card that has since been deactivated', async () => {
    loadCards.mockResolvedValue([card('a'), card('b', { active: false }), card('c'), card('d')])

    await dealRoundCards(round(), players)

    const [, deal] = writeDeal.mock.calls[0] as [string, DealResult]
    const allDealt = [...Object.values(deal.hands).flat(), ...deal.discarded]
    expect(allDealt).not.toContain('b')
    expect(allDealt.sort()).toEqual(['a', 'c', 'd'])
  })

  it('skips a selected card that has since been deleted from the catalogue', async () => {
    loadCards.mockResolvedValue([card('a'), card('c')])

    await dealRoundCards(round(), players)

    const [, deal] = writeDeal.mock.calls[0] as [string, DealResult]
    expect([...Object.values(deal.hands).flat(), ...deal.discarded].sort()).toEqual(['a', 'c'])
  })

  it('deals nothing when every selected card has gone', async () => {
    loadCards.mockResolvedValue([])

    const outcome = await dealRoundCards(round(), players)

    expect(outcome).toEqual({ status: 'no-cards' })
    expect(writeDeal).not.toHaveBeenCalled()
  })

  it('deals nothing when nobody is in the round', async () => {
    const outcome = await dealRoundCards(round(), [])

    expect(outcome).toEqual({ status: 'no-players' })
    expect(hasBeenDealt).not.toHaveBeenCalled()
    expect(writeDeal).not.toHaveBeenCalled()
  })

  it('lets a write failure reach the caller instead of claiming the cards are out', async () => {
    writeDeal.mockRejectedValue(new Error('permission-denied'))

    await expect(dealRoundCards(round(), players)).rejects.toThrow('permission-denied')
  })
})

describe('summariseDeal', () => {
  const result: DealResult = {
    hands: { 'uid-jf': ['a', 'b'], 'uid-dave': ['c'] },
    discarded: ['d'],
    shortfall: 1,
  }

  it('keeps the players in playing order', () => {
    expect(summariseDeal(result, players, 'even').hands.map((h) => h.displayName)).toEqual([
      'jayeff',
      'dave',
    ])
  })

  it('counts a player who was dealt nothing as zero rather than dropping them', () => {
    const summary = summariseDeal(
      { hands: { 'uid-jf': ['a'] }, discarded: [], shortfall: 1 },
      players,
      'fixed',
    )
    expect(summary.hands[1]).toEqual({ uid: 'uid-dave', displayName: 'dave', count: 0 })
  })

  it('never falls back to a raw uid for a nameless player', () => {
    const summary = summariseDeal(result, [player('uid-ghost', '', 0)], 'even')
    expect(summary.hands[0]?.displayName).toBe('Player')
  })
})
