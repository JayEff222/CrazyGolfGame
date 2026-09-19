import { describe, it, expect } from 'vitest'
import { dealCards, shuffle, seededRandom, previewHandSize } from '../../src/lib/deal'

/*
 * Dealing cannot be redone - once four people have seen their hands you cannot
 * re-deal without everyone knowing what everyone else held. So these test the
 * properties that must hold for any deal, not just one lucky arrangement.
 */

const cards = (n: number) => Array.from({ length: n }, (_, i) => `card-${i + 1}`)
const players = ['jf', 'dave', 'sam']

const fixedRandom = () => seededRandom(42)

describe('shuffle', () => {
  it('keeps every item', () => {
    const input = cards(20)
    const out = shuffle(input, fixedRandom())
    expect([...out].sort()).toEqual([...input].sort())
  })

  it('does not mutate the input', () => {
    const input = cards(5)
    const copy = [...input]
    shuffle(input, fixedRandom())
    expect(input).toEqual(copy)
  })

  it('is reproducible from the same seed', () => {
    expect(shuffle(cards(20), seededRandom(7))).toEqual(shuffle(cards(20), seededRandom(7)))
  })

  it('actually reorders', () => {
    const input = cards(20)
    expect(shuffle(input, seededRandom(7))).not.toEqual(input)
  })

  it('handles empty and single-item lists', () => {
    expect(shuffle([], fixedRandom())).toEqual([])
    expect(shuffle(['only'], fixedRandom())).toEqual(['only'])
  })
})

describe('dealCards — even split', () => {
  it('gives everyone the same number of cards', () => {
    const result = dealCards({
      cardIds: cards(9),
      playerUids: players,
      mode: 'even',
      cardsPerPlayer: null,
      random: fixedRandom(),
    })
    expect(Object.values(result.hands).map((h) => h.length)).toEqual([3, 3, 3])
  })

  it('discards the remainder rather than giving someone an extra', () => {
    // 20 cards among 3 players: 6 each, 2 left over. REQUIREMENTS §4.4.
    const result = dealCards({
      cardIds: cards(20),
      playerUids: players,
      mode: 'even',
      cardsPerPlayer: null,
      random: fixedRandom(),
    })
    expect(Object.values(result.hands).map((h) => h.length)).toEqual([6, 6, 6])
    expect(result.discarded).toHaveLength(2)
  })

  it('never deals the same card to two players', () => {
    const result = dealCards({
      cardIds: cards(20),
      playerUids: players,
      mode: 'even',
      cardsPerPlayer: null,
      random: fixedRandom(),
    })
    const dealt = Object.values(result.hands).flat()
    expect(new Set(dealt).size).toBe(dealt.length)
  })

  it('accounts for every card — dealt plus discarded equals the deck', () => {
    const deck = cards(20)
    const result = dealCards({
      cardIds: deck,
      playerUids: players,
      mode: 'even',
      cardsPerPlayer: null,
      random: fixedRandom(),
    })
    const all = [...Object.values(result.hands).flat(), ...result.discarded]
    expect(all.sort()).toEqual([...deck].sort())
  })

  it('gives nobody anything when there are fewer cards than players', () => {
    const result = dealCards({
      cardIds: cards(2),
      playerUids: players,
      mode: 'even',
      cardsPerPlayer: null,
      random: fixedRandom(),
    })
    expect(Object.values(result.hands).every((h) => h.length === 0)).toBe(true)
    expect(result.discarded).toHaveLength(2)
  })
})

