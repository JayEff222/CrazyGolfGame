import { describe, it, expect } from 'vitest'
import {
  EMPTY_DRAFT,
  allowedTargets,
  toDraft,
  validateDraft,
  withCategory,
  type CardDraft,
} from '../../src/features/cards/cardDraft'
import type { Card } from '../../src/lib/cards'

/*
 * The coupling between category, target and timing is the fiddly part: get it
 * wrong and you produce a card that saves fine but cannot be played. These pin
 * down every combination the editor can reach.
 */

const draft = (overrides: Partial<CardDraft> = {}): CardDraft => ({
  ...EMPTY_DRAFT,
  title: 'Test Card',
  effect: 'Make the player do something specific and clearly described.',
  ...overrides,
})

describe('withCategory', () => {
  it('forces an attack to target an opponent', () => {
    expect(withCategory(draft({ target: 'self' }), 'attack').target).toBe('opponent')
  })

  it('forces a group card to hit everyone', () => {
    expect(withCategory(draft({ target: 'self' }), 'group').target).toBe('everyone')
  })

  it('forces a reaction card to be played in response', () => {
    const next = withCategory(draft({ timing: 'tee' }), 'defence')
    expect(next.timing).toBe('response')
    expect(next.target).toBe('opponent')
  })

  it('leaves a boost pointing at whoever it was already pointing at', () => {
    expect(withCategory(draft({ target: 'opponent' }), 'boost').target).toBe('opponent')
  })

  it('rescues a boost stranded on "everyone" by a previous category', () => {
    // Going group -> boost would otherwise leave an unplayable combination.
    expect(withCategory(draft({ target: 'everyone' }), 'boost').target).toBe('self')
  })

  it('keeps the rest of the draft untouched', () => {
    const original = draft({ title: 'Mirror', notes: 'keep me' })
    const next = withCategory(original, 'group')
    expect(next.title).toBe('Mirror')
    expect(next.notes).toBe('keep me')
  })
})

describe('allowedTargets', () => {
  it('offers no choice where the category decides it', () => {
    expect(allowedTargets('attack')).toEqual(['opponent'])
    expect(allowedTargets('group')).toEqual(['everyone'])
    expect(allowedTargets('defence')).toEqual(['opponent'])
  })

  it('lets a boost help you or somebody else', () => {
    expect(allowedTargets('boost')).toEqual(['self', 'opponent'])
  })
})

describe('validateDraft', () => {
  it('accepts a well-formed card', () => {
    const result = validateDraft(draft())
    expect(result.ok).toBe(true)
  })

  it('derives an id from the title for a new card', () => {
    const result = validateDraft(draft({ title: "Caddie's Choice" }))
    expect(result.ok && result.card.id).toBe('caddie-s-choice')
  })

  it('keeps the existing id when editing', () => {
    const result = validateDraft(draft({ id: 'mulligan', title: 'Mulligan Deluxe' }))
    expect(result.ok && result.card.id).toBe('mulligan')
  })

  it('refuses a nameless card', () => {
    const result = validateDraft(draft({ title: '  ' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]?.field).toBe('title')
  })

  it('refuses a name that would not fit on a phone', () => {
    const result = validateDraft(draft({ title: 'x'.repeat(41) }))
    expect(result.ok).toBe(false)
  })

  it('refuses a card with no rule', () => {
    const result = validateDraft(draft({ effect: '' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.some((p) => p.field === 'effect')).toBe(true)
  })

  it('refuses a rule too short to settle an argument', () => {
    // Cards are honour-system: the text IS the mechanism.
    const result = validateDraft(draft({ effect: 'Do a thing.' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]?.message).toMatch(/Spell the rule out/)
  })

  it('refuses a duplicate name on a new card', () => {
    const result = validateDraft(draft({ title: 'Mulligan' }), ['mulligan'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems[0]?.message).toMatch(/already a card/)
  })

  it('allows an existing card to keep its own id', () => {
    const result = validateDraft(draft({ id: 'mulligan', title: 'Mulligan' }), ['mulligan'])
    expect(result.ok).toBe(true)
  })

  it('refuses an attack that targets nobody', () => {
    const result = validateDraft(draft({ category: 'attack', target: 'self' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.some((p) => p.field === 'target')).toBe(true)
  })

  it('refuses a group card that does not hit everyone', () => {
    const result = validateDraft(draft({ category: 'group', target: 'self' }))
    expect(result.ok).toBe(false)
  })

  it('refuses a reaction card playable out of turn', () => {
    const result = validateDraft(
      draft({ category: 'defence', target: 'opponent', timing: 'tee' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.some((p) => p.field === 'timing')).toBe(true)
  })

  it('trims whitespace rather than storing it', () => {
    const result = validateDraft(
      draft({ title: '  Mulligan  ', effect: '  Replay your last shot, it never happened.  ' }),
    )
    expect(result.ok && result.card.title).toBe('Mulligan')
    expect(result.ok && result.card.effect).toBe('Replay your last shot, it never happened.')
  })

  it('drops an empty note instead of storing a blank string', () => {
    const result = validateDraft(draft({ notes: '   ' }))
    expect(result.ok && result.card.notes).toBeUndefined()
  })

  it('keeps a real note', () => {
    const result = validateDraft(draft({ notes: 'Devastating on a par 5.' }))
    expect(result.ok && result.card.notes).toBe('Devastating on a par 5.')
  })

  it('refuses a title with nothing usable in it', () => {
    const result = validateDraft(draft({ title: '!!!' }))
    expect(result.ok).toBe(false)
  })

  it('reports every problem at once, not just the first', () => {
    const result = validateDraft(draft({ title: '', effect: '', category: 'attack', target: 'self' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.length).toBeGreaterThanOrEqual(3)
  })
})

describe('toDraft', () => {
  it('round-trips a stored card', () => {
    const card: Card = {
      id: 'mirror',
      title: 'Mirror',
      effect: 'Reflect a card straight back at whoever played it, exactly as written.',
      category: 'defence',
      timing: 'response',
      target: 'opponent',
      active: true,
      notes: 'Can be mirrored again.',
    }
    const result = validateDraft(toDraft(card))
    expect(result.ok && result.card).toEqual(card)
  })

  it('turns a missing note into an empty field rather than undefined', () => {
    const card: Card = {
      id: 'x',
      title: 'X',
      effect: 'A rule long enough to pass validation comfortably.',
      category: 'boost',
      timing: 'anytime',
      target: 'self',
      active: true,
    }
    expect(toDraft(card).notes).toBe('')
  })
})
