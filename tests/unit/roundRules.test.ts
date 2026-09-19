import { describe, it, expect, vi } from 'vitest'
import type { Round, RoundPlayer, RoundStatus } from '../../src/lib/rounds'
import {
  buildSettings,
  checkRoomCode,
  clampCardsPerPlayer,
  decideJoin,
  decideStart,
  describeSettings,
  describeTee,
} from '../../src/features/rounds/roundRules'

// The rules need the real MIN/MAX/ROOM_CODE_LENGTH out of src/lib/rounds, but not
// a Firebase connection to get them.
vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

const round = (overrides: Partial<Round> = {}): Round => ({
  id: 'round-1',
  courseId: 'trangie',
  teeId: 'mens',
  gameType: 'stroke',
  status: 'lobby' satisfies RoundStatus,
  roomCode: 'QF7K',
  createdBy: 'uid-jf',
  settings: { cardVisibility: 'secret', dealMode: 'even', cardsPerPlayer: null, selectedCardIds: [] },
  ...overrides,
})

const players = (...uids: string[]): RoundPlayer[] =>
  uids.map((uid, index) => ({ uid, displayName: uid, order: index }))

describe('checkRoomCode', () => {
  it('asks for a code when nothing was typed', () => {
    expect(checkRoomCode('   ')).toEqual({ ok: false, message: 'Enter the 4-character room code.' })
  })

  it('rejects a code that is not four characters', () => {
    expect(checkRoomCode('QF7')).toEqual({ ok: false, message: 'Room codes are 4 characters.' })
  })

  it('accepts a code however it was typed', () => {
    expect(checkRoomCode(' qf7k ')).toEqual({ ok: true, code: 'QF7K' })
    expect(checkRoomCode('q f7k')).toEqual({ ok: true, code: 'QF7K' })
  })
})

describe('decideJoin', () => {
  it('blocks an unknown code', () => {
    const decision = decideJoin(null, [], 'uid-dave')
    expect(decision.kind).toBe('blocked')
    expect(decision).toHaveProperty('message', expect.stringContaining('No round with that code'))
  })

  it('blocks a full round', () => {
    const decision = decideJoin(round(), players('a', 'b', 'c', 'd'), 'uid-dave')
    expect(decision).toEqual({ kind: 'blocked', message: 'That round is full — 4 players is the limit.' })
  })

  it('blocks a stranger joining a round that has already started', () => {
    const decision = decideJoin(round({ status: 'in-progress' }), players('a', 'b'), 'uid-dave')
    expect(decision.kind).toBe('blocked')
    expect(decision).toHaveProperty('message', expect.stringContaining('already started'))
  })

  it('blocks a finished round even for someone who played it', () => {
    const decision = decideJoin(round({ status: 'complete' }), players('uid-dave'), 'uid-dave')
    expect(decision).toEqual({ kind: 'blocked', message: 'That round is already finished.' })
  })

  it('lets a player back into a round that started without their phone', () => {
    const decision = decideJoin(round({ status: 'in-progress' }), players('a', 'uid-dave'), 'uid-dave')
    expect(decision).toEqual({ kind: 'rejoin' })
  })

  it('lets a player back in even when the round is at its four-player cap', () => {
    const decision = decideJoin(round(), players('a', 'b', 'c', 'uid-dave'), 'uid-dave')
    expect(decision).toEqual({ kind: 'rejoin' })
  })

  it('admits a new player when there is room', () => {
    expect(decideJoin(round(), players('a', 'b', 'c'), 'uid-dave')).toEqual({ kind: 'join' })
  })
})

describe('decideStart', () => {
  it('lets the player who set the round up start it', () => {
    expect(decideStart(round(), players('uid-jf', 'b'), 'uid-jf')).toEqual({ ok: true })
  })

  it('refuses anyone who did not set it up', () => {
    expect(decideStart(round(), players('uid-jf', 'uid-dave'), 'uid-dave')).toEqual({
      ok: false,
      reason: 'Only the player who set this round up can start it.',
    })
  })

  it('refuses a round with nobody to play against', () => {
    expect(decideStart(round(), players('uid-jf'), 'uid-jf')).toEqual({
      ok: false,
      reason: 'Waiting for players — 1 in, 2 needed.',
    })
  })

  it('refuses a round that is already under way', () => {
    expect(decideStart(round({ status: 'in-progress' }), players('uid-jf', 'b'), 'uid-jf')).toEqual({
      ok: false,
      reason: 'This round has already started.',
    })
  })

  it('refuses more players than the cap', () => {
    expect(decideStart(round(), players('uid-jf', 'b', 'c', 'd', 'e'), 'uid-jf')).toEqual({
      ok: false,
      reason: 'Too many players — 4 is the limit.',
    })
  })
})

describe('card settings', () => {
  it('keeps cards-per-player inside its bounds', () => {
    expect(clampCardsPerPlayer(0)).toBe(1)
    expect(clampCardsPerPlayer(99)).toBe(10)
    expect(clampCardsPerPlayer(2.4)).toBe(2)
    expect(clampCardsPerPlayer(Number.NaN)).toBe(3)
  })

  it('only stores a card count for the fixed deal mode', () => {
    expect(
      buildSettings({ cardVisibility: 'open', dealMode: 'fixed', cardsPerPlayer: 5 }),
    ).toEqual({ cardVisibility: 'open', dealMode: 'fixed', cardsPerPlayer: 5, selectedCardIds: [] })

    expect(
      buildSettings({ cardVisibility: 'secret', dealMode: 'even', cardsPerPlayer: 5 }),
    ).toEqual({ cardVisibility: 'secret', dealMode: 'even', cardsPerPlayer: null, selectedCardIds: [] })
  })

  it('creates a round with no deck selected — choosing cards is a later phase', () => {
    expect(buildSettings({ cardVisibility: 'secret', dealMode: 'same', cardsPerPlayer: 3 }).selectedCardIds).toEqual([])
  })

  it('describes settings in words a player would use', () => {
    expect(
      describeSettings({
        cardVisibility: 'open',
        dealMode: 'fixed',
        cardsPerPlayer: 4,
        selectedCardIds: [],
      }),
    ).toEqual(['Open hands', '4 cards each'])
    expect(describeTee('ladies')).toBe('Ladies’ tees')
  })
})
