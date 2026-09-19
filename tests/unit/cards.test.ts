import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  cardSchema,
  validateDeck,
  CARD_TIMING_LABEL,
  CARD_CATEGORY_LABEL,
  type Card,
} from '../../src/lib/cards'

const starterDeck = JSON.parse(readFileSync('data/cards/starter-deck.json', 'utf8')) as unknown

const card = (overrides: Partial<Card> = {}): Card => ({
  id: 'test-card',
  title: 'Test Card',
  effect: 'Do a thing.',
  category: 'boost',
  timing: 'anytime',
  target: 'self',
  active: true,
  ...overrides,
})

describe('the starter deck', () => {
  it('is valid', () => {
    const result = validateDeck(starterDeck)
    if (!result.ok) console.error(result.problems)
    expect(result.ok).toBe(true)
  })

  it('has 20 cards', () => {
    const result = validateDeck(starterDeck)
    expect(result.ok && result.deck.cards).toHaveLength(20)
  })

  it('has no duplicate ids', () => {
    const result = validateDeck(starterDeck)
    if (!result.ok) throw new Error('deck invalid')
    const ids = result.deck.cards.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no duplicate titles — two cards with the same name is unplayable', () => {
    const result = validateDeck(starterDeck)
    if (!result.ok) throw new Error('deck invalid')
    const titles = result.deck.cards.map((c) => c.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('covers every category, so a deal is never all one flavour', () => {
    const result = validateDeck(starterDeck)
    if (!result.ok) throw new Error('deck invalid')
    const categories = new Set(result.deck.cards.map((c) => c.category))
    expect(categories).toEqual(new Set(['boost', 'attack', 'defence', 'group']))
  })

  it('starts with every card active', () => {
    const result = validateDeck(starterDeck)
    if (!result.ok) throw new Error('deck invalid')
    expect(result.deck.cards.every((c) => c.active)).toBe(true)
  })

  it('spells out the rule on every card — the text is the mechanism', () => {
    const result = validateDeck(starterDeck)
    if (!result.ok) throw new Error('deck invalid')
    for (const c of result.deck.cards) {
      // Anything shorter than this is not a rule three people can agree on.
      expect(c.effect.length, c.title).toBeGreaterThan(30)
    }
  })

  it('has at least enough cards to deal four players five each', () => {
    const result = validateDeck(starterDeck)
    expect(result.ok && result.deck.cards.length).toBeGreaterThanOrEqual(20)
  })
})

describe('validateDeck', () => {
  it('rejects an attack that does not target an opponent', () => {
    const result = validateDeck({
      version: 1,
      cards: [card({ category: 'attack', target: 'self' })],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.join()).toMatch(/does not target an opponent/)
  })

  it('rejects a group card that does not target everyone', () => {
    const result = validateDeck({
      version: 1,
      cards: [card({ category: 'group', target: 'opponent' })],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a defence card that is not played in response', () => {
    const result = validateDeck({
      version: 1,
      cards: [card({ category: 'defence', timing: 'anytime', target: 'opponent' })],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.join()).toMatch(/not played in response/)
  })

  it('rejects duplicate ids', () => {
    const result = validateDeck({ version: 1, cards: [card(), card()] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.join()).toMatch(/duplicate card id/)
  })

  it('rejects an empty deck', () => {
    expect(validateDeck({ version: 1, cards: [] }).ok).toBe(false)
  })

  it('reports every problem at once rather than stopping at the first', () => {
    const result = validateDeck({
      version: 1,
      cards: [
        card({ id: 'a', category: 'attack', target: 'self' }),
        card({ id: 'b', category: 'group', target: 'self' }),
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.length).toBeGreaterThanOrEqual(2)
  })
})

describe('card schema', () => {
  it('rejects a title too long for a phone screen', () => {
    expect(cardSchema.safeParse(card({ title: 'x'.repeat(41) })).success).toBe(false)
  })

  it('rejects an empty effect', () => {
    expect(cardSchema.safeParse(card({ effect: '' })).success).toBe(false)
  })

  it('rejects an unknown timing', () => {
    expect(cardSchema.safeParse({ ...card(), timing: 'whenever' }).success).toBe(false)
  })
})

describe('labels', () => {
  it('names every timing, so the editor never shows a raw enum', () => {
    for (const key of Object.keys(CARD_TIMING_LABEL)) {
      expect(CARD_TIMING_LABEL[key as keyof typeof CARD_TIMING_LABEL]).toBeTruthy()
    }
  })

  it('names every category', () => {
    for (const key of Object.keys(CARD_CATEGORY_LABEL)) {
      expect(CARD_CATEGORY_LABEL[key as keyof typeof CARD_CATEGORY_LABEL]).toBeTruthy()
    }
  })
})
