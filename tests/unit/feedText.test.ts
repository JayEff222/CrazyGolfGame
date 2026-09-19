import { describe, it, expect } from 'vitest'
import {
  UNKNOWN_CARD,
  UNKNOWN_PLAYER,
  nameIndex,
  relativeTime,
  titleIndex,
  toFeedLine,
  toFeedLines,
} from '../../src/features/cards/feedText'
import type { Card } from '../../src/lib/cards'
import type { PlayedCardEvent } from '../../src/lib/hands'
import type { RoundPlayer } from '../../src/lib/rounds'

/*
 * Events store uids and card ids. The feed must never show either — an id on a
 * phone screen tells nobody anything, and "undefined played undefined" is what
 * happens on the day someone leaves the group or a card gets deleted mid-round.
 */

const player = (uid: string, displayName: string): RoundPlayer => ({ uid, displayName, order: 0 })

const cardFixture = (id: string, title: string): Card => ({
  id,
  title,
  effect: 'Something chaotic happens.',
  category: 'attack',
  timing: 'tee',
  target: 'opponent',
  active: true,
})

const names = nameIndex([player('uid-jf', 'jayeff'), player('uid-dave', 'dave')])
const titles = titleIndex([cardFixture('no-look', 'No Look'), cardFixture('mulligan', 'Mulligan')])

const event = (overrides: Partial<PlayedCardEvent> = {}): PlayedCardEvent => ({
  id: 'event-1',
  type: 'card_played',
  actorUid: 'uid-jf',
  targetUid: 'uid-dave',
  holeNumber: 7,
  cardId: 'no-look',
  atMillis: 1_000_000,
  ...overrides,
})

describe('toFeedLine', () => {
  it('resolves uids to display names', () => {
    const line = toFeedLine(event(), names, titles)
    expect(line.actorName).toBe('jayeff')
    expect(line.targetName).toBe('dave')
  })

  it('resolves a card id to its title', () => {
    expect(toFeedLine(event(), names, titles).cardTitle).toBe('No Look')
  })

  it('names an unknown player rather than printing their uid', () => {
    const line = toFeedLine(event({ actorUid: 'uid-ghost' }), names, titles)
    expect(line.actorName).toBe(UNKNOWN_PLAYER)
    expect(line.actorName).not.toContain('uid-ghost')
  })

  it('names an unknown card rather than printing its id', () => {
    const line = toFeedLine(event({ cardId: 'deleted-card' }), names, titles)
    expect(line.cardTitle).toBe(UNKNOWN_CARD)
    expect(line.cardTitle).not.toContain('deleted-card')
  })

  it('treats a player with no display name as unknown, not as an empty string', () => {
    const line = toFeedLine(event(), nameIndex([player('uid-jf', '')]), titles)
    expect(line.actorName).toBe(UNKNOWN_PLAYER)
  })

  it('leaves the target out when a card targeted nobody', () => {
    expect(toFeedLine(event({ targetUid: null }), names, titles).targetName).toBeNull()
  })

  it('keeps the hole the card was played on', () => {
    expect(toFeedLine(event(), names, titles).holeNumber).toBe(7)
  })

  it('carries a round_started event with no card', () => {
    const line = toFeedLine(
      event({ type: 'round_started', cardId: null, targetUid: null, holeNumber: null }),
      names,
      titles,
    )
    expect(line.kind).toBe('round_started')
    expect(line.cardTitle).toBeNull()
    expect(line.actorName).toBe('jayeff')
  })

  it('does not invent a card title for a non-card event', () => {
    const line = toFeedLine(event({ type: 'round_completed' }), names, titles)
    expect(line.cardTitle).toBeNull()
  })

  it('handles a card play with no card id at all', () => {
    expect(toFeedLine(event({ cardId: null }), names, titles).cardTitle).toBe(UNKNOWN_CARD)
  })
})

describe('toFeedLines', () => {
  it('puts the newest first', () => {
    const lines = toFeedLines(
      [
        event({ id: 'old', atMillis: 1000 }),
        event({ id: 'new', atMillis: 3000 }),
        event({ id: 'middle', atMillis: 2000 }),
      ],
      names,
      titles,
    )
    expect(lines.map((l) => l.id)).toEqual(['new', 'middle', 'old'])
  })

  it('sorts an event with no timestamp to the bottom rather than the top', () => {
    const lines = toFeedLines(
      [event({ id: 'undated', atMillis: null }), event({ id: 'dated', atMillis: 1000 })],
      names,
      titles,
    )
    expect(lines.map((l) => l.id)).toEqual(['dated', 'undated'])
  })

  it('does not mutate the events it was given', () => {
    const events = [event({ id: 'a', atMillis: 1 }), event({ id: 'b', atMillis: 2 })]
    toFeedLines(events, names, titles)
    expect(events.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('returns nothing for an empty round', () => {
    expect(toFeedLines([], names, titles)).toEqual([])
  })
})

describe('relativeTime', () => {
  const now = 1_700_000_000_000

  it('says just now for something that has only just happened', () => {
    expect(relativeTime(now - 5_000, now)).toBe('just now')
  })

  it('counts in minutes', () => {
    expect(relativeTime(now - 2 * 60_000, now)).toBe('2 min ago')
  })

  it('rounds down rather than claiming more time has passed than has', () => {
    expect(relativeTime(now - 119_000, now)).toBe('1 min ago')
  })

  it('counts in hours once a round is under way', () => {
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 hr ago')
    expect(relativeTime(now - 3_600_000, now)).toBe('1 hr ago')
  })

  it('falls back to days for an old round', () => {
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe('yesterday')
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe('3 days ago')
  })

  it('reads a clock skewed into the future as the present', () => {
    expect(relativeTime(now + 60_000, now)).toBe('just now')
  })

  it('says nothing at all when an event has no timestamp', () => {
    expect(relativeTime(null, now)).toBe('')
  })
})