describe('dealCards — fixed number each', () => {
  it('gives exactly the number asked for', () => {
    const result = dealCards({
      cardIds: cards(20),
      playerUids: players,
      mode: 'fixed',
      cardsPerPlayer: 4,
      random: fixedRandom(),
    })
    expect(Object.values(result.hands).map((h) => h.length)).toEqual([4, 4, 4])
    expect(result.discarded).toHaveLength(8)
  })

  it('reports a shortfall instead of failing on the first tee', () => {
    const result = dealCards({
      cardIds: cards(5),
      playerUids: players,
      mode: 'fixed',
      cardsPerPlayer: 4,
      random: fixedRandom(),
    })
    // 12 wanted, 5 available.
    expect(result.shortfall).toBe(7)
    expect(Object.values(result.hands).flat()).toHaveLength(5)
  })

  it('runs short fairly — nobody loses a whole hand while others are full', () => {
    const result = dealCards({
      cardIds: cards(5),
      playerUids: players,
      mode: 'fixed',
      cardsPerPlayer: 4,
      random: fixedRandom(),
    })
    const sizes = Object.values(result.hands).map((h) => h.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
  })

  it('treats zero cards each as a straight round', () => {
    const result = dealCards({
      cardIds: cards(20),
      playerUids: players,
      mode: 'fixed',
      cardsPerPlayer: 0,
      random: fixedRandom(),
    })
    expect(Object.values(result.hands).every((h) => h.length === 0)).toBe(true)
    expect(result.discarded).toHaveLength(20)
  })
})

describe('dealCards — everyone the same', () => {
  it('gives every player an identical hand', () => {
    const result = dealCards({
      cardIds: cards(20),
      playerUids: players,
      mode: 'same',
      cardsPerPlayer: 5,
      random: fixedRandom(),
    })
    const hands = Object.values(result.hands)
    expect(hands.every((h) => h.length === 5)).toBe(true)
    for (const hand of hands) expect(hand).toEqual(hands[0])
  })

  it('gives everyone the whole deck when no size is set', () => {
    const result = dealCards({
      cardIds: cards(6),
      playerUids: players,
      mode: 'same',
      cardsPerPlayer: null,
      random: fixedRandom(),
    })
    expect(Object.values(result.hands).every((h) => h.length === 6)).toBe(true)
    expect(result.discarded).toEqual([])
  })

  it('hands out copies, so one player playing a card cannot empty everyone', () => {
    const result = dealCards({
      cardIds: cards(6),
      playerUids: players,
      mode: 'same',
      cardsPerPlayer: 3,
      random: fixedRandom(),
    })
    result.hands.jf!.pop()
    expect(result.hands.dave).toHaveLength(3)
  })
})

describe('dealCards — edge cases that must not throw on a first tee', () => {
  it('handles no cards selected — a straight round is legitimate', () => {
    const result = dealCards({
      cardIds: [],
      playerUids: players,
      mode: 'even',
      cardsPerPlayer: null,
      random: fixedRandom(),
    })
    expect(result.hands).toEqual({ jf: [], dave: [], sam: [] })
    expect(result.shortfall).toBe(0)
  })

  it('handles no players', () => {
    const result = dealCards({
      cardIds: cards(5),
      playerUids: [],
      mode: 'even',
      cardsPerPlayer: null,
      random: fixedRandom(),
    })
    expect(result.hands).toEqual({})
    expect(result.discarded).toHaveLength(5)
  })

  it('handles a two-player round', () => {
    const result = dealCards({
      cardIds: cards(20),
      playerUids: ['jf', 'dave'],
      mode: 'even',
      cardsPerPlayer: null,
      random: fixedRandom(),
    })
    expect(Object.values(result.hands).map((h) => h.length)).toEqual([10, 10])
  })

  it('handles a four-player round with the real 20-card deck', () => {
    const result = dealCards({
      cardIds: cards(20),
      playerUids: ['jf', 'dave', 'sam', 'pat'],
      mode: 'even',
      cardsPerPlayer: null,
      random: fixedRandom(),
    })
    expect(Object.values(result.hands).map((h) => h.length)).toEqual([5, 5, 5, 5])
    expect(result.discarded).toEqual([])
  })

  it('is reproducible from a seed, so a deal can be replayed in a test', () => {
    const args = {
      cardIds: cards(20),
      playerUids: players,
      mode: 'even' as const,
      cardsPerPlayer: null,
    }
    const a = dealCards({ ...args, random: seededRandom(99) })
    const b = dealCards({ ...args, random: seededRandom(99) })
    expect(a).toEqual(b)
  })

  it('produces different deals from different seeds', () => {
    const args = {
      cardIds: cards(20),
      playerUids: players,
      mode: 'even' as const,
      cardsPerPlayer: null,
    }
    expect(dealCards({ ...args, random: seededRandom(1) })).not.toEqual(
      dealCards({ ...args, random: seededRandom(2) }),
    )
  })
})

describe('previewHandSize', () => {
  it('matches what an even split actually deals', () => {
    expect(previewHandSize(20, 3, 'even', null)).toBe(6)
    expect(previewHandSize(20, 4, 'even', null)).toBe(5)
  })

  it('matches a fixed deal', () => {
    expect(previewHandSize(20, 4, 'fixed', 3)).toBe(3)
  })

  it('does not promise more than the deck can give', () => {
    expect(previewHandSize(6, 4, 'fixed', 5)).toBe(1)
  })

  it('matches an everyone-the-same deal', () => {
    expect(previewHandSize(20, 4, 'same', 5)).toBe(5)
    expect(previewHandSize(6, 4, 'same', null)).toBe(6)
  })

  it('is zero when there is nothing to deal', () => {
    expect(previewHandSize(0, 4, 'even', null)).toBe(0)
    expect(previewHandSize(20, 0, 'even', null)).toBe(0)
  })
})
