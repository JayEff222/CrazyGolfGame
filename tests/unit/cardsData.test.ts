import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cardSchema } from '../../src/lib/cards'

/*
 * The notes bug, pinned down.
 *
 * Firestore cannot store `undefined`, so an absent optional field comes back as
 * `null` — and zod's `.optional()` means "may be undefined", not "may be null".
 * The catalogue reader then skipped anything that failed to parse, silently. Net
 * effect: 8 of the 20 starter cards vanished from the app, and the in-app editor
 * ate every card written with the notes box left blank.
 *
 * Two things have to stay true to keep that fixed: a stored null must parse, and
 * a card that cannot be read must be reported rather than dropped.
 */

const { getDocs } = vi.hoisted(() => ({ getDocs: vi.fn() }))

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDocs,
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => '__DELETE__'),
  serverTimestamp: vi.fn(() => '__NOW__'),
}))

const { loadCatalogue, loadCards } = await import('../../src/lib/cardsData')

/** A card as Firestore hands it back: no id field, absent optionals as null. */
const stored = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  data: () => ({
    title: `Card ${id}`,
    effect: 'Spell the rule out properly so three people can agree on it.',
    category: 'boost',
    timing: 'anytime',
    target: 'self',
    active: true,
    notes: null,
    ...overrides,
  }),
})

beforeEach(() => {
  getDocs.mockReset()
})

describe('the notes field', () => {
  it('rejects null on the raw schema — this is the bug', () => {
    // Kept as a test so nobody "tidies" the normalisation away believing zod
    // tolerates null. It does not.
    const parsed = cardSchema.safeParse({
      id: 'a',
      title: 'A',
      effect: 'Spell the rule out properly so three people can agree on it.',
      category: 'boost',
      timing: 'anytime',
      target: 'self',
      active: true,
      notes: null,
    })
    expect(parsed.success).toBe(false)
  })
})

describe('loadCatalogue', () => {
  it('reads a card whose notes are stored as null', async () => {
    getDocs.mockResolvedValue({ docs: [stored('mulligan')] })

    const { cards, skipped } = await loadCatalogue()

    expect(skipped).toEqual([])
    expect(cards).toHaveLength(1)
    expect(cards[0]!.id).toBe('mulligan')
    expect(cards[0]!.notes).toBeUndefined()
  })

  it('keeps real notes intact', async () => {
    getDocs.mockResolvedValue({ docs: [stored('gimme', { notes: 'Inside the leather.' })] })

    const { cards } = await loadCatalogue()
    expect(cards[0]!.notes).toBe('Inside the leather.')
  })

  it('returns every card when half of them have no notes', async () => {
    // The exact shape of the reported bug: 12 with notes, 8 without, 12 showing.
    const withNotes = Array.from({ length: 12 }, (_, i) => stored(`with-${i}`, { notes: 'x' }))
    const without = Array.from({ length: 8 }, (_, i) => stored(`without-${i}`))
    getDocs.mockResolvedValue({ docs: [...withNotes, ...without] })

    const { cards, skipped } = await loadCatalogue()

    expect(cards).toHaveLength(20)
    expect(skipped).toEqual([])
  })

  it('reports a genuinely malformed card instead of dropping it silently', async () => {
    getDocs.mockResolvedValue({
      docs: [stored('good'), stored('broken', { category: 'not-a-category' })],
    })

    const { cards, skipped } = await loadCatalogue()

    expect(cards.map((c) => c.id)).toEqual(['good'])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]!.id).toBe('broken')
    expect(skipped[0]!.reason).toContain('category')
  })

  it('sorts by title so the deck reads the same way every time', async () => {
    getDocs.mockResolvedValue({
      docs: [stored('b', { title: 'Zebra' }), stored('a', { title: 'Albatross' })],
    })

    const { cards } = await loadCatalogue()
    expect(cards.map((c) => c.title)).toEqual(['Albatross', 'Zebra'])
  })
})

describe('loadCards', () => {
  it('still hands back a plain list for callers that cannot act on a bad card', async () => {
    getDocs.mockResolvedValue({ docs: [stored('a'), stored('b')] })
    expect(await loadCards()).toHaveLength(2)
  })
})
